import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react"

vi.mock("@livekit/components-react", () => ({
  useIsMuted: () => true,
  useMediaDeviceSelect: () => ({ devices: [], activeDeviceId: "", setActiveMediaDevice: vi.fn() }),
  useMaybeRoomContext: () => undefined,
}))
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: false, isDesktop: true, isTablet: false }) }))
vi.mock("@/lib/calls/onePeerConnection", () => ({ onePeerConnection: async () => false }))
vi.mock("@/lib/calls/processors/backdrops", () => ({ backdropUrl: async (id: string) => `blob:${id}` }))
vi.mock("@/lib/calls/processors/background", () => ({ backgroundUnavailable: async () => null, applyBackground: async () => undefined }))
vi.mock("@/hooks/useClientConfig", () => ({ FEATURE_AI: "ai", useFeature: () => false }))
// Join warms the call's chunk; nothing here loads it.
vi.mock("@/components/livekit/LazyCall", () => ({ warmCall: vi.fn() }))

import { MemberCallEnd, MemberPreJoin, inElsewhere, useMemberCallLifecycle, type MemberLifecycle } from "@/components/livekit/LazyCompanion"
import { CallDock } from "@/components/livekit/VideoControls"
import { readRemovalPacket } from "@/components/livekit/callState"
import { fakeMedia } from "@/lib/testing/fakeMedia"

// Companion mode, present only and Switch here (meet-04). The server decides
// who may have another device in a call (POST /calls/{sid}/companion-token);
// the web offers it only while a call is going on, to a member, and says the
// server's refusal in its own words (the lifecycle's join error).

// The preview's camera never answers here; no screen to share unless a test gives one.
beforeEach(() => void fakeMedia("never"))
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const OFFERS = { timeout: 5000 }

