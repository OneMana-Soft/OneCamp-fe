// Hands and feedback in a call (CALLS-3a): the dock raises and lowers your
// hand, and H does too; the People panel puts raised hands first with their
// place and lets whoever runs the call lower them; the hook reads your hand
// from the server's attribute and asks the server, lazily, to change it; and
// the server's "hand lowered" is told to you in words.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor, within } from "@testing-library/react"
import { ParticipantKind } from "livekit-client"

vi.mock("@/hooks/use-toast", () => ({ toast: vi.fn(), useToast: () => ({ toast: vi.fn() }) }))
vi.mock("@/hooks/useClientConfig", () => ({ FEATURE_AI: "ai", useFeature: () => true }))
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: false, isDesktop: true, isTablet: false }) }))
const lp = { setMicrophoneEnabled: vi.fn(() => Promise.resolve()), setCameraEnabled: vi.fn(() => Promise.resolve()), setScreenShareEnabled: vi.fn(() => Promise.resolve()) }
vi.mock("@livekit/components-react", () => ({
  useRoomContext: () => ({ disconnect: vi.fn() }),
  useLocalParticipant: () => ({ localParticipant: lp, isMicrophoneEnabled: false, isCameraEnabled: false, isScreenShareEnabled: false }),
  useMediaDeviceSelect: () => ({ devices: [], activeDeviceId: "", setActiveMediaDevice: vi.fn() }),
}))
const runner = { toggleHand: vi.fn(), setFeedback: vi.fn(), lowerWhenSpoken: vi.fn(() => () => {}) }
vi.mock("./handsRunner", () => runner)

import { VideoControls } from "./VideoControls"
import { peopleOf } from "./callPeople"
import CallPeoplePanel from "./CallPeoplePanel"
import { useHands } from "./useHands"
import { controlNotice, readControlPacket } from "./callState"
import { partOf } from "@/lib/calls/control"
import { HAND_ATTRIBUTE } from "@/lib/calls/handsCore"

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe("the dock's hand", () => {
  it("raises and lowers your hand, from the button, the H key and the phone's More menu", async () => {
    const toggle = vi.fn()
    const { rerender } = render(<VideoControls onDisconnect={() => {}} hand={{ raised: false, onToggle: toggle }} />)
    const raise = screen.getByRole("button", { name: "Raise your hand" })
    expect(raise).toHaveAttribute("aria-pressed", "false")
    fireEvent.click(raise)
    await act(async () => fireEvent.keyDown(window, { key: "h" }))
    expect(toggle).toHaveBeenCalledTimes(2)
    rerender(<VideoControls onDisconnect={() => {}} hand={{ raised: true, onToggle: toggle }} />)
    expect(screen.getByRole("button", { name: "Lower your hand" })).toHaveAttribute("aria-pressed", "true")
    fireEvent.keyDown(screen.getByRole("button", { name: "More call options" }), { key: "Enter" })
    fireEvent.click(screen.getByRole("menuitem", { name: "Lower your hand" }))
    expect(toggle).toHaveBeenCalledTimes(3)
  })

  it("isn't there where you can't raise one", () => {
    render(<VideoControls onDisconnect={() => {}} />)
    expect(screen.queryByRole("button", { name: "Raise your hand" })).toBeNull()
  })
})

const person = (identity: string, name: string, attributes: Record<string, string> = {}, over: Record<string, unknown> = {}) => ({
  identity,
  name,
  isLocal: false,
  isMicrophoneEnabled: true,
  isCameraEnabled: true,
  kind: ParticipantKind.STANDARD,
  attributes,
  ...over,
})

