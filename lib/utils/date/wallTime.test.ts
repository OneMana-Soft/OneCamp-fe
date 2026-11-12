import { describe, expect, it } from "vitest"
import { pinTestClock } from "@/lib/testing/testClock"
import { atWall, wallOf } from "@/lib/utils/date/wallTime"

// V-642: a day and a time on a zone's clock, and back. The Event Form reads and writes an event's times on its own
// zone's clock; these hold wherever the reader is (the gate runs them in New York and in Kolkata).
describe("a time on a zone's clock", () => {
  pinTestClock()
  const at = new Date("2026-11-06T12:30:00Z")

  it("reads a moment on any zone's clock", () => {
    expect(wallOf(at, "America/New_York")).toEqual({ year: 2026, month: 10, day: 6, minutes: 7 * 60 + 30 })
    expect(wallOf(at, "Asia/Kolkata")).toEqual({ year: 2026, month: 10, day: 6, minutes: 18 * 60 })
    expect(wallOf(new Date("2026-11-07T01:00:00Z"), "America/New_York")).toEqual({ year: 2026, month: 10, day: 6, minutes: 20 * 60 })
  })

  it("finds the moment a zone's clock reads a time, and reads it back", () => {
    expect(atWall({ year: 2026, month: 10, day: 6, minutes: 7 * 60 + 30 }, "America/New_York")).toEqual(at)
    expect(atWall({ year: 2026, month: 10, day: 6, minutes: 18 * 60 }, "Asia/Kolkata")).toEqual(at)
    // Every quarter hour of the days the clocks change, in New York and London, comes back as it went.
    for (const [zone, days] of [["America/New_York", [[2, 8], [10, 1]]], ["Europe/London", [[2, 29], [9, 25]]]] as const) {
      for (const [month, day] of days) {
        for (let q = 0; q < 96; q++) {
          const moment = new Date(Date.UTC(2026, month, day) + q * 15 * 60_000)
          expect(atWall(wallOf(moment, zone), zone).getTime() === moment.getTime() || isSecondPass(moment, zone)).toBe(true)
        }
      }
    }
  })

  it("reads a time the clocks skip as the time after it, and a time they pass twice as the first", () => {
    // New York, 8 March 2026: 2:00 AM became 3:00 AM, so 2:30 AM is 3:30 AM, as a Date made for it on that clock is.
    expect(atWall({ year: 2026, month: 2, day: 8, minutes: 2 * 60 + 30 }, "America/New_York")).toEqual(new Date("2026-03-08T07:30:00Z"))
    // 1 November 2026: 1:30 AM came twice, first in summer time.
    expect(atWall({ year: 2026, month: 10, day: 1, minutes: 60 + 30 }, "America/New_York")).toEqual(new Date("2026-11-01T05:30:00Z"))
  })

  it("reads the device's own clock with no zone, or one this runtime can't read, as clockTime does", () => {
    const local = new Date(2026, 10, 6, 9, 15)
    expect(wallOf(local)).toEqual({ year: 2026, month: 10, day: 6, minutes: 9 * 60 + 15 })
    expect(atWall({ year: 2026, month: 10, day: 6, minutes: 9 * 60 + 15 })).toEqual(local)
    expect(wallOf(local, "Mars/Olympus_Mons")).toEqual(wallOf(local))
    expect(atWall(wallOf(local), "Mars/Olympus_Mons")).toEqual(local)
  })
})

// A moment in the hour a zone's clock passes twice, after its first pass: its time reads as the first pass's.
function isSecondPass(moment: Date, zone: string): boolean {
  const back = atWall(wallOf(moment, zone), zone)
  return back.getTime() === moment.getTime() - 60 * 60_000
}
