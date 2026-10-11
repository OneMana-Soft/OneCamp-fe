import { describe, expect, it } from "vitest"

import { RING_HOLD_MS, RING_OFF, formatElapsed, guestName, levelToBars, ringOpacity } from "@/components/livekit/callLevels"

describe("levelToBars, the mic meter", () => {
  it("is clamped to 0–5", () => {
    expect(levelToBars(0).bars).toBe(0)
    expect(levelToBars(-1).bars).toBe(0)
    expect(levelToBars(Number.NaN).bars).toBe(0)
    let s = 0
    for (let i = 0; i < 10; i++) s = levelToBars(1, s).level
    expect(levelToBars(1, s).bars).toBe(5)
    expect(levelToBars(50, s).bars).toBe(5)
  })

  it("lights a bar or two for normal speech", () => {
    let s = 0
    for (let i = 0; i < 10; i++) s = levelToBars(0.05, s).level
    const { bars } = levelToBars(0.05, s)
    expect(bars).toBeGreaterThanOrEqual(1)
    expect(bars).toBeLessThanOrEqual(2)
  })

  it("rises faster than it falls", () => {
    const up = levelToBars(0.5, 0).level
    const down = levelToBars(0, 0.5).level
    expect(up).toBeCloseTo(0.3)
    expect(down).toBeCloseTo(0.35)
  })
})

describe("ringOpacity, the speaking ring", () => {
  it("is 0 when silent and between .45 and 1 when speaking", () => {
    expect(ringOpacity(0).opacity).toBe(0)
    expect(ringOpacity(0.04, RING_OFF, { now: 0 }).opacity).toBeCloseTo(0.45)
    expect(ringOpacity(1, RING_OFF, { now: 0 }).opacity).toBe(1)
  })

  it("smooths toward its target rather than jumping", () => {
    const a = ringOpacity(0.05, RING_OFF, { now: 0 })
    const b = ringOpacity(1, a, { now: 50 })
    expect(b.opacity).toBeGreaterThan(a.opacity)
    expect(b.opacity).toBeLessThan(1)
  })

  it("holds for 300 ms after the voice drops, then goes", () => {
    const loud = ringOpacity(0.3, RING_OFF, { now: 1000 })
    expect(ringOpacity(0, loud, { now: 1000 + RING_HOLD_MS - 1 }).opacity).toBeGreaterThanOrEqual(0.45)
    expect(ringOpacity(0, loud, { now: 1000 + RING_HOLD_MS }).opacity).toBe(0)
  })

  it("is binary under reduced motion", () => {
    expect(ringOpacity(0.05, RING_OFF, { now: 0, reduced: true }).opacity).toBe(1)
    expect(ringOpacity(0.3, RING_OFF, { now: 0, reduced: true }).opacity).toBe(1)
    expect(ringOpacity(0, RING_OFF, { now: 0, reduced: true }).opacity).toBe(0)
  })
})

describe("a call's words", () => {
  it("writes elapsed time as m:ss, with hours past the hour", () => {
    expect(formatElapsed(0)).toBe("0:00")
    expect(formatElapsed(24 * 60_000 + 10_000)).toBe("24:10")
    expect(formatElapsed(3_723_000)).toBe("1:02:03")
  })

  it("reads a guest from the reserved identity, without the 'Guest:' prefix", () => {
    expect(guestName("guest-abc", "Guest: Priya")).toEqual({ name: "Priya", guest: true })
    expect(guestName("u-1", "Maya Chen")).toEqual({ name: "Maya Chen", guest: false })
  })
})
