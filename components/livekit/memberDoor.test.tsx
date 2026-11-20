// A member at a link, as themselves (calls HU13): the green room says whose
// call it is; Join comes in by the door; someone in the conversation is sent
// to its own call; a call by its invite has nothing of the conversation; a
// room whose passcode isn't kept sends them back to enter it; a dead link
// says so.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { fakeMedia } from "@/lib/testing/fakeMedia"

vi.mock("@livekit/components-react", () => ({ useIsMuted: () => true }))
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: false, isDesktop: true, isTablet: false }) }))

let reads: Record<string, { data?: unknown }> = {}
vi.mock("@/hooks/useFetch", () => ({
  useFetch: (url: string) => reads[url] ?? {},
  useFetchOnlyOnce: (url: string) => reads[url] ?? {},
}))
vi.mock("@/hooks/useClientConfig", () => ({ FEATURE_AI: "ai", useFeature: () => false, useClientConfig: () => ({ transcription_mode: "frontend" }) }))

let conference: Record<string, unknown> = {}
vi.mock("@/components/livekit/VideoConference", () => ({
  VideoConference: (p: Record<string, unknown>) => {
    conference = p
    return <div data-testid="conference" />
  },
}))
const router = { push: vi.fn(), replace: vi.fn(), back: vi.fn() }
vi.mock("next/navigation", () => ({ useRouter: () => router }))

const enterByDoor = vi.fn()
const getEventRoom = vi.fn()
vi.mock("@/services/callInviteService", async (orig) => ({
  ...(await orig<typeof import("@/services/callInviteService")>()),
  enterByDoor: (...a: unknown[]) => enterByDoor(...a),
  getEventRoom: (...a: unknown[]) => getEventRoom(...a),
}))
const getGuestMeetingStatus = vi.fn()
vi.mock("@/services/guestDoor", async (orig) => ({
  ...(await orig<typeof import("@/services/guestDoor")>()),
  getGuestMeetingStatus: (...a: unknown[]) => getGuestMeetingStatus(...a),
}))

import { MemberDoorView } from "./MemberDoorView"
import { callRefOfRoom } from "@/lib/calls/callRef"
import { conversationCallPath } from "@/lib/calls/conversationCallPath"
import { keepUnlock } from "@/components/guest/roomUnlock"
import { keepDoorJoin } from "@/lib/calls/doorJoin"

const channel = "4f0c2a1e-3b7d-4c55-9a51-0d8b1f6a2c33"
const me = "11111111-1111-4111-8111-111111111111"
const them = "22222222-2222-4222-8222-222222222222"

beforeEach(() => {
  // The camera never answers: the preview's in-between state.
  fakeMedia("never")
  reads = { "/user/profile": { data: { data: { user_uuid: me, user_name: "jonas", user_full_name: "Jonas Weber" } } } }
  conference = {}
  getGuestMeetingStatus.mockResolvedValue({ ok: true, data: { available: true, title: "Maya Chen's call" } })
  Object.defineProperty(navigator, "languages", { configurable: true, value: ["hi-IN", "en-GB"] })
})
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  window.sessionStorage.clear()
})

describe("a call's room, named as Call State names it", () => {
  it("is a meeting, a DM, a group or a channel, and a conversation's call page for someone in it", () => {
    expect(callRefOfRoom("meet-m1")).toEqual({ kind: "meeting", id: "m1" })
    expect(callRefOfRoom(`${me} ${them}`)).toEqual({ kind: "dm", id: `${me} ${them}` })
    expect(callRefOfRoom("0123456789abcdef0123456789abcdef")).toEqual({ kind: "group", id: "0123456789abcdef0123456789abcdef" })
    expect(callRefOfRoom(channel)).toEqual({ kind: "channel", id: channel })
    expect(callRefOfRoom("anything else")).toBeNull()
    expect(conversationCallPath({ kind: "channel", id: channel }, me)).toBe(`/app/meet/ch/${channel}`)
    expect(conversationCallPath({ kind: "dm", id: `${me} ${them}` }, me)).toBe(`/app/meet/chat/${them}`)
    expect(conversationCallPath({ kind: "group", id: "g1" }, me)).toBe("/app/meet/grp/g1")
    expect(conversationCallPath({ kind: "meeting", id: "m1" }, me)).toBe("")
  })
})

