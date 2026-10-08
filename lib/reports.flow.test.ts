import { describe, expect, it } from "vitest"
import { flowChart, weekLabel, type Report } from "@/lib/reports"

const base = { weeks: ["2026-09-14", "2026-09-21"], done: [0, 0], added: [0, 0], hours: null, open: 0, overdue: 0, due_this_week: 0, done_total: 0, projects: [], people: [], priorities: [], all_projects: [], truncated: false } as Report

describe("the flow of work", () => {
  it("stacks done at the bottom, then in review, in progress and to do", () => {
    const chart = flowChart({ ...base, flow: [{ to_do: 5, in_progress: 2, in_review: 0, done: 0 }, { to_do: 3, in_progress: 2, in_review: 1, done: 2 }] })!
    expect(chart.type).toBe("area")
    expect(chart.stacked).toBe(true)
    expect(chart.series.map((s) => s.name)).toEqual(["Done", "In review", "In progress", "To do"])
    expect(chart.series[0].values).toEqual([0, 2])
    expect(chart.series[3].values).toEqual([5, 3])
    expect(chart.labels).toEqual([weekLabel("2026-09-14"), weekLabel("2026-09-21")])
  })
  it("shows nothing from a server without it, or with nothing in it", () => {
    expect(flowChart(base)).toBeNull()
    expect(flowChart({ ...base, flow: [{ to_do: 0, in_progress: 0, in_review: 0, done: 0 }, { to_do: 0, in_progress: 0, in_review: 0, done: 0 }] })).toBeNull()
    expect(flowChart({ ...base, flow: [{ to_do: 1, in_progress: 0, in_review: 0, done: 0 }] })).toBeNull()
  })
})
