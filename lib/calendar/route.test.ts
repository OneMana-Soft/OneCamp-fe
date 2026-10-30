import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { calendarPlace, calendarRoute, parseSpan } from "./route"
import { opensEditing } from "./editParam"
import { pinTestClock } from "@/lib/testing/testClock"

// Today is TEST_TODAY wherever the code under test reads the time.
pinTestClock()

describe("calendarRoute", () => {
  it("opens an event alone at its page", () => {
    expect(calendarRoute({ event: "e-1" })).toBe("/app/calendar/event/e-1")
    expect(calendarRoute({ event: "gcal-abc123" })).toBe("/app/calendar/event/gcal-abc123")
  })

  // V-34: the card's pencil, Edit event, opens the event's page editing.
  it("opens an event alone at its page editing, when asked, and only there", () => {
    expect(calendarRoute({ event: "e-1", edit: true })).toBe("/app/calendar/event/e-1?edit=1")
    expect(calendarRoute({ event: "e-1", edit: false })).toBe("/app/calendar/event/e-1")
    expect(opensEditing(new URLSearchParams("edit=1"))).toBe(true)
    expect(opensEditing(new URLSearchParams("edit=0"))).toBe(false)
    expect(opensEditing(new URLSearchParams(""))).toBe(false)
    // The calendar's own address never carries it: a computer edits in the panel.
    expect(calendarRoute({ date: new Date(2026, 10, 5), view: "week", event: "e-1", edit: true })).toBe("/app/calendar?date=2026-11-05&view=week&event=e-1")
  })

  it("opens the calendar for anything else", () => {
    expect(calendarRoute()).toBe("/app/calendar")
    expect(calendarRoute({ event: "" })).toBe("/app/calendar")
    expect(calendarRoute({ event: null })).toBe("/app/calendar")
  })

  it("says the day and the view, with the event open beside them", () => {
    const day = new Date(2026, 10, 5, 15, 30)
    expect(calendarRoute({ date: day, view: "month" })).toBe("/app/calendar?date=2026-11-05&view=month")
    expect(calendarRoute({ view: "week" })).toBe("/app/calendar?view=week")
    expect(calendarRoute({ date: day, view: "week", event: "e-1" })).toBe("/app/calendar?date=2026-11-05&view=week&event=e-1")
  })

  it("keeps the address's other parameters and replaces its own", () => {
    const others = new URLSearchParams("connector=success&date=2020-01-01&event=old")
    expect(calendarRoute({ view: "day" }, others)).toBe("/app/calendar?connector=success&view=day")
    expect(calendarRoute({}, new URLSearchParams("event=old"))).toBe("/app/calendar")
  })
})

describe("calendarPlace", () => {
  it("reads back what calendarRoute writes", () => {
    const day = new Date(2026, 10, 5)
    const url = new URL(calendarRoute({ date: day, view: "month", event: "e-1" }), "http://x")
    const place = calendarPlace(url.searchParams)
    expect(place.date?.getTime()).toBe(day.getTime())
    expect(place).toMatchObject({ view: "month", event: "e-1" })
  })

  it("leaves out what isn't well formed", () => {
    expect(calendarPlace(new URLSearchParams("date=2026-02-31&view=decade&event=a%22b"))).toEqual({})
    expect(calendarPlace(new URLSearchParams("date=tomorrow"))).toEqual({})
    expect(calendarPlace(new URLSearchParams(""))).toEqual({})
  })
})

// From the review: the address wrote and read its day with date-fns' own
// "yyyy-MM-dd", a copy of the app's one local day (dayKey, localDay's name
// for the calendar, and dayDate back), which could drift from it.
describe("the address's day", () => {
  it("is written and read with the app's one day key", () => {
    const src = readFileSync(join(__dirname, "route.ts"), "utf8")
    expect(src).not.toMatch(/yyyy-MM-dd|from "date-fns"/)
    expect(src).toMatch(/\bdayKey\(/)
    expect(src).toMatch(/\bdayDate\(/)
  })
})

describe("the year in the address", () => {
  it("is a view of its own (B1, Y or 6)", () => {
    expect(calendarRoute({ date: new Date(2026, 9, 21), view: "year" })).toBe("/app/calendar?date=2026-10-21&view=year")
    expect(calendarPlace(new URLSearchParams("date=2026-10-21&view=year"))).toEqual({ date: new Date(2026, 9, 21), view: "year" })
  })
})

describe("a custom view in the address", () => {
  it("writes and reads its length, so a link shows the same view", () => {
    const to = calendarRoute({ date: new Date(2026, 9, 29), view: "custom", span: "4d" })
    expect(to).toBe("/app/calendar?date=2026-10-29&view=custom&span=4d")
    expect(calendarPlace(new URL(to, "https://x.test").searchParams)).toEqual({ date: new Date(2026, 9, 29), view: "custom", span: "4d" })
  })

  it("leaves out a length the custom view doesn't have", () => {
    expect(calendarPlace(new URLSearchParams("view=custom&span=9d"))).toEqual({ view: "custom" })
  })
})

describe("a custom view's length", () => {
  it("is 2 to 7 days or 2 to 4 weeks, as the address writes it", () => {
    expect(["2d", "4d", "7d", "2w", "4w"].map(parseSpan)).toEqual(["2d", "4d", "7d", "2w", "4w"])
    expect(["1d", "8d", "1w", "5w", "4", "", null, "4dd"].map(parseSpan)).toEqual(Array(8).fill(undefined))
  })
})