describe("a member at a link, as themselves", () => {
  // DESIGN-BUILD-4, 22 Oct: joining as yourself is the point, so the door
  // says it, under the workspace's name, as the guest page says "Joining as
  // a guest"; the self-view names them as the call will.
  it("says whose workspace it is and who they join as, with their face", async () => {
    reads = { "/user/profile": { data: { data: { user_uuid: me, user_name: "Kai Lin", user_full_name: "Kai Lin" } } } }
    getGuestMeetingStatus.mockResolvedValue({ ok: true, data: { available: true, title: "Maya Chen's call", workspace_name: "Acme Studio" } })
    render(<MemberDoorView door={{ token: "raw" }} />)
    const header = (await screen.findByText("Acme Studio")).closest("header")!
    expect(header.textContent).toContain("Joining as Kai Lin")
    expect(header.querySelector("[data-joining-as] [data-hue]")).not.toBeNull()
  })

  // "Join as Kai Lin" at the guest link: in at once, with the choices made
  // there, no second green room. Only a join this tab chose there a moment
  // ago does it; an address someone sends shows the green room.
  it("joins at once with the choices made at its guest link a moment ago, in this tab", async () => {
    window.history.pushState({}, "", "/app/meet/join/raw")
    keepDoorJoin("/app/meet/join/raw", { audioEnabled: false, videoEnabled: true })
    enterByDoor.mockResolvedValueOnce({ token: "tok", room: channel, title: "Maya Chen's call" })
    render(<MemberDoorView door={{ token: "raw" }} />)
    await waitFor(() => expect(screen.getByTestId("conference")).toBeInTheDocument())
    expect(enterByDoor).toHaveBeenCalledTimes(1)
    expect(conference).toMatchObject({ token: "tok", audio: false, video: true })
    window.history.pushState({}, "", "/")
  })

  it("shows the green room to an address opened any other way", async () => {
    window.history.pushState({}, "", "/app/meet/join/raw")
    keepDoorJoin("/app/meet/join/another", { audioEnabled: true, videoEnabled: true })
    render(<MemberDoorView door={{ token: "raw" }} />)
    expect(await screen.findByRole("button", { name: "Join now" })).toBeInTheDocument()
    expect(enterByDoor).not.toHaveBeenCalled()
    window.history.pushState({}, "", "/")
  })

  // An invitee raises a hand like anyone in the call: the door's call is
  // given the call's session, which the members' act route takes.
  it("gives the call its session, so an invitee can raise a hand", async () => {
    reads[`/calls/current?kind=channel&id=${channel}`] = { data: { data: { session: { id: "s1" } } } }
    enterByDoor.mockResolvedValueOnce({ token: "tok", room: channel, title: "Maya Chen's call" })
    render(<MemberDoorView door={{ token: "raw" }} />)
    // The green room comes once the door has answered.
    const join = await screen.findByRole("button", { name: "Join now" })
    await act(async () => fireEvent.click(join))
    await waitFor(() => expect(screen.getByTestId("conference")).toBeInTheDocument())
    expect(conference).toMatchObject({ sessionId: "s1" })
  })

  it("comes into a call by its invite, with nothing of the conversation", async () => {
    enterByDoor.mockResolvedValueOnce({ token: "tok", room: channel, title: "Maya Chen's call" })
    render(<MemberDoorView door={{ token: "raw" }} />)
    expect(await screen.findByText("Maya Chen's call")).toBeInTheDocument()
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Join now" })))
    expect(enterByDoor).toHaveBeenCalledWith({ token: "raw" }, "hi-IN")
    await waitFor(() => expect(screen.getByTestId("conference")).toBeInTheDocument())
    expect(conference).toMatchObject({ token: "tok", isAdmin: false, inviteOnly: true, place: "Maya Chen's call" })
    expect(conference.onChatToggle).toBeUndefined()
    expect(conference.toggleRecording).toBeUndefined()
  })

  it("comes into a room as themselves with the unlock this tab kept", async () => {
    keepUnlock("maya-chen", "k1", 600)
    enterByDoor.mockResolvedValueOnce({ token: "tok", room: "meet-m1", title: "Maya Chen's room" })
    render(<MemberDoorView door={{ slug: "maya-chen" }} />)
    await screen.findByText("Maya Chen's call")
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Join now" })))
    expect(enterByDoor).toHaveBeenCalledWith({ slug: "maya-chen", unlock: "k1" }, "hi-IN")
    await waitFor(() => expect(screen.getByTestId("conference")).toBeInTheDocument())
    expect(conference).toMatchObject({ token: "tok", inviteOnly: false })
  })

  it("sends someone in the conversation to its own call", async () => {
    enterByDoor.mockResolvedValueOnce({ room: `${me} ${them}`, title: "Maya Chen's call", conversation: { kind: "dm", id: `${me} ${them}` } })
    render(<MemberDoorView door={{ token: "raw" }} />)
    await screen.findByText("Maya Chen's call")
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Join now" })))
    expect(router.replace).toHaveBeenCalledWith(`/app/meet/chat/${them}`)
    expect(screen.queryByTestId("conference")).toBeNull()
  })

  it("says a room needs its passcode before its green room, when this tab has no unlock", async () => {
    getGuestMeetingStatus.mockResolvedValueOnce({ ok: true, data: { state: "locked" } })
    render(<MemberDoorView door={{ slug: "maya-chen" }} />)
    expect(await screen.findByRole("heading", { name: "This room needs its passcode" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Join now" })).toBeNull()
    expect(enterByDoor).not.toHaveBeenCalled()
  })

  it("sends them back to a room's address for its passcode", async () => {
    enterByDoor.mockRejectedValueOnce({ response: { status: 401, data: { code: "locked", msg: "Enter the room's passcode to come in." } } })
    render(<MemberDoorView door={{ slug: "maya-chen" }} />)
    await screen.findByText("Maya Chen's call")
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Join now" })))
    expect(await screen.findByRole("heading", { name: "This room needs its passcode" })).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Enter the passcode" }))
    expect(router.push).toHaveBeenCalledWith("/r/maya-chen")
  })

  // 29 Oct 2026: a removed call's room or an ended link said so only at Join,
  // after its green room had opened the camera for a link that could never
  // join. The door's own read says it now, as every dead link is told
  // (PublicGone, in the door's guest page's words), and the green room waits
  // for it in the call's shape (GuestNotYet).
  it("says a dead room at once, in the shared gone state, before any green room, from the door's own read", async () => {
    getGuestMeetingStatus.mockResolvedValue({ ok: false, status: 404, msg: "This link is no longer available." })
    const { container } = render(<MemberDoorView door={{ slug: "design-review-gone" }} />)
    expect(await screen.findByRole("heading", { name: "This room doesn't exist or was deleted" })).toBeInTheDocument()
    expect(screen.getByText("Its owner may have closed it or given it a new address. Ask whoever invited you for the room's link.")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Go home" }).getAttribute("href")).toBe("/app/home")
    expect(container.querySelector("[data-public-gone]")).not.toBeNull()
    // A member is in their own workspace: the guest page's "Made with OneCamp" isn't said to them.
    expect(container.querySelector("[data-made-with]")).toBeNull()
    expect(screen.queryByRole("button", { name: "Join now" })).toBeNull()
    expect(enterByDoor).not.toHaveBeenCalled()
  })

  it("says an ended meeting link in its guest page's words", async () => {
    getGuestMeetingStatus.mockResolvedValue({ ok: false, status: 404, msg: "This link is no longer available." })
    const { container } = render(<MemberDoorView door={{ token: "mt-ended" }} />)
    expect(await screen.findByRole("heading", { name: "This meeting link doesn't exist or was deleted" })).toBeInTheDocument()
    expect(screen.getByText("The meeting may have ended, or the invite expired or was turned off. Ask the host for a new link.")).toBeInTheDocument()
    expect(container.querySelector("[data-made-with]")).toBeNull()
    expect(screen.queryByRole("button", { name: "Join now" })).toBeNull()
  })

  it("holds the green room until the door answers, so nothing asks for the camera before it", async () => {
    let answer!: (r: unknown) => void
    getGuestMeetingStatus.mockReturnValue(new Promise((resolve) => (answer = resolve)))
    const { container } = render(<MemberDoorView door={{ token: "raw" }} />)
    expect(await screen.findByText("Checking the link…")).toBeInTheDocument()
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull()
    expect(screen.queryByRole("button", { name: "Join now" })).toBeNull()
    await act(async () => answer({ ok: true, data: { available: true, title: "Maya Chen's call" } }))
    expect(await screen.findByRole("button", { name: "Join now" })).toBeInTheDocument()
  })

  it("says it is still trying while the server can't be reached, then opens the green room", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      getGuestMeetingStatus.mockResolvedValueOnce({ ok: false, status: 0, msg: "Couldn't reach the server. Check your connection and try again." })
      render(<MemberDoorView door={{ token: "raw" }} />)
      expect(await screen.findByText("Couldn't reach the server, retrying…")).toBeInTheDocument()
      expect(screen.queryByRole("button", { name: "Join now" })).toBeNull()
      await act(async () => {
        await vi.advanceTimersByTimeAsync(30_000)
      })
      expect(await screen.findByRole("button", { name: "Join now" })).toBeInTheDocument()
      expect(getGuestMeetingStatus).toHaveBeenCalledTimes(2)
    } finally {
      vi.useRealTimers()
    }
  })

  it("says a link gone by Join in the same shared gone state, and a refusal in its own words", async () => {
    enterByDoor.mockRejectedValueOnce({ response: { status: 403, data: { code: "call_locked", msg: "This call is locked, so nobody new can join it." } } })
    render(<MemberDoorView door={{ token: "raw" }} />)
    await screen.findByText("Maya Chen's call")
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Join now" })))
    expect((await screen.findByRole("alert")).textContent).toBe("Couldn't join: This call is locked, so nobody new can join it.")
    enterByDoor.mockRejectedValueOnce({ response: { status: 404, data: { msg: "This link is no longer available.", available: false } } })
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Join now" })))
    expect(await screen.findByRole("heading", { name: "This meeting link doesn't exist or was deleted" })).toBeInTheDocument()
  })

  // Only an event's door takes a bare 403 as no way in (the calendar's own refusal); at a link it is a failed
  // join, said in PreJoin's words, and Join can be pressed again.
  it("says a link's 403 without a code as a failed join, not as a gone link", async () => {
    enterByDoor.mockRejectedValueOnce({ response: { status: 403, data: { msg: "You can't join this call." } } })
    render(<MemberDoorView door={{ token: "raw" }} />)
    await screen.findByText("Maya Chen's call")
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Join now" })))
    expect((await screen.findByRole("alert")).textContent).toBe("Couldn't join: You can't join this call.")
    expect(screen.queryByRole("heading", { name: "This meeting link doesn't exist or was deleted" })).toBeNull()
    expect(screen.getByRole("button", { name: "Join now" })).toBeInTheDocument()
  })
})

// gcal-15 head B: every event has a call room, made the first time someone joins it, at /app/meet/e/<id>. The door
// reads the event's room for its title (nothing is made), and Join asks the server for the member's own token, which
// goes to the app's own call. Whoever may not join (a busy-only reader, someone not on it, a private event's details
// reader) is told there is no such event, which the door says in words; a failed join says so, and Join tries again.
describe("an event's call room, at its member door", () => {
  const EVENT = "0b8a3c1e-1d2f-4a5b-8c7d-9e0f1a2b3c16"
  beforeEach(() => {
    getEventRoom.mockResolvedValue({ ok: true, data: { title: "Roadmap review", join: `/app/meet/e/${EVENT}` } })
  })

  it("says the event's title before Join, and hands its token to the call", async () => {
    enterByDoor.mockResolvedValueOnce({ token: "tok", room: `meet-${EVENT}`, title: "Roadmap review" })
    render(<MemberDoorView door={{ event: EVENT }} />)
    expect(await screen.findByText("Roadmap review")).toBeInTheDocument()
    expect(getEventRoom).toHaveBeenCalledWith(EVENT)
    expect(getGuestMeetingStatus).not.toHaveBeenCalled()
    expect(enterByDoor).not.toHaveBeenCalled()
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Join now" })))
    expect(enterByDoor).toHaveBeenCalledWith({ event: EVENT }, "hi-IN")
    await waitFor(() => expect(screen.getByTestId("conference")).toBeInTheDocument())
    expect(conference).toMatchObject({ token: "tok", place: "Roadmap review", inviteOnly: false })
  })

  it("gives the call its session, as the event's meeting", async () => {
    reads[`/calls/current?kind=meeting&id=${EVENT}`] = { data: { data: { session: { id: "s9" } } } }
    enterByDoor.mockResolvedValueOnce({ token: "tok", room: `meet-${EVENT}`, title: "Roadmap review" })
    render(<MemberDoorView door={{ event: EVENT }} />)
    const join = await screen.findByRole("button", { name: "Join now" })
    await act(async () => fireEvent.click(join))
    await waitFor(() => expect(screen.getByTestId("conference")).toBeInTheDocument())
    expect(conference).toMatchObject({ sessionId: "s9" })
  })

  it("says at once, from its read, that someone can't join it, and asks for no camera", async () => {
    for (const status of [404, 403]) {
      getEventRoom.mockResolvedValue({ ok: false, status, msg: "Event not found" })
      const { container, unmount } = render(<MemberDoorView door={{ event: EVENT }} />)
      expect(await screen.findByRole("heading", { name: "You can't join this event's call" })).toBeInTheDocument()
      expect(screen.getByText("It may have been deleted, or you're not on it. Ask its organiser to invite you.")).toBeInTheDocument()
      expect(container.querySelector("[data-made-with]")).toBeNull()
      expect(screen.queryByRole("button", { name: "Join now" })).toBeNull()
      expect(enterByDoor).not.toHaveBeenCalled()
      fireEvent.click(screen.getByRole("button", { name: "Go home" }))
      expect(router.push).toHaveBeenLastCalledWith("/app")
      unmount()
    }
  })

  it("says so at Join too, and a refusal in its own words", async () => {
    enterByDoor.mockRejectedValueOnce({ response: { status: 403, data: { code: "call_locked", msg: "This call is locked, so nobody new can join it." } } })
    render(<MemberDoorView door={{ event: EVENT }} />)
    const join = await screen.findByRole("button", { name: "Join now" })
    await act(async () => fireEvent.click(join))
    expect((await screen.findByRole("alert")).textContent).toBe("Couldn't join: This call is locked, so nobody new can join it.")
    enterByDoor.mockRejectedValueOnce({ response: { status: 404, data: { msg: "Event not found" } } })
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Join now" })))
    expect(await screen.findByRole("heading", { name: "You can't join this event's call" })).toBeInTheDocument()
  })

  it("takes a 403 without a code at Join as the calendar's refusal, not as a failed join", async () => {
    enterByDoor.mockRejectedValueOnce({ response: { status: 403, data: { msg: "You don't have access to this event" } } })
    render(<MemberDoorView door={{ event: EVENT }} />)
    const join = await screen.findByRole("button", { name: "Join now" })
    await act(async () => fireEvent.click(join))
    expect(await screen.findByRole("heading", { name: "You can't join this event's call" })).toBeInTheDocument()
    expect(screen.queryByText(/^Couldn't join:/)).toBeNull()
    expect(screen.queryByRole("button", { name: "Join now" })).toBeNull()
  })

  // Going from one event's call to another's on the same page reads the second event: one event's refusal or
  // title is never shown at another's door.
  it("reads each event's door apart", async () => {
    const OTHER = "5d2e7f90-4c1b-4e3a-9f6d-2a8b0c4e6f17"
    getEventRoom.mockImplementation(async (id: string) =>
      id === EVENT ? { ok: false, status: 404, msg: "Event not found" } : { ok: true, data: { title: "Hiring sync", join: `/app/meet/e/${OTHER}` } },
    )
    const { rerender } = render(<MemberDoorView door={{ event: EVENT }} />)
    expect(await screen.findByRole("heading", { name: "You can't join this event's call" })).toBeInTheDocument()
    rerender(<MemberDoorView door={{ event: OTHER }} />)
    expect(await screen.findByText("Hiring sync")).toBeInTheDocument()
    expect(getEventRoom).toHaveBeenLastCalledWith(OTHER)
    expect(screen.queryByRole("heading", { name: "You can't join this event's call" })).toBeNull()
    expect(screen.getByRole("button", { name: "Join now" })).toBeInTheDocument()
  })

  it("says a failed join in words, offline or not, and Join tries again", async () => {
    enterByDoor.mockRejectedValueOnce({ isAxiosError: true, message: "Network Error" })
    render(<MemberDoorView door={{ event: EVENT }} />)
    const join = await screen.findByRole("button", { name: "Join now" })
    await act(async () => fireEvent.click(join))
    expect((await screen.findByRole("alert")).textContent).toBe("Couldn't join: The server could not be reached. Check your connection and try again in a moment.")
    enterByDoor.mockRejectedValueOnce({ response: { status: 503, data: { msg: "Something went wrong. Try again in a moment." } } })
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Join now" })))
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("Couldn't join: Something went wrong. Try again in a moment."))
    enterByDoor.mockResolvedValueOnce({ token: "tok", room: `meet-${EVENT}`, title: "Roadmap review" })
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Join now" })))
    await waitFor(() => expect(screen.getByTestId("conference")).toBeInTheDocument())
  })

  it("waits out a read that can't reach the server, then opens the green room", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      getEventRoom.mockResolvedValueOnce({ ok: false, status: 0, msg: "Couldn't reach the server." })
      render(<MemberDoorView door={{ event: EVENT }} />)
      expect(await screen.findByText("Couldn't reach the server, retrying…")).toBeInTheDocument()
      expect(screen.queryByRole("button", { name: "Join now" })).toBeNull()
      await act(async () => {
        await vi.advanceTimersByTimeAsync(30_000)
      })
      expect(await screen.findByRole("button", { name: "Join now" })).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })
})
