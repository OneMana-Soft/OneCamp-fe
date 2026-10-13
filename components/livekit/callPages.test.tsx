// The pages around a call: the green room answers its keys and says what
// the call is doing before Join (CALL-BUG-12, 13); a channel call's page
// carries the choice and says why a join or the call ended (CALL-BUG-1, 11);
// an instant meeting has a page its creator can come back to, with no Record
// (CALL-BUG-9, 17).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"

vi.mock("livekit-client", async (orig) => ({
  ...(await orig<typeof import("livekit-client")>()),
  // The camera never answers: the preview's in-between state.
  createLocalVideoTrack: vi.fn(() => new Promise(() => {})),
}))
vi.mock("@livekit/components-react", () => ({ useIsMuted: () => true }))
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: false, isDesktop: true, isTablet: false }) }))

let reads: Record<string, { data?: unknown; isError?: unknown }> = {}
vi.mock("@/hooks/useFetch", () => ({
  useFetch: (url: string) => reads[url] ?? {},
  useFetchOnlyOnce: (url: string) => reads[url] ?? {},
}))
const post = vi.fn()
vi.mock("@/lib/axiosInstance", () => ({ default: { post: (...a: unknown[]) => post(...a) }, OWN_ERRORS: { suppressErrorToast: true } }))

let conference: Record<string, unknown> = {}
vi.mock("@/components/livekit/VideoConference", () => ({
  VideoConference: (p: Record<string, unknown> & { onDisconnect: (end?: unknown) => void }) => {
    conference = p
    return (
      <div data-testid="conference">
        <button type="button" onClick={() => p.onDisconnect({ removed: { reason: "host", by: "Maya Chen" } })}>Removed</button>
        <button type="button" onClick={() => p.onDisconnect()}>Leave</button>
      </div>
    )
  },
}))

const router = { push: vi.fn(), replace: vi.fn(), back: vi.fn() }
vi.mock("next/navigation", () => ({ useRouter: () => router }))
vi.mock("@/hooks/useConfirm", () => ({ useConfirm: () => vi.fn() }))
const joinInstantMeeting = vi.fn()
const createInstantMeetingAs = vi.fn()
vi.mock("@/services/callService", async (orig) => ({
  ...(await orig<typeof import("@/services/callService")>()),
  joinInstantMeeting: (...a: unknown[]) => joinInstantMeeting(...a),
  createInstantMeetingAs: (...a: unknown[]) => createInstantMeetingAs(...a),
  newInstantMeetingLink: vi.fn(),
}))

import { PreJoin } from "./PreJoin"
import { CallView } from "./CallView"
import { InstantMeetingView } from "./InstantMeetingView"
import { handOffMeeting, peekMeetingHandoff } from "./instantMeeting"
import InstantMeetingPage from "@/app/app/meet/instant/page"

beforeEach(() => {
  reads = {}
  conference = {}
  Object.defineProperty(navigator, "languages", { configurable: true, value: ["hi-IN", "en-GB"] })
})
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe("CALL-BUG-13: the green room answers the keys its tooltips teach", () => {
  it("toggles the microphone with M and the camera with V, never while typing a name", async () => {
    render(<PreJoin onJoin={() => {}} username="" nameEditable />)
    expect(screen.getByRole("button", { name: "Mute" })).toBeInTheDocument()
    await act(async () => fireEvent.keyDown(window, { key: "m" }))
    expect(screen.getByRole("button", { name: "Unmute" })).toBeInTheDocument()
    await act(async () => fireEvent.keyDown(window, { key: "v" }))
    expect(screen.getByRole("button", { name: "Turn camera on" })).toBeInTheDocument()
    const field = screen.getByLabelText("Your name")
    await act(async () => fireEvent.keyDown(field, { key: "m" }))
    expect(screen.getByRole("button", { name: "Unmute" })).toBeInTheDocument()
  })
})