describe("the People panel's queue", () => {
  const rows = peopleOf([
    person("sam", "Sam Rivera", {}, { isLocal: true }),
    person("jo", "Jo Park", { [HAND_ATTRIBUTE]: "200" }),
    person("ana", "Ana Ruiz", { [HAND_ATTRIBUTE]: "100", "oc.feedback": "slow_down" }),
    person("lee", "Lee Hall"),
  ] as never)

  it("lists raised hands first, in the order they went up, each with its place; then you; then the rest", () => {
    expect(rows.map((r) => r.identity)).toEqual(["ana", "jo", "sam", "lee"])
    render(<CallPeoplePanel people={rows} onClose={vi.fn()} />)
    const list = screen.getAllByRole("listitem")
    expect(list.map((li) => li.querySelector("[data-hand-badge]")?.getAttribute("data-hand-badge") ?? null)).toEqual(["1", "2", null, null])
    expect(within(list[0]).getByText("Slow down")).toBeTruthy()
    expect(within(list[0]).getByText(/next to speak/)).toBeTruthy()
  })

  it("gives whoever may lower hands Lower all hands, and nobody else", () => {
    const onAction = vi.fn()
    const host = { ...partOf({ "oc.role": "host", "oc.can": "lower_hands" }), identity: "sam" }
    render(<CallPeoplePanel people={rows} onClose={vi.fn()} me={host} onAction={onAction} />)
    fireEvent.click(screen.getByRole("button", { name: "Lower all hands" }))
    expect(onAction).toHaveBeenCalledWith(expect.objectContaining({ action: "lower_all_hands" }))
    cleanup()
    const participant = { ...partOf({ "oc.role": "participant", "oc.can": "" }), identity: "sam" }
    render(<CallPeoplePanel people={rows} onClose={vi.fn()} me={participant} onAction={onAction} />)
    expect(screen.queryByRole("button", { name: "Lower all hands" })).toBeNull()
  })
})

describe("useHands", () => {
  const me = () => {
    const handlers = new Map<string, () => void>()
    return {
      attributes: {} as Record<string, string>,
      isSpeaking: false,
      on: (e: string, f: () => void) => handlers.set(e, f),
      off: (e: string) => handlers.delete(e),
      fire: (e: string) => handlers.get(e)?.(),
    }
  }

  beforeEach(() => vi.clearAllMocks())

  it("reads your hand from the server's attribute, and asks the server to change it", async () => {
    const p = me()
    const asker = { sessionId: "s1" }
    const { result } = renderHook(() => useHands(p as never, asker))
    expect(result.current.raisedAt).toBeNull()
    act(() => result.current.toggleHand?.())
    await waitFor(() => expect(runner.toggleHand).toHaveBeenCalledWith(asker, false))
    p.attributes = { [HAND_ATTRIBUTE]: "1760900000123" }
    act(() => p.fire("attributesChanged"))
    expect(result.current.raisedAt).toBe(1760900000123)
    // A raised hand starts the watch that lowers it once you've spoken.
    await waitFor(() => expect(runner.lowerWhenSpoken).toHaveBeenCalledWith(asker, p, 1760900000123))
  })

  it("asks through a guest's own call token", async () => {
    const p = me()
    const asker = { callToken: "tok" }
    const { result } = renderHook(() => useHands(p as never, asker))
    act(() => result.current.setFeedback?.("away"))
    await waitFor(() => expect(runner.setFeedback).toHaveBeenCalledWith(asker, "away"))
  })

  it("offers nothing without a way to reach the server", () => {
    const p = me()
    const { result } = renderHook(() => useHands(p as never, undefined))
    expect(result.current.toggleHand).toBeUndefined()
    expect(result.current.setFeedback).toBeUndefined()
  })
})

describe("the server's hand_lowered", () => {
  const packet = (m: object) => new TextEncoder().encode(JSON.stringify(m))
  it("is said in words, one hand or everyone's, and only from the server", () => {
    expect(controlNotice(readControlPacket(packet({ t: "hand_lowered", by: "Sam" }), undefined)!)).toEqual({ title: "Sam lowered your hand" })
    expect(controlNotice(readControlPacket(packet({ t: "hand_lowered", by: "Sam", reason: "all" }), undefined)!)).toEqual({ title: "Sam lowered everyone's hands" })
    expect(readControlPacket(packet({ t: "hand_lowered" }), { identity: "ana" })).toBeNull()
  })
})
