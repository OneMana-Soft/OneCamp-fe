import { describe, expect, it } from "vitest"
import { timeInStatus } from "./timeInStatus"

const now = Date.UTC(2026, 9, 6, 12)
const ago = (d: number) => new Date(now - d * 86_400_000).toISOString()

describe("timeInStatus", () => {
  it("says nothing for under a day", () => {
    expect(timeInStatus(ago(0.5), ago(30), now)).toBeNull()
  })
  it("counts from when the task entered its status, not when it was made", () => {
    expect(timeInStatus(ago(3), ago(40), now)).toEqual({ short: "3d", days: 3, stale: false })
  })
  it("falls back to when it was made, for a task that never moved", () => {
    expect(timeInStatus(undefined, ago(9), now)).toEqual({ short: "9d", days: 9, stale: true })
  })
  it("ignores the zero time and shortens long spans", () => {
    expect(timeInStatus("0001-01-01T00:00:00Z", ago(21), now)?.short).toBe("3w")
    expect(timeInStatus(ago(95), undefined, now)?.short).toBe("3mo")
    expect(timeInStatus(undefined, undefined, now)).toBeNull()
  })
})