describe("CALL-BUG-12: a channel call says what it is doing before Join", () => {
  const state = {
    data: {
      active: true,
      recording: { on: true, by: "Maya Chen" },
      transcription: { on: true, by: "Maya Chen", where: "browser", kept: true },
      participants: [{ id: "m", name: "Maya Chen" }],
      can_remove: true,
    },
  }

  it("names who is recording and who turned captions on, and where speech goes", () => {
    reads["/ch/callState/c1"] = { data: state }
    render(<CallView kind="channel" id="c1" onLeave={() => {}} />)
    expect(screen.getByText("This call is being recorded by Maya Chen. Joining puts you in the recording.")).toBeInTheDocument()
    const captions = document.querySelector("[data-call-notices] [data-captions-notice]")!
    expect(captions.textContent).toContain("Captions are on, turned on by Maya Chen.")
    expect(captions.textContent).toContain("(Google in Chrome, Microsoft in Edge)")
    expect(screen.getByText("Maya is in the call")).toBeInTheDocument()
  })

  it("joins with the green room's choice and the person's language, and lets a moderator remove people", async () => {
    reads["/ch/callState/c1"] = { data: state }
    post.mockResolvedValueOnce({ data: { data: { token: "tok" } } })
    render(<CallView kind="channel" id="c1" onLeave={() => {}} />)
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Mute" })))
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Join now" })))
    expect(post).toHaveBeenCalledWith("/ch/getCallToken", expect.objectContaining({ channel_uuid: "c1", audio_enabled: false, video_enabled: true, language: "hi-IN" }), expect.anything())
    await waitFor(() => expect(screen.getByTestId("conference")).toBeInTheDocument())
    expect(conference).toMatchObject({ token: "tok", audio: false, video: true, canRemove: true })
  })
})

describe("CALL-BUG-11: someone removed is told why, and can't walk back in", () => {
  it("says who removed them, with no Rejoin", async () => {
    post.mockResolvedValueOnce({ data: { data: { token: "tok" } } })
    render(<CallView kind="channel" id="c1" onLeave={() => {}} />)
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Join now" })))
    await waitFor(() => expect(screen.getByTestId("conference")).toBeInTheDocument())
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Removed" })))
    expect(screen.getByRole("heading", { name: "You were removed from the call" })).toBeInTheDocument()
    expect(screen.getByText("Maya Chen removed you, so you can't rejoin this call.")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Rejoin" })).toBeNull()
  })

  it("says why a join was refused, under Join", async () => {
    post.mockRejectedValueOnce({ response: { status: 403, data: { code: "removed_from_call", msg: "You were removed from this call." } } })
    render(<CallView kind="channel" id="c1" onLeave={() => {}} />)
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Join now" })))
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("Couldn't join: You were removed from this call."))
  })
})

describe("CALL-BUG-17 and 9: an instant meeting's own page", () => {
  it("opens straight into the call the start page made, with Invite and no Record", () => {
    handOffMeeting("m1", { hostToken: "host-tok", audio: true, video: false })
    render(<InstantMeetingView meetingId="m1" />)
    expect(screen.getByTestId("conference")).toBeInTheDocument()
    expect(conference).toMatchObject({ token: "host-tok", audio: true, video: false, isAdmin: true })
    expect(conference.toggleRecording).toBeUndefined()
    expect(conference.extraStatus).toBeTruthy()
  })

  it("lets its creator back in after leaving or reloading, with a fresh token", async () => {
    expect(peekMeetingHandoff("m2")).toBeUndefined()
    reads["/meet/instant/m2"] = { data: { data: { active: true, can_remove: true } } }
    joinInstantMeeting.mockResolvedValueOnce({ room: "meet-m2", host_token: "fresh" })
    render(<InstantMeetingView meetingId="m2" />)
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Join meeting" })))
    expect(joinInstantMeeting).toHaveBeenCalledWith("m2", "hi-IN")
    await waitFor(() => expect(conference.token).toBe("fresh"))
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Leave" })))
    expect(screen.getByRole("button", { name: "Rejoin" })).toBeInTheDocument()
  })

  it("says when the meeting is over, and offers a new one", () => {
    reads["/meet/instant/m3"] = { isError: { response: { status: 404, data: {} } } }
    render(<InstantMeetingView meetingId="m3" />)
    expect(screen.getByRole("heading", { name: "This meeting has ended" })).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Start a new meeting" }))
    expect(router.push).toHaveBeenCalledWith("/app/meet/instant")
  })

  it("moves a new meeting to its own page, handing it the first token and the guest link", async () => {
    createInstantMeetingAs.mockResolvedValueOnce({ room: "meet-m4", meeting_id: "m4", host_token: "first", guest_token: "g", grant_id: "x", expires_at: "" })
    render(<InstantMeetingPage />)
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Start meeting" })))
    expect(createInstantMeetingAs).toHaveBeenCalledWith("hi-IN")
    expect(router.replace).toHaveBeenCalledWith("/app/meet/m/m4")
    expect(peekMeetingHandoff("m4")).toMatchObject({ hostToken: "first", audio: true, video: true })
    expect(window.sessionStorage.getItem("onecamp.meet.link.m4")).toMatch(/\/guest\/m\/g$/)
  })
})
