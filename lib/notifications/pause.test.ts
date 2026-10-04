import { describe, expect, it } from "vitest"
import { activePause, isPausedHere, MAX_PAUSE_MS, pausePresets, rememberPause } from "./pause"

describe("pausePresets", () => {
  it("offers a while, then later moments, all within a week", () => {
    const now = new Date(2026, 9, 5, 10, 0) // Monday 10:00
    const p = pausePresets(now)
    expect(p.map((x) => x.label)).toEqual([
      "For 30 minutes",
      "For 1 hour",
      "For 2 hours",
      "Until later today, 5:00 PM",
      "Until tomorrow, 9:00 AM",
      "Until Monday, 9:00 AM",
    ])
    for (const x of p) expect(x.at.getTime() - now.getTime()).toBeLessThanOrEqual(MAX_PAUSE_MS)
  })

  it("drops a Monday more than a week away", () => {
    const now = new Date(2026, 9, 5, 8, 0) // Monday 08:00: next Monday 9:00 is 7d 1h out
    expect(pausePresets(now).some((x) => x.label.includes("Monday"))).toBe(false)
  })
})

describe("activePause", () => {
  it("is null when absent, unreadable or over", () => {
    const now = Date.UTC(2026, 9, 5, 10)
    expect(activePause(null, now)).toBeNull()
    expect(activePause("nonsense", now)).toBeNull()
    expect(activePause("2026-10-05T09:00:00Z", now)).toBeNull()
    expect(activePause("2026-10-05T11:00:00Z", now)?.toISOString()).toBe("2026-10-05T11:00:00.000Z")
  })
})

describe("rememberPause", () => {
  it("keeps this device's copy and clears it on resume", () => {
    const later = new Date(Date.now() + 60_000)
    rememberPause(later)
    expect(isPausedHere()).toBe(true)
    rememberPause(null)
    expect(isPausedHere()).toBe(false)
  })
})
