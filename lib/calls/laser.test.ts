import { afterEach, describe, expect, it, vi } from "vitest"
import { INK_STROKE_MAX, LASER_MS, laserTimers, trailPath, writePoints } from "./laser"

// The one place a call's laser and a board's share: the line a stroke is drawn on, how a chunk of points is written
// into a stroke, and the timers that end laser strokes.

afterEach(() => {
  vi.useRealTimers()
})

describe("trailPath", () => {
  it("draws a tap as a dot, two points as a line, and more smoothed through their middles, to a tenth", () => {
    expect(trailPath([])).toBe("")
    expect(trailPath([1.04, 2])).toBe("M1 2L1 2")
    expect(trailPath([0, 0, 10, 5])).toBe("M0 0L10 5")
    expect(trailPath([0, 0, 10, 10, 20, 0, 30.33, 10])).toBe("M0 0Q10 10 15 5Q20 0 25.2 5L30.3 10")
  })
})

describe("writePoints", () => {
  it("writes a chunk from its place, so one written twice changes nothing and one past the end joins on", () => {
    const one = writePoints([], 0, [1, 1, 2, 2])
    expect(writePoints(one, 1, [2, 2, 3, 3])).toEqual([1, 1, 2, 2, 3, 3])
    expect(writePoints(writePoints(one, 1, [2, 2, 3, 3]), 1, [2, 2, 3, 3])).toEqual([1, 1, 2, 2, 3, 3])
    expect(writePoints(one, 9, [5, 5])).toEqual([1, 1, 2, 2, 5, 5])
    expect(writePoints([], 0, Array.from({ length: INK_STROKE_MAX * 2 + 10 }, () => 1))).toHaveLength(INK_STROKE_MAX * 2)
  })
})

describe("laserTimers", () => {
  it("runs each LASER_MS on unless told, cancels one, and stops them all", () => {
    vi.useFakeTimers()
    const t = laserTimers()
    const ran: string[] = []
    t.later(() => ran.push("a"))
    const cancel = t.later(() => ran.push("b"))
    t.later(() => ran.push("c"), 10)
    cancel()
    vi.advanceTimersByTime(10)
    expect(ran).toEqual(["c"])
    vi.advanceTimersByTime(LASER_MS)
    expect(ran).toEqual(["c", "a"])
    t.later(() => ran.push("d"))
    t.stop()
    vi.advanceTimersByTime(LASER_MS)
    expect(ran).toEqual(["c", "a"])
  })
})
