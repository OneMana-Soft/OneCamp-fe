import { describe, expect, it } from "vitest"
import { formatSendAt, schedulePresets, sendLaterProblem, toLocalInputValue } from "./schedulePresets"
import { pinTestClock } from "@/lib/testing/testClock"

pinTestClock()

// Local-time clocks: the presets are in the person's own zone.
const d = (y: number, m: number, day: number, h: number, min = 0) => new Date(y, m - 1, day, h, min)

describe("schedule presets", () => {
  it("offers later today, tomorrow and Monday on a weekday morning", () => {
    const p = schedulePresets(d(2026, 10, 7, 10)) // Wednesday 10:00
    expect(p.map((x) => x.label)).toEqual(["Later today, 5:00\u00a0PM", "Tomorrow, 9:00\u00a0AM", "Monday, 9:00\u00a0AM"])
    expect(p[0].at).toEqual(d(2026, 10, 7, 17))
    expect(p[1].at).toEqual(d(2026, 10, 8, 9))
    expect(p[2].at).toEqual(d(2026, 10, 12, 9))
  })
  it("drops later today once the afternoon is gone", () => {
    expect(schedulePresets(d(2026, 10, 7, 16)).map((x) => x.label)).toEqual(["Tomorrow, 9:00\u00a0AM", "Monday, 9:00\u00a0AM"])
  })
  it("does not offer Monday twice on a Sunday", () => {
    expect(schedulePresets(d(2026, 10, 4, 20)).map((x) => x.label)).toEqual(["Tomorrow, 9:00\u00a0AM"])
  })
  it("on a Monday, Monday means next week", () => {
    const p = schedulePresets(d(2026, 10, 5, 18))
    expect(p.find((x) => x.label.startsWith("Monday"))?.at).toEqual(d(2026, 10, 12, 9))
  })
  it("every preset is in the future", () => {
    for (let h = 0; h < 24; h++) for (const day of [4, 5, 9, 10]) {
      const now = d(2026, 10, day, h, 30)
      for (const p of schedulePresets(now)) expect(p.at.getTime()).toBeGreaterThan(now.getTime())
    }
  })
  it("formats the time back in words and fills a datetime input", () => {
    const now = d(2026, 10, 7, 10)
    expect(formatSendAt(d(2026, 10, 7, 17), now)).toMatch(/^today at /)
    expect(formatSendAt(d(2026, 10, 8, 9), now)).toMatch(/^tomorrow at /)
    expect(formatSendAt(d(2026, 10, 9, 9), now)).toBe("Fri at 9:00\u00a0AM")
    // The app's one format, day before month, whatever the browser's locale.
    expect(formatSendAt(d(2026, 10, 20, 9), now)).toBe("20 Oct at 9:00\u00a0AM")
    expect(toLocalInputValue(d(2026, 1, 3, 4, 5))).toBe("2026-01-03T04:05")
  })
})

// MC-41: the picker wanted a minute where the server takes 30 seconds, and
// greyed Schedule out with no reason.
describe("a typed send-later time", () => {
  const now = Date.UTC(2026, 9, 14, 9, 0, 0)
  it("is usable from 30 seconds ahead to 120 days, as the server's window", () => {
    expect(sendLaterProblem(new Date(now + 31_000), now)).toBeUndefined()
    expect(sendLaterProblem(new Date(now + 120 * 24 * 3600_000), now)).toBeUndefined()
  })
  it("says why it isn't, in the server's own words", () => {
    expect(sendLaterProblem(new Date(now + 20_000), now)).toBe("Pick a time at least 30 seconds from now.")
    expect(sendLaterProblem(new Date(now + 121 * 24 * 3600_000), now)).toBe("Pick a time within the next 120 days.")
    expect(sendLaterProblem(new Date("not a date"), now)).toBe("Pick a date and time.")
    expect(sendLaterProblem(null, now)).toBe("Pick a date and time.")
  })
})
