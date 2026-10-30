import { describe, expect, it } from "vitest"
import { dayAndTime } from "@/lib/utils/date/clock"
import { eventWhen } from "./eventWhen"
import { pinTestClock } from "@/lib/testing/testClock"

pinTestClock()

describe("eventWhen", () => {
  it("writes a timed event's day and time in the reader's own time, the app's one way", () => {
    const start = Date.UTC(2026, 9, 29, 9, 0) / 1000
    const end = start + 3600
    expect(eventWhen({ event_uuid: "e", event_start: start, event_end: end })).toBe(dayAndTime(new Date(start * 1000), new Date(end * 1000)))
    expect(eventWhen({ event_uuid: "e", event_start: start })).toBe(dayAndTime(new Date(start * 1000)))
  })

  it("writes an all-day event's days alone, its end being the day after its last", () => {
    expect(eventWhen({ event_uuid: "e", event_start_date: "2026-10-30", event_end_date: "2026-10-31" })).toBe("Fri 30 Oct")
    expect(eventWhen({ event_uuid: "e", event_start_date: "2026-10-30", event_end_date: "2026-11-02" })).toBe("Fri 30 Oct – Sun 1 Nov")
    expect(eventWhen({ event_uuid: "e", event_start_date: "2026-10-30" })).toBe("Fri 30 Oct")
  })

  it("says nothing when the hit says neither", () => {
    expect(eventWhen(undefined)).toBe("")
    expect(eventWhen({ event_uuid: "e" })).toBe("")
    expect(eventWhen({ event_uuid: "e", event_start_date: "30 Oct" })).toBe("")
  })
})
