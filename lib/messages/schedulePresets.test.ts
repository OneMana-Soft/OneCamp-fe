import { describe, expect, it } from "vitest"
import { formatSendAt, schedulePresets, toLocalInputValue } from "./schedulePresets"

// Local-time clocks: the presets are in the person's own zone.
const d = (y: number, m: number, day: number, h: number, min = 0) => new Date(y, m - 1, day, h, min)

describe("schedule presets", () => {
  it("offers later today, tomorrow and Monday on a weekday morning", () => {
    const p = schedulePresets(d(2026, 10, 7, 10)) // Wednesday 10:00
    expect(p.map((x) => x.label)).toEqual(["Later today, 5:00 PM", "Tomorrow, 9:00 AM", "Monday, 9:00 AM"])
    expect(p[0].at).toEqual(d(2026, 10, 7, 17))
    expect(p[1].at).toEqual(d(2026, 10, 8, 9))
    expect(p[2].at).toEqual(d(2026, 10, 12, 9))
  })
  it("drops later today once the afternoon is gone", () => {
    expect(schedulePresets(d(2026, 10, 7, 16)).map((x) => x.label)).toEqual(["Tomorrow, 9:00 AM", "Monday, 9:00 AM"])
  })
  it("does not offer Monday twice on a Sunday", () => {
    expect(schedulePresets(d(2026, 10, 4, 20)).map((x) => x.label)).toEqual(["Tomorrow, 9:00 AM"])
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
    expect(formatSendAt(d(2026, 10, 8, 9), now)).toMatch(/^Thu at /)
    expect(formatSendAt(d(2026, 10, 20, 9), now)).toMatch(/^Oct 20 at /)
    expect(toLocalInputValue(d(2026, 1, 3, 4, 5))).toBe("2026-01-03T04:05")
  })
})
