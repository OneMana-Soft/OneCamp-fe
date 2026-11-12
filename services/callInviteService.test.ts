import { afterEach, describe, expect, it, vi } from "vitest"

// gcal-15 head B: a member at an event's call room, at its member door. The
// door reads where the room is and its title (GET .../room, nothing made) and
// joins it (POST .../room/join, the member's own token), by the event's id,
// as the calendar's own API names it; a link's and a room's doors go on as
// they were (POST /calls/door).

const http = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }))
vi.mock("@/lib/axiosInstance", async () => (await import("@/lib/testing/axiosInstance")).axiosInstanceModule({ default: http }))

const { enterByDoor, getEventRoom } = await import("@/services/callInviteService")

const EVENT = "0b8a3c1e-1d2f-4a5b-8c7d-9e0f1a2b3c16"

afterEach(() => {
  http.get.mockReset()
  http.post.mockReset()
})

describe("an event's call room, at its member door", () => {
  it("is joined by the event's id, with the member's language, its failure left to the door", async () => {
    http.post.mockResolvedValue({ data: { data: { token: "tok", room: `meet-${EVENT}`, title: "Roadmap review" } } })
    expect(await enterByDoor({ event: EVENT }, "hi-IN")).toEqual({ token: "tok", room: `meet-${EVENT}`, title: "Roadmap review" })
    expect(http.post).toHaveBeenCalledWith(`/calendar/events/${EVENT}/room/join`, { language: "hi-IN" }, { suppressErrorToast: true })
    // An instance's id, as the calendar writes it, reaches the server whole.
    await enterByDoor({ event: `${EVENT}_20261021T100000Z` })
    expect(http.post).toHaveBeenLastCalledWith(`/calendar/events/${EVENT}_20261021T100000Z/room/join`, {}, { suppressErrorToast: true })
  })

  it("leaves a link's and a room's doors as they were", async () => {
    http.post.mockResolvedValue({ data: { data: { token: "tok", room: "meet-m1", title: "Maya Chen's room" } } })
    await enterByDoor({ slug: "maya-chen", unlock: "k1" }, "en-GB")
    expect(http.post).toHaveBeenCalledWith("/calls/door", { slug: "maya-chen", unlock: "k1", language: "en-GB" }, { suppressErrorToast: true })
  })

  it("reads the room's title, and says how a read failed for the door to tell", async () => {
    http.get.mockResolvedValueOnce({ data: { data: { title: "Roadmap review", join: `/app/meet/e/${EVENT}` } } })
    expect(await getEventRoom(EVENT)).toEqual({ ok: true, data: { title: "Roadmap review", join: `/app/meet/e/${EVENT}` } })
    expect(http.get).toHaveBeenCalledWith(`/calendar/events/${EVENT}/room`, { suppressErrorToast: true })
    http.get.mockRejectedValueOnce({ response: { status: 404, data: { msg: "Event not found" } } })
    expect(await getEventRoom(EVENT)).toMatchObject({ ok: false, status: 404 })
    // No answer at all: the door waits it out and asks again.
    http.get.mockRejectedValueOnce({ isAxiosError: true, message: "Network Error" })
    expect(await getEventRoom(EVENT)).toMatchObject({ ok: false, status: 0 })
  })

  // The id comes from the page's address, so whatever is typed there stays one part of the API's path.
  it("keeps an id from the address one part of the path, at the read and at Join", async () => {
    const typed = "a/../b?c"
    http.get.mockResolvedValueOnce({ data: { data: { title: "Roadmap review", join: "/app/meet/e/x" } } })
    await getEventRoom(typed)
    expect(http.get).toHaveBeenCalledWith("/calendar/events/a%2F..%2Fb%3Fc/room", { suppressErrorToast: true })
    http.post.mockResolvedValueOnce({ data: { data: { token: "tok", room: "meet-x", title: "Roadmap review" } } })
    await enterByDoor({ event: typed })
    expect(http.post).toHaveBeenCalledWith("/calendar/events/a%2F..%2Fb%3Fc/room/join", {}, { suppressErrorToast: true })
  })
})
