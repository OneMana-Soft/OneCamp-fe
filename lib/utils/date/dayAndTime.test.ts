import { describe, expect, it } from "vitest"
import { dateTimeFormat, dayAndTime } from "./dayAndTime"

// The app's one formatter cache, and its one way to write a meeting's time
// (calendar audit: three private caches and five hand-built strings before).
describe("dateTimeFormat", () => {
  it("builds a formatter once per locale and options", () => {
    const a = dateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", month: "long" })
    expect(dateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", month: "long" })).toBe(a)
    expect(dateTimeFormat("en-GB", { timeZone: "UTC", month: "long" })).not.toBe(a)
  })

  it("throws for a zone the runtime doesn't know, and keeps nothing", () => {
    expect(() => dateTimeFormat("en-GB", { timeZone: "Mars/Olympus" })).toThrow()
    expect(() => dateTimeFormat("en-GB", { timeZone: "Mars/Olympus" })).toThrow()
  })
})

describe("dayAndTime", () => {
  it("writes the day once, and the end's day only when it differs", () => {
    expect(dayAndTime(new Date(2026, 9, 14, 10))).toBe("Wed 14 Oct, 10:00 AM")
    expect(dayAndTime(new Date(2026, 9, 14, 10), new Date(2026, 9, 14, 10, 30))).toBe("Wed 14 Oct, 10:00 AM – 10:30 AM")
    expect(dayAndTime(new Date(2026, 9, 14, 23), new Date(2026, 9, 15, 1))).toBe("Wed 14 Oct, 11:00 PM – Thu 15 Oct, 1:00 AM")
  })
})
