import { act, renderHook, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { useCallLifecycle } from "./useCallLifecycle"
import type { GreenRoomTracks } from "./greenRoomHandOver"

// Join warms the call's chunk; nothing here loads it.
vi.mock("./LazyCall", () => ({ warmCall: vi.fn() }))

/** A track the browser has open, as the green room hands it over. */
function liveTrack(): MediaStreamTrack {
  const track = { readyState: "live", stop: vi.fn(() => void (track.readyState = "ended")) }
  return track as unknown as MediaStreamTrack
}

/** The green room's camera and microphone, handed over at Join. */
function handed(extra: Partial<GreenRoomTracks> = {}): GreenRoomTracks {
  return { camera: { track: liveTrack(), constraints: {} }, mic: { track: liveTrack(), constraints: {} }, ...extra }
}

const ended = (t: GreenRoomTracks) => [t.camera?.track, t.mic?.track].map((x) => x?.readyState)
const join = (tracks: GreenRoomTracks) => ({ audioEnabled: true, videoEnabled: true, tracks })

// The Join hand-over (29 Oct 2026): from Join the call owns the green room's
// camera and microphone. LiveKit stops what the call sent; the lifecycle stops
// the rest, so a camera is never left lit by a call that didn't happen.
describe("the call's lifecycle stops what Join handed it", () => {
  it("when the call ends before it connected, and the page is back in the green room", async () => {
    const { result } = renderHook(() => useCallLifecycle(async () => "token"))
    const tracks = handed()
    act(() => result.current.join(join(tracks)))
    await waitFor(() => expect(result.current.phase).toBe("in-call"))
    act(() => result.current.onDisconnect())
    expect(ended(tracks)).toEqual(["ended", "ended"])
    expect(result.current.phase).toBe("prejoin")
  })

  it("when the page goes while the call is still being asked for", () => {
    // The server never answers: the call never came to take them.
    const { result, unmount } = renderHook(() => useCallLifecycle(() => new Promise<string>(() => {})))
    const tracks = handed()
    act(() => result.current.join(join(tracks)))
    expect(result.current.phase).toBe("joining")
    expect(ended(tracks)).toEqual(["live", "live"])
    unmount()
    expect(ended(tracks)).toEqual(["ended", "ended"])
  })

  it("when the join gets no call and the green room that gave them has gone", async () => {
    // InstantMeetingView can draw its "unavailable" state over PreJoin mid-join (CR-87 SF1).
    const { result } = renderHook(() => useCallLifecycle(() => Promise.reject(new Error("The call server didn't answer."))))
    const tracks = handed({ greenRoomOpen: () => false })
    act(() => result.current.join(join(tracks)))
    await waitFor(() => expect(result.current.phase).toBe("prejoin"))
    expect(ended(tracks)).toEqual(["ended", "ended"])
  })

  it("but leaves them with the green room that gave them when it is still open to show them", async () => {
    const { result } = renderHook(() => useCallLifecycle(() => Promise.reject(new Error("The call server didn't answer."))))
    const tracks = handed({ greenRoomOpen: () => true })
    act(() => result.current.join(join(tracks)))
    await waitFor(() => expect(result.current.phase).toBe("prejoin"))
    expect(ended(tracks)).toEqual(["live", "live"])
  })
})
