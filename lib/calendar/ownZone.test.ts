import { describe, expect, it } from "vitest"
import { pinTestClock } from "@/lib/testing/testClock"
import { ownZoneLine } from "./ownZone"

pinTestClock()

// The card says an event's own time where it keeps a zone the reader isn't
// in: 14:30 UTC on 16 Oct is 23:30 in Tokyo, 15:30 in London.
describe("an event's own time", () => {
  const start = new Date(Date.UTC(2026, 9, 16, 14, 30))
  const end = new Date(Date.UTC(2026, 9, 16, 15, 30))

  it("says the event's time in its own zone, under the reader's", () => {
    expect(ownZoneLine({ event_zone: "Asia/Tokyo" }, start, end, "Europe/London")).toMatch(/^11:30\sPM – 12:30\sAM in Tokyo$/)
  })

  it("says each end in its own zone when it ends in another", () => {
    expect(ownZoneLine({ event_zone: "Asia/Tokyo", event_end_zone: "Europe/London" }, start, end, "America/New_York")).toMatch(/^11:30\sPM in Tokyo – 4:30\sPM in London$/)
  })

  it("says nothing where the event keeps the reader's zone, keeps none, or keeps one the browser can't read", () => {
    expect(ownZoneLine({ event_zone: "Europe/London" }, start, end, "Europe/London")).toBe("")
    expect(ownZoneLine({ event_zone: "Asia/Kolkata" }, start, end, "Asia/Calcutta")).toBe("")
    expect(ownZoneLine({}, start, end, "Europe/London")).toBe("")
    expect(ownZoneLine({ event_zone: "Mars/Olympus_Mons" }, start, end, "Europe/London")).toBe("")
  })
})
