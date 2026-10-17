import { describe, expect, it } from "vitest"
import { addDays, isWithinInterval, startOfWeek } from "date-fns"
import { dayKey, dayListTime, daySpan, itemsByDay, layoutWeek, monthGridRange, placeItems, WEEK_STARTS_ON, type DatedItem } from "./calendarLayout"
import { clockTime } from "@/lib/utils/date/clock"
import { pinTestClock } from "@/lib/testing/testClock"

// Today is TEST_TODAY wherever the code under test reads the time.
pinTestClock()

const at = (d: number, h = 0, m = 0) => new Date(2026, 9, d, h, m).toISOString()

describe("laying calendar items on days", () => {
  it("puts an item on each day it covers, but not on the day an event ends at midnight", () => {
    const placed = placeItems([
      { event_uuid: "away", event_title: "Away", event_start_time: at(16), event_end_time: at(20), event_is_away: true },
      { event_uuid: "task", event_title: "Ship", event_start_time: at(14, 17), event_end_time: at(15, 17), isTask: true },
    ])
    const byDay = itemsByDay(placed, new Date(2026, 9, 1), new Date(2026, 9, 31))
    const on = (d: number) => (byDay.get(dayKey(new Date(2026, 9, d))) || []).map((i) => i.event_uuid)
    expect(on(16)).toEqual(["away"])
    expect(on(19)).toEqual(["away"])
    expect(on(20)).toEqual([])
    expect(on(14)).toEqual(["task"])
    expect(on(15)).toEqual(["task"])
  })

  it("leaves out an item without a usable date", () => {
    expect(placeItems([{ event_uuid: "x", event_title: "?", event_start_time: "", event_end_time: "" }])).toEqual([])
  })
})

describe("laying a week out in rows", () => {
  const week = new Date(2026, 9, 11) // a Sunday
  it("packs bars that overlap into separate rows, longest first, and draws three rows at most", () => {
    const items = [
      { event_uuid: "long", event_title: "Offsite", event_start_time: at(12), event_end_time: at(15) },
      ...[1, 2, 3, 4].map((i) => ({ event_uuid: `m${i}`, event_title: `Meeting ${i}`, event_start_time: at(13, 9 + i), event_end_time: at(13, 10 + i) })),
    ]
    const tracks = layoutWeek(week, placeItems(items))
    expect(tracks).toHaveLength(3)
    expect(tracks[0][0].item.event_uuid).toBe("long")
    expect(tracks[0][0]).toMatchObject({ col: 1, span: 3, startsHere: true, endsHere: true })
    expect(tracks.flat().every((b) => b.span >= 1 && b.col + b.span <= 7)).toBe(true)
  })

  it("clips an item that runs on into the next week, and marks it as running on", () => {
    const [[bar]] = layoutWeek(week, placeItems([{ event_uuid: "trip", event_title: "Trip", event_start_time: at(16), event_end_time: at(21) }]))
    expect(bar).toMatchObject({ col: 5, span: 2, startsHere: true, endsHere: false })
  })
})

describe("what the calendar asks the server for", () => {
  it("starts its weeks on Monday", () => {
    expect(monthGridRange(new Date(2026, 9, 15)).start.getDay()).toBe(1)
  })

  it("is the month grid around the date, which holds every week of that month", () => {
    for (const d of [1, 10, 31]) {
      const anchor = new Date(2026, 9, d)
      const range = monthGridRange(anchor)
      const ws = startOfWeek(anchor, { weekStartsOn: WEEK_STARTS_ON })
      expect(isWithinInterval(ws, { start: range.start, end: range.end })).toBe(true)
      expect(isWithinInterval(addDays(ws, 6), { start: range.start, end: range.end })).toBe(true)
    }
  })
})

describe("an all-day item", () => {
  it("runs from one midnight to a later one", async () => {
    const { isAllDay } = await import("./calendarLayout")
    expect(isAllDay(new Date(2026, 9, 12), new Date(2026, 9, 13))).toBe(true)
    expect(isAllDay(new Date(2026, 9, 12), new Date(2026, 9, 15))).toBe(true)
    expect(isAllDay(new Date(2026, 9, 12, 9), new Date(2026, 9, 12, 10))).toBe(false)
    expect(isAllDay(new Date(2026, 9, 12), new Date(2026, 9, 12, 1))).toBe(false)
  })
})

