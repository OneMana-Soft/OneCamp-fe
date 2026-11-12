import { describe, expect, it, vi } from "vitest"
import type { CalendarEventInterface } from "@/types/calendar"
import type { TellChoice } from "@/components/calendar/tellGuestsDialog"
import type { RepeatScope } from "@/lib/calendar/repeat"
import { NOT_EMAILED } from "@/lib/calendar/tellGuests"
import { pinTestClock } from "@/lib/testing/testClock"
import * as series from "./seriesChanges"

pinTestClock()

/** usePost's makeRequest, as a mock of what the server answers. */
const postWith = (answer: (req: { method?: string }) => unknown) => {
  const makeRequest = vi.fn(async (req: { method?: string }) => answer(req))
  return { makeRequest, post: { makeRequest } as unknown as Parameters<typeof series.sendTimes>[0] }
}

// CAL-11: the grid's moves went through /event/updateEvent with the event's
// title, its cached notes and its members, at no version: a stale copy
// overwrote newer notes, and guests were always told. Now its times alone.
describe("an event's new times", () => {
  const review = {
    event_uuid: "e1",
    event_title: "Design review",
    event_description: "Notes as the grid last read them",
    event_start_time: "2026-10-19T10:00:00.000Z",
    event_end_time: "2026-10-19T11:00:00.000Z",
    event_participants: [{ user_uuid: "maya", user_name: "Maya" }],
  } as unknown as CalendarEventInterface
  const start = new Date("2026-10-21T11:00:00.000Z")
  const end = new Date("2026-10-21T12:00:00.000Z")

  it("sendTimes reads the sequence and patches start and end alone", async () => {
    const { makeRequest, post } = postWith((req) => (req.method === "GET" ? { id: "e1", sequence: 4, all_day: false } : {}))
    await series.sendTimes(post, review, start, end, { notify: "none" })
    expect(makeRequest.mock.calls[0][0]).toMatchObject({ method: "GET", apiEndpoint: "/calendar/events", appendToUrl: "/e1" })
    const patch = makeRequest.mock.calls[1][0] as { method: string; appendToUrl: string; payload: unknown; quiet: boolean }
    expect(patch).toMatchObject({ method: "PATCH", appendToUrl: "/e1", quiet: true })
    expect(patch.payload).toEqual({ sequence: 4, start: { at: start.toISOString(), zone: expect.any(String) }, end: { at: end.toISOString() }, notify: "none" })
  })

  it("moves an all-day event by its dates, and an instance for the scope picked", async () => {
    const { makeRequest, post } = postWith((req) => (req.method === "GET" ? { id: "e1", sequence: 1, all_day: true } : {}))
    await series.sendTimes(post, review, new Date(2026, 9, 21), new Date(2026, 9, 22), { scope: "following" })
    expect(makeRequest.mock.calls[1][0]).toMatchObject({ payload: { sequence: 1, scope: "following", start: { date: "2026-10-21" }, end: { date: "2026-10-22" } } })
  })

  it("sends nothing when the event can't be read", async () => {
    const { makeRequest, post } = postWith(() => undefined)
    expect(await series.sendTimes(post, review, start, end)).toBeUndefined()
    expect(makeRequest).toHaveBeenCalledTimes(1)
  })

  it("on the old stores, sends the event whole through /event/updateEvent, as they take it", async () => {
    const { makeRequest, post } = postWith(() => ({}))
    await series.sendLegacyTimes(post, review, start, end)
    expect(makeRequest).toHaveBeenCalledWith({
      apiEndpoint: "/event/updateEvent/e1",
      payload: { title: "Design review", description: "Notes as the grid last read them", startTime: start.toISOString(), endTime: end.toISOString(), participants: ["maya"], isFocus: false, isAway: false },
    })
  })

  it("says a move someone else's change beat, and any other refusal in the server's words", () => {
    expect(series.notMoved(review, { response: { status: 409, data: {} } })).toEqual({ title: "Someone changed “Design review” meanwhile", description: "It's back where it was. Try again.", variant: "destructive" })
    expect(series.notMoved(review, { response: { status: 403, data: { msg: "Only the person who made this event can change it." } } })).toEqual({
      title: "Couldn't move “Design review”",
      description: "Only the person who made this event can change it.",
      variant: "destructive",
    })
  })
})

