// A call's picture-in-picture from the dock (meet-14), as Meet's: the call in
// a small window of its own over other tabs and apps, with the picture you'd
// look for and the controls you reach for then. Where the browser can only
// pop out a <video>, the focus's own picture goes; where it has neither, the
// control says why.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react"

const toast = vi.fn()
vi.mock("@/hooks/use-toast", () => ({ toast: (...a: unknown[]) => toast(...a), useToast: () => ({ toast }) }))
vi.mock("@/hooks/useClientConfig", () => ({ FEATURE_AI: "ai", useFeature: () => true }))
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: false, isDesktop: true, isTablet: false }) }))

type Person = { identity: string; lastSpokeAt?: Date }
const YOU = "sam-1"
const lp = {
  identity: YOU,
  setMicrophoneEnabled: vi.fn(() => Promise.resolve()),
  setCameraEnabled: vi.fn(() => Promise.resolve()),
  setScreenShareEnabled: vi.fn(() => Promise.resolve()),
}
/** Everyone else in the call, in the call's order. */
let others: Person[] = []
const room = {
  disconnect: vi.fn(),
  localParticipant: lp,
  get remoteParticipants() {
    return new Map(others.map((p) => [p.identity, p]))
  },
}
vi.mock("@livekit/components-react", () => ({
  useRoomContext: () => room,
  useLocalParticipant: () => ({ localParticipant: lp, isMicrophoneEnabled: false, isCameraEnabled: false, isScreenShareEnabled: false }),
  useMediaDeviceSelect: () => ({ devices: [], activeDeviceId: "", setActiveMediaDevice: vi.fn() }),
  useTracks: () => [lp, ...others].map((participant) => ({ participant, source: "camera" })),
  useSpeakingParticipants: () => [],
}))
// The window draws the call's own tile (StageTile); here, whose it is.
vi.mock("./StageTile", () => ({
  StageTile: ({ trackRef }: { trackRef: { participant: Person; source: string } }) => <div data-pip-tile={`${trackRef.participant.identity}|${trackRef.source}`} />,
}))

import { VideoControls } from "./VideoControls"
import { heldReason } from "./callHolds"
import { CALL_PIP_SIZE } from "@/lib/calls/callPip"
import type { CallHold } from "@/lib/calls/holds"

/**
 * A stand-in for the browser's Document Picture-in-Picture: each window is a
 * window of its own (a frame's, so its controls can be found by role), and
 * closing it fires pagehide, as the browser's does.
 */
function fakeDocumentPip(refuse = false) {
  const opened: Window[] = []
  const requestWindow = vi.fn(async () => {
    if (refuse) throw new DOMException("no tap to open it from", "NotAllowedError")
    const frame = document.createElement("iframe")
    document.body.appendChild(frame)
    const win = frame.contentWindow!
    Object.defineProperty(win, "close", { value: vi.fn(() => win.dispatchEvent(new Event("pagehide"))), configurable: true })
    opened.push(win)
    return win
  })
  Object.defineProperty(window, "documentPictureInPicture", { value: { requestWindow, window: null }, configurable: true })
  return { requestWindow, opened }
}

/** A stage tile as StageTile draws it, with its picture playing or none at all (a camera that's off). */
function stageTile(key: string, playing: boolean) {
  const tile = document.createElement("div")
  tile.dataset.flipKey = key
  const video = document.createElement("video")
  Object.defineProperty(video, "readyState", { value: 4 })
  const requestPictureInPicture = vi.fn(() => Promise.resolve())
  Object.defineProperty(video, "requestPictureInPicture", { value: requestPictureInPicture })
  if (playing) tile.appendChild(video)
  document.body.appendChild(tile)
  return { requestPictureInPicture }
}

const tileIn = (win: Window) => win.document.querySelector("[data-pip-tile]")?.getAttribute("data-pip-tile")

async function openFromDock() {
  const control = screen.queryByRole("button", { name: "Picture-in-picture" })
  expect(control, "the dock offers picture-in-picture").not.toBeNull()
  await act(async () => fireEvent.click(control!))
}

beforeEach(() => {
  others = [{ identity: "priya-1" }]
})
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  delete (window as unknown as { documentPictureInPicture?: unknown }).documentPictureInPicture
  for (const k of ["pictureInPictureEnabled", "pictureInPictureElement"]) delete (document as unknown as Record<string, unknown>)[k]
  delete (navigator as unknown as { mediaSession?: unknown }).mediaSession
  document.querySelectorAll("[data-flip-key], iframe").forEach((el) => el.remove())
})

