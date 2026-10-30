import { describe, expect, it } from "vitest"
import { endOfDay } from "date-fns"
import { monthGridRange } from "@/components/calendar/calendarLayout"
import { askedRange, gridDays, shownRange, spanWords, stepAnchor, weekNumber } from "@/lib/calendar/viewRange"
import { weekRow } from "@/components/calendar/monthView"
import { placeItems } from "@/components/calendar/calendarLayout"
import { pinTestClock } from "@/lib/testing/testClock"

// Today is TEST_TODAY wherever the code under test reads the time.
pinTestClock()

// Thursday 29 October 2026. October's grid (weeks from Monday) runs from
// Monday 28 September to Sunday 1 November.
const thu = new Date(2026, 9, 29, 15, 30)
const day = (m: number, d: number, y = 2026) => new Date(y, m, d)

describe("a custom view's length", () => {
  it("says itself in words", () => {
    expect(spanWords("4d")).toBe("4 days")
    expect(spanWords("2w")).toBe("2 weeks")
  })
})

describe("what a view shows", () => {
  it("shows a custom number of days from the date, as Google's custom view does", () => {
    expect(shownRange("custom", thu, { span: "4d" })).toEqual({ start: day(9, 29), end: endOfDay(day(10, 1)) })
  })

  it("shows a custom number of weeks from the date's week", () => {
    expect(shownRange("custom", thu, { span: "2w" })).toEqual({ start: day(9, 26), end: endOfDay(day(10, 8)) })
    expect(shownRange("custom", thu, { span: "2w", weekStartsOn: 0 })).toEqual({ start: day(9, 25), end: endOfDay(day(10, 7)) })
  })

  it("shows the day, the week, the month's grid and the year", () => {
    expect(shownRange("day", thu, {})).toEqual({ start: day(9, 29), end: endOfDay(day(9, 29)) })
    expect(shownRange("week", thu, {})).toEqual({ start: day(9, 26), end: endOfDay(day(10, 1)) })
    expect(shownRange("month", thu, {})).toEqual(monthGridRange(thu))
    expect(shownRange("year", thu, {})).toEqual({ start: day(0, 1), end: endOfDay(day(11, 31)) })
  })
})

describe("what the calendar asks for", () => {
  it("asks for the month's grid, as today, for every view inside it", () => {
    for (const view of ["day", "week", "month", "agenda"] as const) expect(askedRange(view, thu, {})).toEqual(monthGridRange(thu))
    expect(askedRange("custom", day(9, 5), { span: "4d" })).toEqual(monthGridRange(thu))
  })

  it("joins a range that runs past the grid to it, so the days after come in the same answer", () => {
    // Friday 30 October to Monday 2 November: one day past October's grid.
    expect(askedRange("custom", day(9, 30), { span: "4d" })).toEqual({ start: day(8, 28), end: endOfDay(day(10, 2)) })
  })

  it("asks for a whole year at once", () => {
    expect(askedRange("year", thu, {})).toEqual({ start: day(0, 1), end: endOfDay(day(11, 31)) })
  })
})

describe("J and K", () => {
  it("move a custom view by its length", () => {
    expect(stepAnchor("custom", thu, 1, { span: "4d" })).toEqual(new Date(2026, 10, 2, 15, 30))
    expect(stepAnchor("custom", thu, -1, { span: "2w" })).toEqual(new Date(2026, 9, 15, 15, 30))
  })

  it("move the other views by a day, a week, a month or a year", () => {
    expect(stepAnchor("day", thu, 1, {})).toEqual(new Date(2026, 9, 30, 15, 30))
    expect(stepAnchor("week", thu, -1, {})).toEqual(new Date(2026, 9, 22, 15, 30))
    expect(stepAnchor("month", thu, 1, {})).toEqual(new Date(2026, 10, 29, 15, 30))
    expect(stepAnchor("year", thu, 1, {})).toEqual(new Date(2027, 9, 29, 15, 30))
  })
})

describe("weekends hidden", () => {
  const fri = day(9, 30)
  it("leave the week its five weekdays to draw", () => {
    expect(gridDays("week", thu, { weekends: false })).toEqual([26, 27, 28, 29, 30].map((d) => day(9, d)))
    expect(gridDays("week", thu, {})).toHaveLength(7)
  })

  it("make a custom view's days weekdays, and J step past the weekend", () => {
    expect(gridDays("custom", fri, { span: "4d", weekends: false })).toEqual([day(9, 30), day(10, 2), day(10, 3), day(10, 4)])
    expect(shownRange("custom", fri, { span: "4d", weekends: false })).toEqual({ start: day(9, 30), end: endOfDay(day(10, 4)) })
    // From a Saturday, the view starts on Monday.
    expect(shownRange("custom", day(9, 31), { span: "2d", weekends: false })).toEqual({ start: day(10, 2), end: endOfDay(day(10, 3)) })
    expect(stepAnchor("custom", fri, 1, { span: "4d", weekends: false })).toEqual(day(10, 5))
  })

  it("take a month row's weekend columns out, its bars kept to the days left", () => {
    const items = placeItems([
      { event_uuid: "fri-sun", event_title: "Trip", event_start_time: day(9, 30).toISOString(), event_end_time: day(10, 2).toISOString() },
      { event_uuid: "sat", event_title: "Hike", event_start_time: day(9, 31, 2026).toISOString(), event_end_time: day(10, 1).toISOString() },
      { event_uuid: "wed-thu", event_title: "Offsite", event_start_time: day(9, 28).toISOString(), event_end_time: day(9, 30).toISOString() },
    ])
    const row = weekRow(day(9, 26), items, { weekends: false })
    expect(row.days).toEqual([26, 27, 28, 29, 30].map((d) => day(9, d)))
    const bars = row.tracks.flat().map((b) => [b.item.event_uuid, b.col, b.span])
    expect(bars).toEqual(expect.arrayContaining([["fri-sun", 4, 1], ["wed-thu", 2, 2]]))
    expect(bars.map((b) => b[0])).not.toContain("sat")
    expect(weekRow(day(9, 26), items, {}).days).toHaveLength(7)
  })
})

describe("week numbers", () => {
  it("count ISO weeks from Monday, and from the first of January otherwise", () => {
    expect(weekNumber(day(0, 4), 1)).toBe(1)
    expect(weekNumber(day(0, 4), 0)).toBe(2)
    expect(weekNumber(thu, 1)).toBe(44)
  })
})
