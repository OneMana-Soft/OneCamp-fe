// The pages around a call: the green room answers its keys and says what
// the call is doing before Join (CALL-BUG-12, 13); a channel call's page
// carries the choice and says why a join or the call ended (CALL-BUG-1, 11);
// an instant meeting has a page its creator can come back to, with no Record
// (CALL-BUG-9, 17).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"
import { fakeMedia } from "@/lib/testing/fakeMedia"

vi.mock("@livekit/components-react", () => ({ useIsMuted: () => true }))
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: false, isDesktop: true, isTablet: false }) }))

let reads: Record<string, { data?: unknown; isError?: unknown }> = {}
vi.mock("@/hooks/useFetch", () => ({
  useFetch: (url: string) => reads[url] ?? {},
  useFetchOnlyOnce: (url: string) => reads[url] ?? {},
}))
const post = vi.fn()
vi.mock("@/lib/axiosInstance", async () => (await import("@/lib/testing/axiosInstance")).axiosInstanceModule({ default: { post: (...a: unknown[]) => post(...a) } }))

let conference: Record<string, unknown> = {}
vi.mock("@/components/livekit/VideoConference", () => ({
  VideoConference: (p: Record<string, unknown> & { onDisconnect: (end?: unknown) => void }) => {
    conference = p
    return (
      <div data-testid="conference">
        <button type="button" onClick={() => (p.onConnected as (() => void) | undefined)?.()}>Connected</button>
        <button type="button" onClick={() => p.onDisconnect({ removed: { reason: "host", by: "Maya Chen" } })}>Removed</button>
        <button type="button" onClick={() => p.onDisconnect({ failed: "server" })}>Fail</button>
        <button type="button" onClick={() => p.onDisconnect()}>Leave</button>
      </div>
    )
  },
}))

