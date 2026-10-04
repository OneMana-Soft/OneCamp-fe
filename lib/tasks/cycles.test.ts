import { describe, expect, it } from "vitest"
import { cycleDates, cycleLabel, nextStart, openCycles, percentDone, type Cycle } from "./cycles"

const c = (n: number, state: Cycle["state"], start: string, end: string): Cycle => ({
  id: String(n), project_uuid: "p", number: n, name: "", starts_at: start, ends_at: end, state,
})

describe("cycles", () => {
  it("names and dates a cycle", () => {
    expect(cycleLabel({ number: 3, name: "" })).toBe("Cycle 3")
    expect(cycleLabel({ number: 3, name: "Launch" })).toBe("Launch")
    expect(cycleDates({ starts_at: "2026-10-05T00:00:00", ends_at: "2026-10-19T00:00:00" })).toMatch(/Oct 5.*Oct 18/)
  })
  it("offers open cycles, current first", () => {
    const list = [c(1, "completed", "2026-09-21", "2026-10-05"), c(3, "upcoming", "2026-10-19", "2026-11-02"), c(2, "current", "2026-10-05", "2026-10-19")]
    expect(openCycles(list).map((x) => x.number)).toEqual([2, 3])
  })
  it("starts the next cycle where the last ends", () => {
    const list = [c(1, "current", "2026-10-05T00:00:00", "2026-10-19T00:00:00")]
    expect(nextStart(list, new Date(2026, 9, 6))).toBe("2026-10-19")
    expect(nextStart([], new Date(2026, 9, 6))).toBe("2026-10-06")
  })
  it("counts progress", () => {
    expect(percentDone({ total: 4, done: 1 })).toBe(25)
    expect(percentDone({ total: 0, done: 0 })).toBe(0)
  })
})
