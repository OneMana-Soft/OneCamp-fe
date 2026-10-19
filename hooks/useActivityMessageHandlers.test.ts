import { describe, expect, it } from "vitest"
import { showsEvent } from "./useActivityMessageHandlers"

// Calendar A2: a notice about an event (an invitation, a change, an answer)
// has the calendar read again: its lists, and that event when it's open.
describe("what a notice about an event reads again", () => {
  const id = "0b8a3c1e-1d2f-4a5b-8c7d-9e0f1a2b3c4d"
  it("is every list of the calendar's events, and that event and its instances alone", () => {
    expect(showsEvent("/event/getEvents?startDate=a&endDate=b", id)).toBe(true)
    expect(showsEvent(`/event/getEvent/${id}`, id)).toBe(true)
    expect(showsEvent(`/event/getEvent/${id}_20261020T081500Z`, id)).toBe(true)
    expect(showsEvent(`/calendar/events/${id}`, id)).toBe(true)
    expect(showsEvent("/event/getEvent/another", id)).toBe(false)
    expect(showsEvent("/user/getSelfProfile", id)).toBe(false)
    expect(showsEvent(["/event/getEvent", id], id)).toBe(false)
    expect(showsEvent(`/event/getEvent/${id}`, undefined)).toBe(false)
  })
})
