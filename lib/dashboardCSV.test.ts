import { describe, expect, it } from "vitest"
import { widgetCSV, widgetCSVName } from "@/lib/dashboardCSV"
import { CSV_KINDS, type Widget, type WidgetData } from "@/lib/dashboards"
import { pinTestClock } from "@/lib/testing/testClock"

pinTestClock()

// B9-b4 (linear-32: "a CSV from every chart"): each chart on a dashboard
// downloads its own rows, written by the report's own CSV (lib/reportCSV
// reportCSV, lib/reportInsights insightsCSV), never a copy of them. A number
// and a goal are not charts; a widget that couldn't be worked out has none.

const widget = (kind: Widget["kind"], query: Widget["query"] = { weeks: 4 }, title = ""): Widget => ({ id: "w1", kind, title, query, x: 0, y: 0, w: 6, h: 4 })
const result = (kind: Widget["kind"], data: unknown): WidgetData => ({ id: "w1", kind, data })
const spread = (n: number, p50: number) => ({ n, p25: p50 / 2, p50, p85: p50 * 2, p95: p50 * 3 })
const weeks = ["2026-10-26", "2026-11-02"]

describe("widgetCSV", () => {
  it("is offered on the charts alone", () => {
    expect([...CSV_KINDS].sort()).toEqual(["breakdown", "control_chart", "flow", "throughput", "time_in_status"])
  })

  it("writes a weekly chart's weeks", () => {
    expect(widgetCSV(widget("throughput"), result("throughput", { weeks, done: [1, 2], added: [3, 0] }))).toBe("Week starting,Done,Added\n2026-10-26,1,3\n2026-11-02,2,0\n")
    const flow = [
      { to_do: 4, in_progress: 2, in_review: 1, done: 0 },
      { to_do: 3, in_progress: 1, in_review: 0, done: 2 },
    ]
    expect(widgetCSV(widget("flow"), result("flow", { weeks, flow }))).toBe("Week starting,To do,In progress,In review,Done\n2026-10-26,4,2,1,0\n2026-11-02,3,1,0,2\n")
  })

  it("writes a control chart's two measures and its tasks, and time in status's steps", () => {
    const points = [{ task_uuid: "t1", task_name: "Ship it", done_at: "2026-11-03T10:00:00Z", cycle: 10, lead: 20, project_uuid: "p" }]
    const control = widgetCSV(widget("control_chart"), result("control_chart", { points, points_capped: false, cycle: spread(1, 10), lead: spread(1, 20) }))!
    expect(control.startsWith("How long work takes,Tasks,")).toBe(true)
    expect(control).toContain("Cycle time (started to done),1,5,10,20,30\nLead time (made to done),1,10,20,40,60\n\nDone task,")
    // The widget is sent no projects and no slices (business/Dashboard/data.go), so no column it could never fill (CR-B14 M2).
    expect(control).toContain("\n\nDone task,Done at,Cycle (hours),Lead (hours),Priority\nShip it,2026-11-03T10:00:00Z,10,20,No priority\n")
    const steps = widgetCSV(widget("time_in_status"), result("time_in_status", { in_status: [{ status: "inProgress", ...spread(2, 8) }] }))!
    expect(steps).toBe("Time in status,Tasks,25th percentile (hours),Median (hours),85th percentile (hours),95th percentile (hours)\nIn progress,2,4,8,16,24\n")
  })

  it("writes a breakdown's rows by what it splits", () => {
    const counts = { to_do: 1, in_progress: 2, in_review: 0, overdue: 1, done: 3 }
    const byProject = widgetCSV(widget("breakdown", { by: "project" }), result("breakdown", { by: "project", rows: [{ project_uuid: "p", project_name: "Spring fair", ...counts }] }))
    expect(byProject).toBe("Project,To do,In progress,In review,Overdue,Done\nSpring fair,1,2,0,1,3\n")
    const byPerson = widgetCSV(widget("breakdown", { by: "person" }), result("breakdown", { by: "person", rows: [{ user_uuid: "u", user_name: "Maya Chen", ...counts }, counts] }))
    expect(byPerson).toBe("Person,To do,In progress,In review,Overdue,Done\nMaya Chen,1,2,0,1,3\nNobody,1,2,0,1,3\n")
    const byPriority = widgetCSV(widget("breakdown", { by: "priority" }), result("breakdown", { by: "priority", rows: [{ priority: "high", open: 2, overdue: 1 }] }))
    expect(byPriority).toBe("Priority,Open,Overdue\nHigh,2,1\n")
  })

  it("writes a breakdown's slices any way, a field's by its name, with counts and effort (L32)", () => {
    const none = { n: 0, p25: 0, p50: 0, p85: 0, p95: 0 }
    const slices = [{ by: "field:f1", key: "acme", name: "acme", cycle: none, lead: none, age: none, open: 2, overdue: 1, done: 3, effort: { open: { points: 0, hours: 4 }, done: { points: 0, hours: 6.5 } } }]
    const field = { by: "field:f1", name: "Vendor", type: "text", project_uuid: "p" }
    const csv = widgetCSV(widget("breakdown", { by: "field:f1" }), result("breakdown", { by: "field:f1", measure: "effort", slices, field }))!
    expect(csv.split("\n")[1]).toBe("Vendor,acme,3,0,0,0,0,2,0,1,4,6.5")
  })

  it("has none for a number, a goal, or a widget with nothing worked out", () => {
    expect(widgetCSV(widget("metric", { measure: "open" }), result("metric", { measure: "open", value: 3 }))).toBeNull()
    expect(widgetCSV(widget("goal", { goal: "g" }), result("goal", { id: "g" }))).toBeNull()
    expect(widgetCSV(widget("throughput"), { id: "w1", kind: "throughput", error: "This widget reads a saved view only its owner can see." })).toBeNull()
    expect(widgetCSV(widget("throughput"), undefined)).toBeNull()
  })

  it("names the file after the widget", () => {
    expect(widgetCSVName(widget("throughput"))).toBe("onecamp-done-and-added.csv")
    expect(widgetCSVName(widget("breakdown", { by: "person" }, "Who's on the launch?"))).toBe("onecamp-who-s-on-the-launch.csv")
  })
})
