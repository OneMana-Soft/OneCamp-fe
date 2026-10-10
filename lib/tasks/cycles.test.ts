import { describe, expect, it } from "vitest"
import { burndownChart, cycleDates, cycleLabel, loadNote, nextStart, openCycles, paceNote, percentDone, velocityChart, type Burndown, type Cycle, type Velocity } from "./cycles"

const c = (n: number, state: Cycle["state"], start: string, end: string): Cycle => ({
  id: String(n), project_uuid: "p", number: n, name: "", starts_at: start, ends_at: end, state,
})

describe("cycles", () => {
  it("names and dates a cycle", () => {
    expect(cycleLabel({ number: 3, name: "" })).toBe("Cycle 3")
    expect(cycleLabel({ number: 3, name: "Launch" })).toBe("Launch")
    expect(cycleDates({ starts_at: "2026-10-05T00:00:00", ends_at: "2026-10-19T00:00:00" })).toBe("5 Oct to 18 Oct")
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

// Two weeks, four days in: 6 tasks, one added on day 3, 2 done.
const b: Burndown = {
  days: Array.from({ length: 14 }, (_, i) => `2026-10-${String(5 + i).padStart(2, "0")}`),
  scope: [5, 5, 6, 6],
  remaining: [5, 4, 5, 4],
  ideal: Array.from({ length: 14 }, (_, i) => Math.round(50 * (13 - i) / 13) / 10),
  scope_hours: [10, 10, 12, 12],
  remaining_hours: [10, 8, 10, 6],
  ideal_hours: Array.from({ length: 14 }, (_, i) => Math.round(100 * (13 - i) / 13) / 10),
  tasks: 6,
  done: 2,
  open: 4,
  estimated: 5,
  hours: 12,
}
const v: Velocity = {
  cycles: [
    { id: "1", number: 1, name: "", done: 4, done_hours: 9, unfinished: 1 },
    { id: "2", number: 2, name: "Launch", done: 6, done_hours: 11, unfinished: 0 },
  ],
  typical: 5,
  typical_hours: 10,
}

describe("burndown", () => {
  it("draws the ideal as a dashed guide, the scope when it changed, and what's left up to today", () => {
    const chart = burndownChart(b, "tasks")
    expect(chart.type).toBe("line")
    expect(chart.labels).toHaveLength(14)
    expect(chart.series.map((s) => s.name)).toEqual(["Ideal pace", "In the cycle", "Still to do"])
    expect(chart.series[0]).toMatchObject({ dashed: true })
    const left = chart.series[2]
    expect(left.upTo).toBe(4)
    expect(left.values).toHaveLength(14)
    expect(left.values.slice(0, 4)).toEqual([5, 4, 5, 4])
    // A scope that never changed isn't drawn.
    expect(burndownChart({ ...b, scope: [6, 6, 6, 6] }, "tasks").series.map((s) => s.name)).toEqual(["Ideal pace", "Still to do"])
    // In hours when there are any; tasks otherwise.
    expect(burndownChart(b, "hours").series[2].values.slice(0, 4)).toEqual([10, 8, 10, 6])
    expect(burndownChart({ ...b, remaining_hours: undefined }, "hours").series.at(-1)!.values[0]).toBe(5)
  })

  it("says where the cycle stands against the pace", () => {
    // Day 4: the ideal has about 4.1 left, rounded to 4.
    expect(paceNote(b, "tasks", "current")).toBe("On pace: 4 tasks left, and the ideal pace has 4 tasks by today.")
    expect(paceNote({ ...b, remaining: [5, 5, 6, 6] }, "tasks", "current")).toMatch(/^Behind pace: 6 tasks left/)
    expect(paceNote(b, "hours", "current")).toMatch(/^On pace: 6 h left, and the ideal pace has 7\.7 h by today\.$/)
    // Whether anything is left is counted in tasks, whatever the unit.
    expect(paceNote(b, "tasks", "completed")).toBe("Completed with 4 tasks unfinished.")
    expect(paceNote(b, "hours", "completed")).toBe("Completed with 4 tasks unfinished.")
    expect(paceNote({ ...b, open: 0 }, "tasks", "completed")).toBe("Completed with everything done.")
    expect(paceNote({ ...b, open: 0, remaining: [5, 0] }, "tasks", "current")).toBe("Everything in it is done.")
    // The estimated work is done, the rest has no estimate: not "everything".
    expect(paceNote({ ...b, remaining_hours: [10, 8, 4, 0] }, "hours", "current")).toBe("4 tasks left, none of them estimated.")
    expect(paceNote({ ...b, remaining: [], scope: [] }, "tasks", "upcoming")).toBeNull()
    // A cycle starting later today has a point for today, and still no pace yet.
    expect(paceNote({ ...b, remaining: [5], scope: [5] }, "tasks", "upcoming")).toBeNull()
  })

  it("compares the cycle's load with what recent cycles finished", () => {
    expect(loadNote(b, v, "tasks")).toBe("The last 2 cycles finished 5 tasks on average; this one holds 6 tasks.")
    expect(loadNote(b, v, "hours")).toBe("The last 2 cycles finished 10 h on average; this one holds 12 h.")
    expect(loadNote(b, { ...v, cycles: v.cycles.slice(1), typical: 6 }, "tasks")).toBe("The last cycle finished 6 tasks; this one holds 6 tasks.")
    expect(loadNote(b, { cycles: [] }, "tasks")).toBeNull()
  })

  it("draws velocity as bars, one a cycle", () => {
    const chart = velocityChart(v, "tasks")
    expect(chart.type).toBe("bar")
    expect(chart.labels).toEqual(["Cycle 1", "Launch"])
    expect(chart.series[0].values).toEqual([4, 6])
    expect(velocityChart(v, "hours").series[0]).toMatchObject({ name: "Hours done", values: [9, 11] })
  })
})
