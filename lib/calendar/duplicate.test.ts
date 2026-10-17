import { describe, expect, it } from "vitest"
import { duplicateOf } from "./duplicate"
import type { CalendarEventInterface } from "@/types/calendar"
import { pinTestClock } from "@/lib/testing/testClock"

// Today is TEST_TODAY wherever the code under test reads the time.
pinTestClock()

const SAM = { user_uuid: "sam", user_name: "Sam Rivera" }
const MAYA = { user_uuid: "maya", user_name: "Maya Chen" }
const review = (description: string): CalendarEventInterface => ({
  event_uuid: "e1",
  event_title: "Design review",
  event_description: description,
  event_start_time: "2026-10-15T10:00:00.000Z",
  event_end_time: "2026-10-15T11:00:00.000Z",
  event_participants: [SAM, MAYA] as CalendarEventInterface["event_participants"],
})

// EV-58: Duplicate copies an event as Google's does, but never its call link.
describe("a copy of an event", () => {
  it("keeps its title, times, kind and guests, but not you as your own guest", () => {
    const copy = duplicateOf({ ...review(""), event_is_focus: true }, null, "sam")
    expect(copy).toMatchObject({ title: "Design review", isFocus: true, isAway: false, guests: [{ uuid: "maya", name: "Maya Chen" }] })
    expect(copy.start.toISOString()).toBe("2026-10-15T10:00:00.000Z")
    expect(copy.end.toISOString()).toBe("2026-10-15T11:00:00.000Z")
  })

  it("keeps its notes without the call link, written plain or as a link", () => {
    const call = "https://meet.example.com/abc-defg?pwd=1&amp;x=2"
    expect(duplicateOf(review(`Agenda first\n${call}\nBring numbers`), call).description).toBe("Agenda first\n\nBring numbers")
    expect(duplicateOf(review(`<p>Agenda</p><p><a href="${call}" rel="noopener">${call}</a></p>`), call).description).toBe("<p>Agenda</p>")
    expect(duplicateOf(review("<p>Agenda</p>"), null).description).toBe("<p>Agenda</p>")
  })

  it("keeps a Google all-day event on its dates", () => {
    const copy = duplicateOf({ ...review(""), event_all_day: true, event_start_date: "2026-10-15", event_end_date: "2026-10-16" }, null)
    expect(copy.start).toEqual(new Date(2026, 9, 15))
    expect(copy.end).toEqual(new Date(2026, 9, 16))
  })
})