const router = { push: vi.fn(), replace: vi.fn(), back: vi.fn() }
vi.mock("next/navigation", () => ({ useRouter: () => router }))
// The dock's Chat follows split view (callChat.test); these pages test the call itself.
vi.mock("@/components/livekit/callChat", () => ({ useCallChat: () => ({}) }))
vi.mock("@/hooks/useConfirm", () => ({ useConfirm: () => vi.fn() }))
vi.mock("@/hooks/useClientConfig", () => ({ useClientConfig: () => ({ transcription_mode: "frontend", transcription_language: "de-DE" }) }))
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
  // The camera never answers: the preview's in-between state.
  fakeMedia("never")
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
  // A member's read of the call (Call State, GET /calls/current).
  const state = {
    data: {
      live: true,
      session: { id: "s1", people: [{ identity: "m", name: "Maya Chen", role: "host", in_call: true }, { identity: "j", name: "Jonas Weber", role: "participant", in_call: false }] },
      recording: { on: true, by: "Maya Chen" },
      transcription: { on: true, by: "Maya Chen", where: "browser", kept: true },
      you: { can: [] },
    },
  }
  const current = "/calls/current?kind=channel&id=c1"

  it("names who is recording and who turned captions on, and where speech goes", () => {
    reads[current] = { data: state }
    render(<CallView kind="channel" id="c1" onLeave={() => {}} />)
    expect(screen.getByText("This call is being recorded by Maya Chen. Joining puts you in the recording.")).toBeInTheDocument()
    const captions = document.querySelector("[data-call-notices] [data-captions-notice]")!
    expect(captions.textContent).toContain("Captions are on, turned on by Maya Chen.")
    expect(captions.textContent).toContain("(Google in Chrome, Microsoft in Edge)")
    expect(screen.getByText("Maya is in the call")).toBeInTheDocument()
  })

  it("joins with the green room's choice and the person's language, and hands the call's id to the call", async () => {
    reads[current] = { data: state }
    post.mockResolvedValueOnce({ data: { data: { token: "tok" } } })
    render(<CallView kind="channel" id="c1" onLeave={() => {}} />)
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Mute" })))
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Join now" })))
    expect(post).toHaveBeenCalledWith("/ch/getCallToken", expect.objectContaining({ channel_uuid: "c1", audio_enabled: false, video_enabled: true, language: "hi-IN" }), expect.anything())
    await waitFor(() => expect(screen.getByTestId("conference")).toBeInTheDocument())
    expect(conference).toMatchObject({ token: "tok", audio: false, video: true, sessionId: "s1" })
  })

  // HU13: Invite, beside the call's other pills, for someone in it who may
  // let people in; never for anyone else.
  it("offers Invite to someone who may let people in, and to nobody else", async () => {
    for (const [can, offered] of [[["mute", "admit"], true], [[], false]] as const) {
      reads[current] = { data: { data: { ...state.data, you: { role: "host", can } } } }
      post.mockResolvedValueOnce({ data: { data: { token: "tok" } } })
      render(<CallView kind="channel" id="c1" onLeave={() => {}} />)
      await act(async () => fireEvent.click(screen.getByRole("button", { name: "Join now" })))
      await waitFor(() => expect(screen.getByTestId("conference")).toBeInTheDocument())
      expect(!!conference.extraStatus).toBe(offered)
      cleanup()
    }
  })

  it("says before Join that a locked call won't let you in, and holds Join", () => {
    const msg = "This call is locked, so nobody new can join it. Ask someone in the call to unlock it."
    reads[current] = { data: { data: { ...state.data, you: { can: [], refusal: { code: "call_locked", msg } } } } }
    render(<CallView kind="channel" id="c1" onLeave={() => {}} />)
    expect(document.querySelector("[data-refusal-notice]")!.textContent).toBe(msg)
    expect(screen.getByRole("button", { name: "Join now" })).toBeDisabled()
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

describe("CALL-BUG-23: a call that never connected says so, with Try again", () => {
  it("says why, offers Try again, and joins again with the same choice", async () => {
    post.mockResolvedValue({ data: { data: { token: "tok" } } })
    render(<CallView kind="channel" id="c1" onLeave={() => {}} />)
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Mute" })))
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Join now" })))
    await waitFor(() => expect(screen.getByTestId("conference")).toBeInTheDocument())
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Fail" })))
    expect(screen.getByRole("heading", { name: "Couldn't connect to the call" })).toBeInTheDocument()
    expect(screen.getByText("The call server had a problem. Try again in a moment.")).toBeInTheDocument()
    expect(screen.queryByText(/You left/)).toBeNull()
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Try again" })))
    expect(post).toHaveBeenLastCalledWith("/ch/getCallToken", expect.objectContaining({ audio_enabled: false }), expect.anything())
  })

  it("never says \"You left\" or a duration for a call that never connected", async () => {
    post.mockResolvedValue({ data: { data: { token: "tok" } } })
    render(<CallView kind="channel" id="c1" onLeave={() => {}} />)
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Join now" })))
    await waitFor(() => expect(screen.getByTestId("conference")).toBeInTheDocument())
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Leave" })))
    expect(screen.queryByText(/You left/)).toBeNull()
    expect(screen.getByRole("button", { name: "Join now" })).toBeInTheDocument()
    // Connected, then left: the card, with its duration.
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Join now" })))
    await waitFor(() => expect(screen.getByTestId("conference")).toBeInTheDocument())
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Connected" })))
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Leave" })))
    expect(screen.getByRole("heading", { name: "You left the call" })).toBeInTheDocument()
    expect(screen.getByText("1 min")).toBeInTheDocument()
  })

  it("goes back to the channel by its name (placeInSentence)", async () => {
    reads["/ch/channelBasicInfo/c1"] = { data: { channel_info: { ch_name: "engineering" } } }
    post.mockResolvedValue({ data: { data: { token: "tok" } } })
    render(<CallView kind="channel" id="c1" onLeave={() => {}} />)
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Join now" })))
    await waitFor(() => expect(screen.getByTestId("conference")).toBeInTheDocument())
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Connected" })))
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Leave" })))
    expect(screen.getByRole("button", { name: "Back to #engineering" })).toBeInTheDocument()
  })

  it("hands the workspace's transcription settings to a member's call", async () => {
    post.mockResolvedValueOnce({ data: { data: { token: "tok" } } })
    render(<CallView kind="channel" id="c1" onLeave={() => {}} />)
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Join now" })))
    await waitFor(() => expect(screen.getByTestId("conference")).toBeInTheDocument())
    expect(conference.transcriptionConfig).toEqual({ mode: "frontend", where: undefined, language: "de-DE" })
  })
})

describe("the Linux desktop app, which has no WebRTC", () => {
  afterEach(() => {
    delete (window as unknown as { __TAURI__?: unknown }).__TAURI__
  })
  it("offers the browser instead of a Join that can't connect", async () => {
    ;(window as unknown as { __TAURI__?: unknown }).__TAURI__ = {}
    const open = vi.spyOn(window, "open").mockImplementation(() => null)
    render(<CallView kind="channel" id="c1" onLeave={() => {}} />)
    await waitFor(() => expect(screen.getByRole("button", { name: "Open the call in your browser" })).toBeInTheDocument())
    expect(screen.queryByRole("button", { name: "Join now" })).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Open the call in your browser" }))
    expect(open).toHaveBeenCalledWith(`${window.location.origin}/app/meet/ch/c1`, "_blank", "noopener")
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
    reads["/meet/instant/m2"] = { data: { data: { active: true } } }
    joinInstantMeeting.mockResolvedValueOnce({ room: "meet-m2", host_token: "fresh" })
    render(<InstantMeetingView meetingId="m2" />)
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Join meeting" })))
    expect(joinInstantMeeting).toHaveBeenCalledWith("m2", "hi-IN")
    await waitFor(() => expect(conference.token).toBe("fresh"))
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Connected" })))
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Leave" })))
    expect(screen.getByRole("button", { name: "Rejoin" })).toBeInTheDocument()
  })

  it("says when the meeting is over, and offers a new one", () => {
    reads["/meet/instant/m3"] = { isError: { response: { status: 404, data: { code: "ended" } } } }
    render(<InstantMeetingView meetingId="m3" />)
    expect(screen.getByRole("heading", { name: "This meeting has ended" })).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Start a new meeting" }))
    expect(router.push).toHaveBeenCalledWith("/app/meet/instant")
  })

  // F-54: an id that never had a meeting said it had ended, on a page that
  // was dark whatever the theme.
  it("says it couldn't find a meeting that never was, in the app's own theme", () => {
    reads["/meet/instant/m5"] = { isError: { response: { status: 404, data: { code: "no_meeting" } } } }
    render(<InstantMeetingView meetingId="m5" />)
    expect(screen.getByRole("heading", { name: "We couldn't find this meeting" })).toBeInTheDocument()
    expect(screen.queryByRole("heading", { name: "This meeting has ended" })).toBeNull()
    const notice = document.querySelector('[data-call-notice="unavailable"]')!
    expect(notice.className).not.toMatch(/(^|\s)dark(\s|$)/)
    expect(notice.className).toContain("bg-sheet")
  })

  // A personal room (CALLS-2) is hosted on the same page: its address is the
  // invite, with no end, changed in the room's settings, never turned off here.
  it("invites to a personal room by its address, said as your room", async () => {
    reads["/meet/instant/m6"] = { data: { data: { active: false, address: "/r/maya-chen" } } }
    handOffMeeting("m6", { hostToken: "host-tok", audio: true, video: false })
    render(<InstantMeetingView meetingId="m6" />)
    expect(conference.place).toBe("in your room")
    cleanup()
    render(<>{conference.extraStatus as ReactNode}</>)
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Invite a guest" })))
    expect(screen.getByLabelText("Your room's address").textContent).toBe(`${window.location.origin}/r/maya-chen`)
    expect(screen.getByText("Anyone with your room's address can ask to come in.")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Room settings" }).getAttribute("href")).toBe("/app/meet/room")
    expect(screen.queryByRole("button", { name: "Turn off the old link" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Get a new link" })).toBeNull()
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
