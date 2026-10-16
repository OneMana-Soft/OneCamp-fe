import { describe, expect, it } from "vitest"
import { browserTZ, localDay } from "./timeZone"
import { pinTestClock } from "@/lib/testing/testClock"

pinTestClock()

describe("localDay", () => {
  it("is the day where the viewer is, padded", () => {
    expect(localDay(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05")
    expect(localDay(new Date(2026, 9, 31, 0, 1))).toBe("2026-10-31")
  })
  it("defaults to today", () => {
    expect(localDay()).toBe(localDay(new Date()))
  })
})

describe("browserTZ", () => {
  it("names a zone", () => {
    expect(browserTZ()).toMatch(/\S/)
  })
})

describe("a day as a date and back", () => {
  it("reads YYYY-MM-DD as that day's midnight where the viewer is, not in UTC (PTC-37)", async () => {
    const { dayDate, localDay } = await import("./timeZone")
    const d = dayDate("2026-10-14")!
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()]).toEqual([2026, 9, 14, 0])
    expect(localDay(d)).toBe("2026-10-14")
    expect(dayDate("14/10/2026")).toBeUndefined()
    expect(dayDate("")).toBeUndefined()
    expect(dayDate(undefined)).toBeUndefined()
  })
})
