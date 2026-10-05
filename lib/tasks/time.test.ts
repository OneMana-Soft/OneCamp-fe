import { describe, expect, it } from "vitest"
import { formatClock, formatDuration, parseDuration, presetRange } from "./time"

describe("parseDuration", () => {
  it.each([
    ["1h 30m", 90], ["1h30", 90], ["1h30m", 90], ["90m", 90], ["90", 90], ["1.5h", 90], ["1:30", 90],
    ["2 hours", 120], ["45 min", 45], ["  3h ", 180], ["24h", 1440],
  ])("%s is %i minutes", (input, want) => expect(parseDuration(input)).toBe(want))
  it.each(["", "0", "abc", "25h", "1:75", "-5", "0m"])("%s is refused", (input) => expect(parseDuration(input)).toBeNull())
})

describe("formatting", () => {
  it("reads durations the way people say them", () => {
    expect(formatDuration(0)).toBe("0m")
    expect(formatDuration(59)).toBe("0m")
    expect(formatDuration(45 * 60)).toBe("45m")
    expect(formatDuration(2 * 3600)).toBe("2h")
    expect(formatDuration(3900)).toBe("1h 05m")
  })
  it("shows a running clock", () => expect(formatClock(4809)).toBe("1:20:09"))
})

describe("presetRange", () => {
  const wed = new Date(2026, 9, 7, 15, 0) // Wednesday 7 Oct 2026
  it("starts weeks on Monday", () => {
    const { from, to } = presetRange("this-week", wed)
    expect(from).toEqual(new Date(2026, 9, 5))
    expect(to).toEqual(new Date(2026, 9, 8))
  })
  it("covers whole months", () => {
    const { from, to } = presetRange("last-month", wed)
    expect(from).toEqual(new Date(2026, 8, 1))
    expect(to).toEqual(new Date(2026, 9, 1))
  })
  it("treats Sunday as the end of its week", () => {
    expect(presetRange("this-week", new Date(2026, 9, 11, 9)).from).toEqual(new Date(2026, 9, 5))
  })
})