describe("the green room's other ways in", () => {
  it("Switch here when you're in the call on another device", async () => {
    const onJoin = vi.fn()
    render(<MemberPreJoin onJoin={onJoin} username="Maya Chen" live companion={{ elsewhere: true, onJoin: vi.fn() }} />)
    const here = screen.getByRole("button", { name: "Switch here" })
    expect(await screen.findByText(/You're in this call on another device/, undefined, OFFERS)).toBeTruthy()
    fireEvent.click(here)
    // The person's own join: the server moves them, and the other device is told.
    expect(onJoin).toHaveBeenCalledTimes(1)
  })

  it("Join as a companion while a call is going on", async () => {
    const join = vi.fn()
    render(<MemberPreJoin onJoin={() => {}} username="Maya Chen" live companion={{ elsewhere: false, onJoin: join }} />)
    expect(screen.getByRole("button", { name: "Join now" })).toBeTruthy()
    fireEvent.click(await screen.findByRole("button", { name: "Join as a companion" }, OFFERS))
    expect(join).toHaveBeenCalledWith({ mode: "companion" })
  })

  it("Present only only where getDisplayMedia exists and a call is going on", async () => {
    const stream = { getTracks: () => [] } as unknown as MediaStream
    const getDisplayMedia = vi.fn(async () => stream)
    Object.assign(navigator.mediaDevices, { getDisplayMedia })
    const join = vi.fn()
    const { rerender } = render(<MemberPreJoin onJoin={() => {}} username="Maya Chen" live companion={{ elsewhere: false, onJoin: join }} />)
    // The picker opens in the press itself: a browser asks for the gesture.
    await act(async () => fireEvent.click(await screen.findByRole("button", { name: "Present only" }, OFFERS)))
    expect(getDisplayMedia).toHaveBeenCalledTimes(1)
    expect(join).toHaveBeenCalledWith({ mode: "present", screen: stream })
    // No call going on: nothing to accompany.
    rerender(<MemberPreJoin onJoin={() => {}} username="Maya Chen" companion={{ elsewhere: false, onJoin: join }} />)
    expect(screen.queryByRole("button", { name: "Present only" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Join as a companion" })).toBeNull()
  })

  it("no Present only where the browser can't share a screen (a phone)", async () => {
    render(<MemberPreJoin onJoin={() => {}} username="Maya Chen" live companion={{ elsewhere: false, onJoin: vi.fn() }} />)
    expect(await screen.findByRole("button", { name: "Join as a companion" }, OFFERS)).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Present only" })).toBeNull()
  })

  it("no other ways in for a guest, or where no call is going on", async () => {
    render(<MemberPreJoin onJoin={() => {}} username="Priya" live />)
    await new Promise((r) => setTimeout(r, 50))
    expect(screen.queryByRole("button", { name: "Join as a companion" })).toBeNull()
    expect(screen.getByRole("button", { name: "Join now" })).toBeTruthy()
  })
})

const moved = (over: Partial<MemberLifecycle> = {}) =>
  ({ phase: "left", end: { moved: true }, minutes: 3, retry: vi.fn(), reset: vi.fn(), switchBack: vi.fn(), ...over }) as Pick<
    MemberLifecycle,
    "phase" | "end" | "minutes" | "retry" | "reset" | "switchBack"
  >

describe("the moved screen", () => {
  it("says the call moved to your other device, and joins nothing by itself", async () => {
    const call = moved()
    const companion = vi.fn()
    render(<MemberCallEnd call={call} companion={companion} onBack={() => {}} />)
    expect(await screen.findByRole("heading", { name: "This call moved to your other device" }, OFFERS)).toBeTruthy()
    expect(call.retry).not.toHaveBeenCalled()
    expect(call.switchBack).not.toHaveBeenCalled()
    expect(call.reset).not.toHaveBeenCalled()
    expect(companion).not.toHaveBeenCalled()
  })

  it("offers Use here as a companion and Switch back, its actions in a footer of their own", async () => {
    const call = moved()
    const companion = vi.fn()
    render(<MemberCallEnd call={call} companion={companion} onBack={() => {}} />)
    const use = await screen.findByRole("button", { name: "Use here as a companion" }, OFFERS)
    expect(use.closest("[data-moved-actions]")).toBeTruthy()
    fireEvent.click(use)
    expect(companion).toHaveBeenCalledWith({ mode: "companion" })
    fireEvent.click(screen.getByRole("button", { name: "Switch back" }))
    expect(call.switchBack).toHaveBeenCalledTimes(1)
    expect(call.retry).not.toHaveBeenCalled()
  })

  it("without a call to accompany, Switch back alone", async () => {
    render(<MemberCallEnd call={moved()} onBack={() => {}} />)
    expect(await screen.findByRole("button", { name: "Switch back" }, OFFERS)).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Use here as a companion" })).toBeNull()
  })
})

describe("a companion put out", () => {
  it("went_to_room says the companion stayed with the call's own room, and joins as a companion again", async () => {
    const packet = new TextEncoder().encode(JSON.stringify({ v: 1, t: "removed", reason: "went_to_room" }))
    const removal = readRemovalPacket(packet, undefined)
    expect(removal).toEqual({ reason: "went_to_room" })
    const call = moved({ phase: "removed", end: { removed: removal! } })
    render(<MemberCallEnd call={call} companion={vi.fn()} onBack={() => {}} />)
    expect(await screen.findByRole("heading", { name: "You went to a breakout room" }, OFFERS)).toBeTruthy()
    expect(screen.getByText("This device was with you as a companion, and a companion stays in the call's main room. Join as a companion again when you're back.")).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Use here as a companion" })).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Join as a companion again" }))
    expect(call.retry).toHaveBeenCalledTimes(1)
    expect(call.switchBack).not.toHaveBeenCalled()
  })

  it("present-only held: the hold's words, and the way in", async () => {
    const call = moved({ phase: "removed", end: { removed: { reason: "share_held" } } })
    render(<MemberCallEnd call={call} onBack={() => {}} />)
    expect(await screen.findByRole("heading", { name: "Screen sharing is off in this call" }, OFFERS)).toBeTruthy()
    expect(screen.getByText("The people running the call have turned off screen sharing, so you can't present without joining. Join the call to ask them.")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Join the call" }))
    expect(call.reset).toHaveBeenCalledTimes(1)
    expect(call.retry).not.toHaveBeenCalled()
  })

  it("anyone else put out keeps the shared end screen", () => {
    render(<MemberCallEnd call={moved({ phase: "removed", end: { removed: { reason: "host" } } })} companion={vi.fn()} onBack={() => {}} />)
    expect(screen.getByText("You were removed from the call")).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Join as a companion again" })).toBeNull()
  })

  it("you're in the call elsewhere only when the server's read names your account in it", () => {
    const people = [
      { identity: "0x1a2b", user_uuid: "u-maya", in_call: true },
      { identity: "0x3c4d", user_uuid: "u-jonas", in_call: false },
    ]
    expect(inElsewhere(people, "u-maya")).toBe(true)
    expect(inElsewhere(people, "u-jonas")).toBe(false)
    expect(inElsewhere([], "u-maya")).toBe(false)
    expect(inElsewhere(undefined, "u-maya")).toBe(false)
    expect(inElsewhere(people, undefined)).toBe(false)
  })
})

describe("a companion's dock", () => {
  it("has no microphone or camera, and keeps Share, Chat and Leave", () => {
    const { container } = render(
      <CallDock micOn={false} cameraOn={false} companion onToggleMic={() => {}} onToggleCamera={() => {}} onToggleShare={() => {}} onDisconnect={() => {}} onChatToggle={() => {}} />,
    )
    const labels = Array.from(container.querySelectorAll("[data-call-dock] button[aria-label]")).map((el) => el.getAttribute("aria-label"))
    expect(labels).not.toContain("Unmute")
    expect(labels).not.toContain("Turn camera on")
    expect(labels).toEqual(expect.arrayContaining(["Share screen", "Chat", "Leave call"]))
  })
})

/** A track the browser has open. */
function liveTrack(): MediaStreamTrack {
  const track = { readyState: "live", stop: vi.fn(() => void (track.readyState = "ended")) }
  return track as unknown as MediaStreamTrack
}
const streamOf = (t: MediaStreamTrack) => ({ getTracks: () => [t] }) as unknown as MediaStream

// A member page's lifecycle (useMemberCallLifecycle): the shared one stays as
// it was for guests; the companion's token, Switch back and present only's
// screen are the member hook's.
describe("a member's call with another device", () => {
  it("ends on the moved screen when the call went to another device, and joins nothing by itself", async () => {
    const mint = vi.fn(async () => "token")
    const { result } = renderHook(() => useMemberCallLifecycle(mint))
    act(() => result.current.join({ audioEnabled: true, videoEnabled: true }))
    await waitFor(() => expect(result.current.phase).toBe("in-call"))
    act(() => result.current.onConnected())
    act(() => result.current.onDisconnect({ moved: true }))
    expect(result.current.phase).toBe("left")
    expect(result.current.end).toEqual({ moved: true })
    expect(result.current.token).toBe("")
    await new Promise((r) => setTimeout(r, 20))
    expect(mint).toHaveBeenCalledTimes(1)
    expect(result.current.phase).toBe("left")
  })

  it("Switch back joins as themselves the way they last did, even after this device was a companion", async () => {
    const person = vi.fn(async () => "person")
    const companion = vi.fn(async () => "companion")
    const { result } = renderHook(() => useMemberCallLifecycle(person))
    act(() => result.current.join({ audioEnabled: true, videoEnabled: false }))
    await waitFor(() => expect(result.current.phase).toBe("in-call"))
    act(() => result.current.onConnected())
    act(() => result.current.onDisconnect({ moved: true }))
    act(() => result.current.switchBack())
    await waitFor(() => expect(result.current.phase).toBe("in-call"))
    expect(person).toHaveBeenCalledTimes(2)
    expect(result.current.choice).toMatchObject({ audio: true, video: false })
    // Use here as a companion, then the call moves again: Switch back is the person's join.
    act(() => result.current.onDisconnect({ moved: true }))
    act(() => result.current.joinWith(companion, { mode: "companion" }))
    await waitFor(() => expect(result.current.token).toBe("companion"))
    act(() => result.current.onDisconnect({ moved: true }))
    act(() => result.current.switchBack())
    await waitFor(() => expect(result.current.token).toBe("person"))
    expect(person).toHaveBeenCalledTimes(3)
  })

  it("joins as a companion on the companion's token, with no microphone or camera, and says a refusal in the server's words", async () => {
    const person = vi.fn(async () => "person")
    const { result } = renderHook(() => useMemberCallLifecycle(person))
    const refused = Object.assign(new Error("403"), { isAxiosError: true, response: { status: 403, data: { code: "not_in_call", msg: "You're not in this call." } } })
    act(() => result.current.joinWith(async () => Promise.reject(refused), { mode: "companion" }))
    await waitFor(() => expect(result.current.phase).toBe("prejoin"))
    expect(result.current.joinError).toBe("You're not in this call.")
    const companion = vi.fn(async () => "companion")
    act(() => result.current.joinWith(companion, { mode: "companion" }))
    await waitFor(() => expect(result.current.phase).toBe("in-call"))
    expect(result.current.token).toBe("companion")
    expect(result.current.choice).toMatchObject({ audio: false, video: false })
    expect(person).not.toHaveBeenCalled()
    // Try again after a failed companion asks for a companion again.
    act(() => result.current.onDisconnect({ failed: "network" }))
    act(() => result.current.retry())
    await waitFor(() => expect(companion).toHaveBeenCalledTimes(2))
    // Join in the green room is the person's own.
    act(() => result.current.onDisconnect())
    act(() => result.current.reset())
    act(() => result.current.join({ audioEnabled: true, videoEnabled: true }))
    await waitFor(() => expect(result.current.token).toBe("person"))
    expect(companion).toHaveBeenCalledTimes(2)
  })

  it("stops a present-only screen the call never took, and the one it had when it ends; Try again comes back as a companion", async () => {
    const { result, unmount } = renderHook(() => useMemberCallLifecycle(async () => "person"))
    const refused = liveTrack()
    act(() => result.current.joinWith(async () => Promise.reject(new Error("no")), { mode: "present", screen: streamOf(refused) }))
    await waitFor(() => expect(result.current.phase).toBe("prejoin"))
    expect(refused.readyState).toBe("ended")
    const shared = liveTrack()
    const own = vi.fn(async () => "companion")
    act(() => result.current.joinWith(own, { mode: "present", screen: streamOf(shared) }))
    await waitFor(() => expect(result.current.phase).toBe("in-call"))
    expect(result.current.screen?.getTracks()).toEqual([shared])
    expect(shared.readyState).toBe("live")
    act(() => result.current.onDisconnect({ failed: "network" }))
    expect(shared.readyState).toBe("ended")
    act(() => result.current.retry())
    await waitFor(() => expect(result.current.phase).toBe("in-call"))
    expect(own).toHaveBeenCalledTimes(2)
    expect(result.current.screen).toBeUndefined()
    // The page goes mid-call: its screen goes with it.
    const last = liveTrack()
    act(() => result.current.onDisconnect())
    act(() => result.current.joinWith(own, { mode: "present", screen: streamOf(last) }))
    await waitFor(() => expect(result.current.phase).toBe("in-call"))
    unmount()
    expect(last.readyState).toBe("ended")
  })
})