// CAL-11, CR-250 F1, F2, F7 (and C23): the questions a move on the grid asks
// (moveEvent), each answer carried to what is sent, or the block put back.
describe("a move's questions", () => {
  const SERIES = "5e1f0000-0000-4000-8000-0000000000aa"
  const was = { start: "2026-10-19T10:00:00.000Z", end: "2026-10-19T10:15:00.000Z" }
  const start = new Date("2026-10-19T11:00:00.000Z")
  const end = new Date("2026-10-19T11:15:00.000Z")
  // Sam's, with Maya on it: a move would tell her.
  const withMaya = (more: Record<string, unknown>) =>
    ({ event_title: "Standup", event_start_time: was.start, event_end_time: was.end, event_created_by: { user_uuid: "sam" }, event_guests: [{ user_uuid: "maya" }], ...more }) as unknown as CalendarEventInterface
  const instance = withMaya({ event_uuid: `${SERIES}_20261019T100000Z` })
  /** The calendar's side of a move, the scope and Tell guests? questions answered as given; its one store at sequence 2. */
  const depsWith = ({ scope = null, tell = null }: { scope?: RepeatScope | null; tell?: TellChoice | null } = {}) => {
    const { makeRequest, post } = postWith((req) => (req.method === "GET" ? { id: "e", sequence: 2, all_day: false } : {}))
    const deps = { post, toast: vi.fn(), confirm: vi.fn(), askScope: vi.fn(async () => scope), askTell: vi.fn(async () => tell), draw: vi.fn(), reread: vi.fn(), again: vi.fn(), full: true }
    return { makeRequest, deps, moveDeps: deps as unknown as series.MoveDeps }
  }
  const patches = (makeRequest: ReturnType<typeof postWith>["makeRequest"]) =>
    makeRequest.mock.calls.map(([r]) => r as { method?: string; payload?: unknown }).filter((r) => r.method === "PATCH")

  it("sends Don't send with a series moved this and following, and says its guests weren't emailed (F1)", async () => {
    const { makeRequest, deps, moveDeps } = depsWith({ scope: "following", tell: "none" })
    expect(await series.moveEvent(moveDeps, instance, start, end, {})).toBeNull()
    expect(deps.askScope).toHaveBeenCalledWith("change")
    expect(deps.askTell).toHaveBeenCalledWith("change")
    expect(patches(makeRequest)).toHaveLength(1)
    expect(patches(makeRequest)[0].payload).toMatchObject({ scope: "following", notify: "none" })
    expect(deps.toast).toHaveBeenCalledWith({ title: "Moved “Standup”", description: `This and the following events moved. ${NOT_EMAILED}` })
    expect(deps.reread).toHaveBeenCalled()
  })

  it("puts the block back where it was, and sends nothing, when which events? is closed (F2)", async () => {
    const { makeRequest, deps, moveDeps } = depsWith()
    expect(await series.moveEvent(moveDeps, instance, start, end, {})).toBeNull()
    // Drawn where it was dropped while asked, then back at its old times.
    expect(deps.draw.mock.calls).toEqual([[start.toISOString(), end.toISOString()], [was.start, was.end, false]])
    expect(deps.askTell).not.toHaveBeenCalled()
    expect(makeRequest).not.toHaveBeenCalled()
  })

  it("sends an Undo with the move's own answer, asking nothing again (C23)", async () => {
    const { makeRequest, deps, moveDeps } = depsWith({ tell: "send" })
    const back = { start: new Date(was.start), end: new Date(was.end) }
    expect(await series.moveEvent(moveDeps, withMaya({ event_uuid: "e1", event_start_time: start.toISOString(), event_end_time: end.toISOString() }), back.start, back.end, { undoing: true, notify: "none" })).toBeNull()
    expect(deps.askTell).not.toHaveBeenCalled()
    expect(patches(makeRequest)).toHaveLength(1)
    expect(patches(makeRequest)[0].payload).toMatchObject({ start: { at: was.start }, notify: "none" })
    expect(deps.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Moved “Standup” back" }))
  })

  // Booked through a page, then a teammate added: its own question, naming its guest, is the one asked.
  it("asks a booked meeting with a guest only its own question, and sends once that is confirmed (F7)", async () => {
    const booked = withMaya({ event_uuid: "e3", event_booking: { guest_name: "Alex Kim", page_title: "Intro call", guest_told: true } })
    const { makeRequest, deps, moveDeps } = depsWith({ tell: "send" })
    expect(await series.moveEvent(moveDeps, booked, start, end, {})).toBeNull()
    expect(deps.confirm).toHaveBeenCalledTimes(1)
    expect(makeRequest).not.toHaveBeenCalled()
    deps.confirm.mock.calls[0][0].onConfirm()
    const how = deps.again.mock.calls[0][0]
    expect(how).toEqual({ from: was, confirmed: true })
    expect(await series.moveEvent(moveDeps, booked, start, end, how)).toEqual({ ...was, scope: undefined, notify: undefined })
    expect(deps.askTell).not.toHaveBeenCalled()
    expect(patches(makeRequest)).toHaveLength(1)
    expect(patches(makeRequest)[0].payload).not.toHaveProperty("notify")
  })
})