// PTC-3: the agenda listed a day in the server's order: "Standup 18:45,
// Launch review 19:45, Launch day 09:30".
describe("a day's items", () => {
  it("read as the day does: what has no time of its own there first, then by start, then by name", () => {
    const placed = placeItems([
      { event_uuid: "standup", event_title: "Standup", event_start_time: at(15, 18, 45), event_end_time: at(15, 19) },
      { event_uuid: "review", event_title: "Launch review", event_start_time: at(15, 19, 45), event_end_time: at(15, 20, 30) },
      { event_uuid: "launch", event_title: "Launch day", event_start_time: at(15, 9, 30), event_end_time: at(16, 9, 30) },
      { event_uuid: "offsite", event_title: "Offsite", event_start_time: at(15), event_end_time: at(16) },
      { event_uuid: "late", event_title: "Late call", event_start_time: at(14, 23), event_end_time: at(15, 1) },
      { event_uuid: "ship", event_title: "Ship", event_start_time: at(15, 17), event_end_time: at(15, 17), isTask: true },
      { event_uuid: "early", event_title: "Early", event_start_time: at(15, 8), event_end_time: at(15, 9) },
    ])
    const byDay = itemsByDay(placed, new Date(2026, 9, 1), new Date(2026, 9, 31))
    expect(byDay.get("2026-10-15")!.map((i) => i.event_uuid)).toEqual(["late", "offsite", "ship", "early", "launch", "standup", "review"])
    expect(byDay.get("2026-10-16")!.map((i) => i.event_uuid)).toEqual(["launch"])
  })
})

// PTC-9: "Launch day", midnight to midnight in New York, is 09:30 to 09:30
// in India: it read "09:30 – 09:30" on a phone.
describe("an item's time on a day", () => {
  const day = (d: number) => new Date(2026, 9, d)
  const launch: DatedItem = { event_uuid: "launch", event_title: "Launch day", event_start_time: at(15, 9, 30), event_end_time: at(16, 9, 30) }

  it("runs from its start on its first day, until its end on its last, and all day between", () => {
    const [p] = placeItems([launch])
    expect(daySpan(p.item, p.start, p.end, day(15))).toEqual({ kind: "from", from: p.start })
    expect(daySpan(p.item, p.start, p.end, day(16))).toEqual({ kind: "until", to: p.end })
    const [long] = placeItems([{ ...launch, event_end_time: at(17, 9, 30) }])
    expect(daySpan(long.item, long.start, long.end, day(16))).toEqual({ kind: "allDay" })
  })

  it("is all day for an all-day event, due for a task, and its own times otherwise", () => {
    const [offsite, ship, standup] = placeItems([
      { event_uuid: "o", event_title: "Offsite", event_start_time: at(15), event_end_time: at(16) },
      { event_uuid: "s", event_title: "Ship", event_start_time: at(15, 17), event_end_time: at(15, 17), isTask: true },
      { event_uuid: "u", event_title: "Standup", event_start_time: at(15, 9), event_end_time: at(15, 9, 15) },
    ])
    expect(daySpan(offsite.item, offsite.start, offsite.end, day(15))).toEqual({ kind: "allDay" })
    expect(daySpan(ship.item, ship.start, ship.end, day(15))).toEqual({ kind: "due" })
    expect(daySpan(standup.item, standup.start, standup.end, day(15))).toEqual({ kind: "timed", from: standup.start, to: standup.end })
  })

  it("reads in a day's list as from and until, never the same clock twice", () => {
    expect(dayListTime(launch, day(15))).toBe(`From ${clockTime(new Date(2026, 9, 15, 9, 30))}`)
    expect(dayListTime(launch, day(16))).toBe(`Until ${clockTime(new Date(2026, 9, 16, 9, 30))}`)
  })
})