describe("meet-14: the call in a window of its own, from the dock", () => {
  it("opens one at the call's size, with the person you'd look for and the dock's own switches", async () => {
    const pip = fakeDocumentPip()
    const leave = vi.fn()
    render(<VideoControls onDisconnect={leave} />)
    await openFromDock()
    expect(pip.requestWindow).toHaveBeenCalledWith(CALL_PIP_SIZE)
    const win = pip.opened[0]
    // No one has spoken yet: the first other person, never you.
    expect(win && tileIn(win)).toBe("priya-1|camera")
    const controls = within(win.document.body).getByRole("toolbar", { name: "Call controls" })
    await act(async () => fireEvent.click(within(controls).getByRole("button", { name: "Unmute" })))
    expect(lp.setMicrophoneEnabled).toHaveBeenCalledWith(true)
    await act(async () => fireEvent.click(within(controls).getByRole("button", { name: "Turn camera on" })))
    expect(lp.setCameraEnabled).toHaveBeenCalledWith(true)
    fireEvent.click(within(controls).getByRole("button", { name: "Leave call" }))
    expect(leave).toHaveBeenCalledTimes(1)
  })

  it("shows whoever spoke last, never you", async () => {
    const pip = fakeDocumentPip()
    others = [{ identity: "priya-1", lastSpokeAt: new Date(Date.now() - 60_000) }, { identity: "ben-1", lastSpokeAt: new Date() }]
    render(<VideoControls onDisconnect={() => {}} />)
    await openFromDock()
    expect(pip.opened[0] && tileIn(pip.opened[0])).toBe("ben-1|camera")
  })

  it("closes from the dock, and from its own Back to the call", async () => {
    const pip = fakeDocumentPip()
    const focus = vi.spyOn(window, "focus").mockImplementation(() => {})
    render(<VideoControls onDisconnect={() => {}} />)
    await openFromDock()
    const close = screen.queryByRole("button", { name: "Close picture-in-picture" })
    expect(close, "the dock's control closes it while it's open").not.toBeNull()
    expect(close).toHaveAttribute("aria-pressed", "true")
    act(() => void fireEvent.click(close!))
    expect(pip.opened[0].close).toHaveBeenCalledTimes(1)
    await openFromDock()
    act(() => void fireEvent.click(within(pip.opened[1].document.body).getByRole("button", { name: "Back to the call" })))
    expect(pip.opened[1].close).toHaveBeenCalledTimes(1)
    expect(focus).toHaveBeenCalled()
    expect(screen.queryByRole("button", { name: "Picture-in-picture" })).not.toBeNull()
    focus.mockRestore()
  })

  it("keeps a held microphone dimmed there too, and says why", async () => {
    const pip = fakeDocumentPip()
    render(<VideoControls onDisconnect={() => {}} held={new Set<CallHold>(["microphone"])} />)
    await openFromDock()
    const unmute = within(pip.opened[0].document.body).getByRole("button", { name: "Unmute" })
    expect(unmute).toHaveAttribute("aria-disabled", "true")
    expect(unmute).toHaveAttribute("title", heldReason("microphone"))
    await act(async () => fireEvent.click(unmute))
    expect(lp.setMicrophoneEnabled).not.toHaveBeenCalled()
  })

  it("offers it in a phone's More menu too", async () => {
    const pip = fakeDocumentPip()
    render(<VideoControls onDisconnect={() => {}} />)
    fireEvent.keyDown(screen.getByRole("button", { name: "More call options" }), { key: "Enter" })
    const row = screen.queryByRole("menuitem", { name: "Picture-in-picture" })
    expect(row, "More offers picture-in-picture").not.toBeNull()
    await act(async () => fireEvent.click(row!))
    expect(pip.requestWindow).toHaveBeenCalledTimes(1)
  })

  it("lets Chrome open it when you leave the tab mid-call, as Meet's does", async () => {
    const pip = fakeDocumentPip()
    const handlers = new Map<string, (() => void) | null>()
    Object.defineProperty(navigator, "mediaSession", { value: { setActionHandler: (a: string, h: (() => void) | null) => handlers.set(a, h) }, configurable: true })
    const { unmount } = render(<VideoControls onDisconnect={() => {}} />)
    await act(async () => handlers.get("enterpictureinpicture")?.())
    expect(pip.requestWindow).toHaveBeenCalledWith(CALL_PIP_SIZE)
    unmount()
    expect(handlers.get("enterpictureinpicture")).toBeNull()
  })

  it("says so when the browser won't open one", async () => {
    fakeDocumentPip(true)
    render(<VideoControls onDisconnect={() => {}} />)
    await openFromDock()
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Picture-in-picture didn't open" }))
  })
})

describe("meet-14 where the browser can only pop out a video (Safari)", () => {
  beforeEach(() => Object.defineProperty(document, "pictureInPictureEnabled", { value: true, configurable: true }))

  it("pops out the first picture that is playing: Priya's camera is off, so yours", async () => {
    stageTile("priya-1|camera", false)
    const yours = stageTile(`${YOU}|camera`, true)
    render(<VideoControls onDisconnect={() => {}} />)
    await openFromDock()
    expect(yours.requestPictureInPicture).toHaveBeenCalledTimes(1)
  })

  it("says so when no one's picture is playing", async () => {
    stageTile("priya-1|camera", false)
    render(<VideoControls onDisconnect={() => {}} />)
    await openFromDock()
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "No picture to pop out" }))
  })
})

describe("meet-14 where the browser has no picture-in-picture (Firefox)", () => {
  it("dims the control on the wide dock and in More, and says why", async () => {
    render(<VideoControls onDisconnect={() => {}} />)
    const control = screen.queryByRole("button", { name: "Picture-in-picture" })
    expect(control, "the dock keeps the control, dimmed").not.toBeNull()
    expect(control).toHaveAttribute("aria-disabled", "true")
    await act(async () => fireEvent.click(control!))
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Picture-in-picture isn't available in this browser" }))
    fireEvent.keyDown(screen.getByRole("button", { name: "More call options" }), { key: "Enter" })
    const row = document.querySelector("[data-pip-unavailable]")
    expect(row, "More says why too").not.toBeNull()
    expect(row).toHaveAttribute("data-disabled")
    expect(row!.textContent).toContain("Not available in this browser")
  })
})
