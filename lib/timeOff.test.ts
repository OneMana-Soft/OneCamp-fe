import { describe, expect, it } from "vitest"
import { awayWorkingDays, capacityAfterTimeOff, wholeDays } from "@/lib/timeOff"

const at = (d: number, h = 0, m = 0) => new Date(2026, 9, d, h, m)

describe("whole days", () => {
  it("stretch a span to midnight before and after", () => {
    expect(wholeDays(at(12, 10), at(14, 11))).toEqual({ start: at(12), end: at(15) })
  })
  it("treat an end at midnight as the end of the day before", () => {
    expect(wholeDays(at(12), at(15))).toEqual({ start: at(12), end: at(15) })
  })
  it("make an hour on one day that day", () => {
    expect(wholeDays(at(12, 9), at(12, 10))).toEqual({ start: at(12), end: at(13) })
  })
})

describe("working days away", () => {
  // The week of Monday 12 Oct 2026.
  const monday = at(12)
  it("count the weekdays a span covers", () => {
    expect(awayWorkingDays([{ start: at(12), end: at(15) }], monday)).toBe(3)
  })
  it("leave weekends out", () => {
    expect(awayWorkingDays([{ start: at(16), end: at(19) }], monday)).toBe(1)
  })
  it("count a day when time off covers most of it", () => {
    expect(awayWorkingDays([{ start: at(12), end: at(14) }, { start: at(14), end: at(14, 13) }], monday)).toBe(3)
    expect(awayWorkingDays([{ start: at(14, 9), end: at(14, 15) }], monday)).toBe(0)
  })
  it("count a day off marked in another time zone once, not twice", () => {
    // Midnight to midnight five and a half hours away: 13.5 hours of one of
    // the reader's days and 10.5 of the next.
    expect(awayWorkingDays([{ start: at(13, 10, 30), end: at(14, 10, 30) }], monday)).toBe(1)
  })
  it("count nothing outside the week", () => {
    expect(awayWorkingDays([{ start: at(5), end: at(10) }], monday)).toBe(0)
  })
})

describe("capacity after time off", () => {
  it("takes the days' share", () => {
    expect(capacityAfterTimeOff(5, 0)).toBe(5)
    expect(capacityAfterTimeOff(5, 2)).toBe(3)
    expect(capacityAfterTimeOff(10, 1)).toBe(8)
    expect(capacityAfterTimeOff(5, 5)).toBe(0)
  })
})
