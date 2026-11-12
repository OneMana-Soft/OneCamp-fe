import { describe, expect, it } from "vitest"
import { pinTestClock } from "@/lib/testing/testClock"
import { TRASH_PAGE, nextBefore, restoreEventRequest, trashReadRequest, trashedWindow, type TrashedEvent } from "@/lib/calendar/trash"

// The calendar's trash (calendar head B, gcal-1a): the reader's own events deleted in the last 30 days, newest first,
// read 50 at a time by the oldest deletion seen; Restore brings one back where it was.
const gone = (id: string, deleted: string, more: Partial<TrashedEvent> = {}): TrashedEvent => ({
  id,
  title: `Event ${id}`,
  start: { at: "2026-10-21T14:00:00Z", zone: "Europe/London" },
  end: { at: "2026-10-21T15:00:00Z" },
  all_day: false,
  deleted_at: deleted,
  ...more,
})

describe("the calendar's trash, 2026-10-21", () => {
  pinTestClock()

  it("reads its first page from the trash, and each next one after the last row seen, by its deletion and its id, quietly", () => {
    expect(trashReadRequest()).toEqual({ method: "GET", apiEndpoint: "/calendar/events", appendToUrl: "/trash", quiet: true })
    // An instance's id is "<series>_<start>", sent exactly as the trash gave it.
    expect(trashReadRequest({ before: "2026-10-01T09:30:00.000Z", before_id: "ser-1_2026-10-21T14:00:00Z" }).appendToUrl).toBe(
      "/trash?before=2026-10-01T09%3A30%3A00.000Z&before_id=ser-1_2026-10-21T14%3A00%3A00Z",
    )
  })

  it("asks for another page only after a full one, from its last row's deletion and id", () => {
    const full = Array.from({ length: TRASH_PAGE }, (_, i) => gone(`e${i}`, `2026-10-${String(20 - (i % 20)).padStart(2, "0")}T10:00:00Z`))
    expect(nextBefore(full)).toEqual({ before: full[TRASH_PAGE - 1].deleted_at, before_id: `e${TRASH_PAGE - 1}` })
    expect(nextBefore([gone("a", "2026-10-20T10:00:00Z")])).toBeUndefined()
    expect(nextBefore([])).toBeUndefined()
  })

  // V-603: events deleted at once share their deletion to the microsecond (a series with its exceptions, a batch).
  // Paged by the deletion alone, the 51st of 51 such fell between pages and never showed, so never came back.
  it("pages 51 events deleted at once by the 50th's id, so the 51st is on the next page", () => {
    const at = "2026-10-20T10:00:00.123456Z"
    // The server's order: newest deletion first, then by id.
    const all = Array.from({ length: TRASH_PAGE + 1 }, (_, i) => gone(`ev-${String(i).padStart(2, "0")}`, at))
    const first = all.slice(0, TRASH_PAGE)
    expect(trashReadRequest(nextBefore(first)).appendToUrl).toBe(`/trash?before=${encodeURIComponent(at)}&before_id=ev-49`)
  })

  it("restores through the calendar's own API, quietly: the row says how it went", () => {
    expect(restoreEventRequest("ev/1")).toEqual({ method: "POST", apiEndpoint: "/calendar/events", appendToUrl: "/ev%2F1/restore", quiet: true })
  })

  it("places a restored event by its own window: a timed one by its instants, an all-day one by its dates", () => {
    expect(trashedWindow(gone("a", "x"))).toEqual({ from: new Date("2026-10-21T14:00:00Z"), to: new Date("2026-10-21T15:00:00Z") })
    const day = trashedWindow(gone("b", "x", { all_day: true, start: { date: "2026-10-22" }, end: { date: "2026-10-24" } }))
    expect(day.from.getFullYear()).toBe(2026)
    expect([day.from.getMonth(), day.from.getDate()]).toEqual([9, 22])
    expect([day.to.getMonth(), day.to.getDate()]).toEqual([9, 24])
  })

  // CR-B19 row 2668, L1: a date is read as the grid reads one (lib/calendar/allDay localDate), never rolled on.
  it("reads a date that isn't one as no day, never the day it would roll into", () => {
    const day = trashedWindow(gone("c", "x", { all_day: true, start: { date: "2026-02-30" }, end: { date: "2026-03-01" } }))
    expect(day.from.getTime()).toBeNaN()
  })
})
