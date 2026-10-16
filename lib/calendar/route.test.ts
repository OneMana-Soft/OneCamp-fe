import { describe, expect, it } from "vitest"
import { calendarRoute } from "./route"

// Day 0 is today's addresses: an event's page by its id, else the calendar.
describe("calendarRoute", () => {
  it("opens an event at its page", () => {
    expect(calendarRoute({ event: "e-1" })).toBe("/app/calendar/event/e-1")
    expect(calendarRoute({ event: "gcal-abc123" })).toBe("/app/calendar/event/gcal-abc123")
  })

  it("opens the calendar for anything else", () => {
    expect(calendarRoute()).toBe("/app/calendar")
    expect(calendarRoute({ event: "" })).toBe("/app/calendar")
    expect(calendarRoute({ event: null })).toBe("/app/calendar")
  })
})
