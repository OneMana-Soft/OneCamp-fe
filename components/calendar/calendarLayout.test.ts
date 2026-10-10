import { describe, expect, it } from "vitest"
import { addDays, isWithinInterval, startOfWeek } from "date-fns"
import { dayKey, itemsByDay, layoutWeek, monthGridRange, placeItems } from "./calendarLayout"

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
  it("is the month grid around the date, which holds every week of that month", () => {
    for (const d of [1, 10, 31]) {
      const anchor = new Date(2026, 9, d)
      const range = monthGridRange(anchor)
      const ws = startOfWeek(anchor)
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

