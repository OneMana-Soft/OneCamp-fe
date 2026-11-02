import { describe, expect, it } from "vitest"
import { pinTestClock } from "@/lib/testing/testClock"
import { PLAN_SORTS, endOf, planSpanOf, sortByPlan, type Planned } from "@/lib/work/planOverview"
import type { ProjectPlan } from "@/lib/work/projectPlan"

pinTestClock()

const plan = (o: Partial<ProjectPlan> = {}): ProjectPlan => ({
  lead: null,
  start: null,
  target: null,
  priority: "",
  status: { category: "planned", name: "Planned", color: "" },
  labels: null,
  ...o,
})
const p = (name: string, o: Partial<ProjectPlan> | null = {}, days: { first_day?: string; last_day?: string } = {}): Planned => ({
  project_name: name,
  plan: o ? plan(o) : undefined,
  ...days,
})
const names = (l: Planned[]) => l.map((x) => x.project_name)
/** Midnight of a day where the viewer is. */
const d = (y: number, m: number, day: number) => new Date(y, m - 1, day)

describe("the projects overview, by its plans (linear-15)", () => {
  it("offers priority, target date, status and lead as sorts", () => {
    expect(PLAN_SORTS.map((s) => s.value)).toEqual(["priority", "target", "status", "lead"])
  })

  it("puts urgent first and no priority last, then by name", () => {
    const list = [p("Docs", { priority: "low" }), p("api", {}), p("Billing", { priority: "urgent" }), p("Audit", { priority: "high" }), p("Zed", { priority: "high" }), p("Bare", null)]
    expect(names(sortByPlan(list, "priority"))).toEqual(["Billing", "Audit", "Zed", "Docs", "api", "Bare"])
  })

  it("puts the soonest target first by the end of its period, and none last", () => {
    const list = [
      p("Quarter", { target: { date: "2026-10-01", resolution: "quarter" } }),
      p("Day", { target: { date: "2026-11-15", resolution: "day" } }),
      p("Month", { target: { date: "2026-12-10", resolution: "month" } }),
      p("Open", {}),
    ]
    // Q4 ends 31 Dec, the same day as December: the name settles it.
    expect(names(sortByPlan(list, "target"))).toEqual(["Day", "Month", "Quarter", "Open"])
  })

  it("orders by status category as a project goes through them, then by name", () => {
    const at = (category: ProjectPlan["status"]["category"]) => ({ status: { category, name: category, color: "" } })
    const list = [p("Shipped", at("done")), p("Now", at("in_progress")), p("Held", at("paused")), p("Next", at("planned")), p("Dropped", at("cancelled")), p("Bare", null)]
    expect(names(sortByPlan(list, "status"))).toEqual(["Next", "Now", "Held", "Shipped", "Dropped", "Bare"])
  })

  it("orders by lead name without regard to case, and no lead last", () => {
    const lead = (name: string) => ({ lead: { user_uuid: name, name } })
    // Code units put every capital first (Ben, Cal, ana): a lead in lower case between two capitalised ones pins it (V-257).
    const list = [p("One", lead("Cal")), p("Two", {}), p("Three", lead("ana")), p("Four", lead("Ben"))]
    expect(names(sortByPlan(list, "lead"))).toEqual(["Three", "Four", "One", "Two"])
  })

  it("orders the Target column by the day it shows: a plan's target, else its tasks' last day, and neither last (V-257)", () => {
    const list = [
      p("Month", { target: { date: "2026-12-10", resolution: "month" } }),
      p("Tasks", {}, { last_day: "2026-11-10T12:00:00Z" }),
      p("Day", { target: { date: "2026-09-30", resolution: "day" } }),
      p("Bare", null),
    ]
    expect(names(sortByPlan(list, "target"))).toEqual(["Day", "Tasks", "Month", "Bare"])
  })

  it("ends a project at its plan's target, else at its tasks' last day where the viewer is, late once that day is over with work open (V-255)", () => {
    const now = new Date(2026, 9, 15, 12)
    const open = (q: Planned, n: number) => ({ ...q, open: n })
    expect(endOf(open(p("Q", { target: { date: "2026-10-01", resolution: "quarter" } }), 2), now)).toEqual({ day: "2026-12-31", target: true, late: false })
    expect(endOf(open(p("D", { target: { date: "2026-09-30", resolution: "day" } }), 2), now)).toEqual({ day: "2026-09-30", target: true, late: true })
    // Its last day is over only once that day has passed: today is not late.
    expect(endOf(open(p("Today", { target: { date: "2026-10-15", resolution: "day" } }), 2), now)?.late).toBe(false)
    expect(endOf(open(p("Done", { target: { date: "2026-09-30", resolution: "day" } }), 0), now)?.late).toBe(false)
    expect(endOf(open(p("Tasks", {}, { last_day: "2026-10-01T12:00:00Z" }), 1), now)).toEqual({ day: "2026-10-01", target: false, late: true })
    // The sorts read the day alone: with no clock, nothing is late.
    expect(endOf(open(p("D", { target: { date: "2026-09-30", resolution: "day" } }), 2))?.late).toBe(false)
    expect(endOf(p("Bare", null))).toBeUndefined()
    expect(endOf(p("Zero", {}, { last_day: "0001-01-01T00:00:00Z" }))).toBeUndefined()
  })

  it("draws a project across its plan's dates, each end at its period's edge", () => {
    expect(planSpanOf(p("Q", { start: { date: "2026-10-01", resolution: "quarter" }, target: { date: "2027-02-01", resolution: "month" } }))).toEqual({ start: d(2026, 10, 1), end: d(2027, 2, 28) })
    expect(planSpanOf(p("H", { start: { date: "2026-03-09", resolution: "day" }, target: { date: "2026-08-01", resolution: "half" } }))).toEqual({ start: d(2026, 3, 9), end: d(2026, 12, 31) })
  })

  it("takes an end the plan leaves unset from the tasks' days, both from them without a plan, and one end alone as that day", () => {
    const days = { first_day: "2026-09-01T12:00:00Z", last_day: "2026-11-20T12:00:00Z" }
    expect(planSpanOf(p("T", { target: { date: "2026-12-01", resolution: "month" } }, days))).toEqual({ start: d(2026, 9, 1), end: d(2026, 12, 31) })
    expect(planSpanOf(p("S", { start: { date: "2026-10-05", resolution: "day" } }, days))).toEqual({ start: d(2026, 10, 5), end: d(2026, 11, 20) })
    expect(planSpanOf(p("N", null, days))).toEqual({ start: d(2026, 9, 1), end: d(2026, 11, 20) })
    expect(planSpanOf(p("One", { target: { date: "2026-12-01", resolution: "month" } }))).toEqual({ start: d(2026, 12, 31), end: d(2026, 12, 31) })
    expect(planSpanOf(p("E", {}))).toBeNull()
    expect(planSpanOf(p("Zero", null, { first_day: "0001-01-01T00:00:00Z", last_day: "" }))).toBeNull()
  })

  it("never draws a bar backwards: a plan's start after the tasks end keeps the plan's start alone", () => {
    const days = { first_day: "2026-09-01T12:00:00Z", last_day: "2026-11-20T12:00:00Z" }
    expect(planSpanOf(p("Late", { start: { date: "2027-01-01", resolution: "quarter" } }, days))).toEqual({ start: d(2027, 1, 1), end: d(2027, 1, 1) })
    expect(planSpanOf(p("Early", { target: { date: "2026-06-01", resolution: "month" } }, days))).toEqual({ start: d(2026, 6, 30), end: d(2026, 6, 30) })
  })

  // new Date("2026-09-30") is UTC's midnight: in New York the 29th, in Auckland the 30th at 13:00.
  it("reads a plan's days as days where the viewer is, west or east of UTC", () => {
    const zone = process.env.TZ
    try {
      for (const tz of ["America/New_York", "Asia/Kolkata", "Pacific/Auckland"]) {
        process.env.TZ = tz
        const span = planSpanOf(p("Z", { start: { date: "2026-09-01", resolution: "day" }, target: { date: "2026-09-30", resolution: "day" } }))!
        expect([span.start.getDate(), span.start.getHours(), span.end.getDate(), span.end.getHours()], tz).toEqual([1, 0, 30, 0])
      }
    } finally {
      if (zone === undefined) delete process.env.TZ
      else process.env.TZ = zone
    }
  })
})
