import { afterEach, describe, expect, it } from "vitest"

import { localMidnight } from "./localMidnight"
import { pinTestClock } from "@/lib/testing/testClock"

// Days and their midnights: every test here sets the clock it reads by (app/testClock.test.ts).
pinTestClock()

const zone = process.env.TZ
afterEach(() => {
  if (zone === undefined) delete process.env.TZ
  else process.env.TZ = zone
})

describe("a day's local midnight", () => {
  it("is the day's start in the browser's zone, in RFC 3339 with the zone's offset", () => {
    process.env.TZ = "Asia/Kolkata"
    expect(localMidnight("2026-11-02")).toBe("2026-11-02T00:00:00+05:30")
    process.env.TZ = "Asia/Kathmandu"
    expect(localMidnight("2026-11-02")).toBe("2026-11-02T00:00:00+05:45")
    process.env.TZ = "America/St_Johns"
    expect(localMidnight("2026-01-15")).toBe("2026-01-15T00:00:00-03:30")
    process.env.TZ = "UTC"
    expect(localMidnight("2026-11-02")).toBe("2026-11-02T00:00:00+00:00")
  })

  it("moves on by calendar days, never by 24 hours: across a clock change, a month's end and a year's end", () => {
    process.env.TZ = "America/New_York"
    expect(localMidnight("2026-03-08", 1)).toBe("2026-03-09T00:00:00-04:00")
    expect(localMidnight("2026-11-01", 1)).toBe("2026-11-02T00:00:00-05:00")
    expect(localMidnight("2026-02-28", 1)).toBe("2026-03-01T00:00:00-05:00")
    expect(localMidnight("2026-12-31", 1)).toBe("2027-01-01T00:00:00-05:00")
  })

  it("is nothing for text that isn't a real day", () => {
    for (const text of ["", "2026-02-31", "2026-13-01", "2026-1-5", "05/11/2026", "2026-11-02T00:00:00Z", " 2026-11-02"]) expect(localMidnight(text), text).toBeUndefined()
  })
})
