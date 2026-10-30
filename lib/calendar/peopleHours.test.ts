import { describe, expect, it } from "vitest"
import { inHours, theirTime } from "./peopleHours"
import { pinTestClock } from "@/lib/testing/testClock"

// The dates below are their own instants; the clock is pinned all the same.
pinTestClock()

const jonas = { tz: "Europe/London", week: { "1": [{ start: "09:00", end: "12:30" }, { start: "13:30", end: "17:00" }] } }

// Calendar A3: a time in someone's hours, in their zone.
describe("someone's working hours", () => {
  it("holds a time inside one of their ranges, that day, in their zone", () => {
    // Monday 19 Oct 2026: London is GMT+1.
    expect(inHours(jonas, new Date("2026-10-19T09:00:00Z"), new Date("2026-10-19T09:30:00Z"))).toBe(true) // 10:00 London
  })

  it("isn't across their lunch, before they start, or on a day off", () => {
    expect(inHours(jonas, new Date("2026-10-19T11:15:00Z"), new Date("2026-10-19T11:45:00Z"))).toBe(false) // 12:15–12:45
    expect(inHours(jonas, new Date("2026-10-19T07:30:00Z"), new Date("2026-10-19T08:00:00Z"))).toBe(false) // 08:30
    expect(inHours(jonas, new Date("2026-10-20T09:00:00Z"), new Date("2026-10-20T09:30:00Z"))).toBe(false) // Tuesday
  })

  it("ends exactly at a range's end", () => {
    expect(inHours(jonas, new Date("2026-10-19T15:30:00Z"), new Date("2026-10-19T16:00:00Z"))).toBe(true) // 16:30–17:00
  })

  it("says the time it is for them", () => {
    expect(theirTime(new Date("2026-10-19T20:00:00Z"), "Europe/London")).toMatch(/^(21:00|9:00\sPM)$/)
  })
})
