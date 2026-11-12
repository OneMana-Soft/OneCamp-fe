import { describe, expect, it } from "vitest"

import { durationLabel, effortUnit, inSlice, insightsCSV, sliceChoices, sliceName, slicesBy } from "@/lib/reportInsights"
import type { InsightPoint, InsightSlice, Insights, Report, Spread } from "@/lib/reports"
import { pinTestClock } from "@/lib/testing/testClock"

pinTestClock()

const spread = (n: number, p50: number, p85 = p50 * 2): Spread => ({ n, p25: p50 / 2, p50, p85, p95: p85 * 1.5 })
const none: Spread = { n: 0, p25: 0, p50: 0, p85: 0, p95: 0 }
const slice = (by: InsightSlice["by"], key: string, name: string, done: number, open = 0): InsightSlice => ({
  by,
  key,
  name,
  cycle: spread(done, 10),
  lead: spread(done, 20),
  age: open ? spread(open, 30) : none,
})
const point = (more: Partial<InsightPoint>): InsightPoint => ({ task_uuid: "t1", task_name: "Ship it", done_at: "2026-10-06T10:00:00Z", lead: 20, project_uuid: "q4", ...more })

describe("durationLabel", () => {
  it("says minutes under an hour, hours under two days and days after, to a tenth below ten", () => {
    expect(durationLabel(0)).toBe("0 h")
    expect(durationLabel(0.004)).toBe("1 min")
    expect(durationLabel(0.5)).toBe("30 min")
    expect(durationLabel(1.25)).toBe("1.3 h")
    expect(durationLabel(13.6)).toBe("14 h")
    expect(durationLabel(47.9)).toBe("48 h")
    expect(durationLabel(48)).toBe("2 d")
    expect(durationLabel(84)).toBe("3.5 d")
    expect(durationLabel(890)).toBe("37 d")
  })
})

describe("slices", () => {
  it("names the work with none for what it lacks, and a priority as the report names it", () => {
    expect(sliceName({ by: "person", key: "", name: "" })).toBe("Nobody")
    expect(sliceName({ by: "type", key: "", name: "" })).toBe("Task")
    expect(sliceName({ by: "priority", key: "", name: "" })).toBe("No priority")
    expect(sliceName({ by: "priority", key: "high", name: "high" })).toBe("High")
    expect(sliceName({ by: "type", key: "b1", name: "Bug" })).toBe("Bug")
  })

  it("puts the busiest first: most done, then most open, then by name", () => {
    const all = [slice("person", "a", "Ana", 1), slice("project", "q4", "Q4", 9), slice("person", "", "", 3), slice("person", "c", "Cy", 1, 4), slice("person", "b", "Ben", 1, 4)]
    expect(slicesBy(all, "person").map(sliceName)).toEqual(["Nobody", "Ben", "Cy", "Ana"])
  })

  it("puts a done task in its slice by its project, person, priority and type, the empty ones too", () => {
    const p = point({ person_uuid: "maya", priority: "high" })
    expect(inSlice(p, { by: "project", key: "q4" })).toBe(true)
    expect(inSlice(p, { by: "person", key: "maya" })).toBe(true)
    expect(inSlice(p, { by: "priority", key: "high" })).toBe(true)
    expect(inSlice(p, { by: "type", key: "" })).toBe(true)
    expect(inSlice(p, { by: "type", key: "bug" })).toBe(false)
    expect(inSlice(point({}), { by: "person", key: "" })).toBe(true)
  })
})

describe("insightsCSV", () => {
  const insights: Insights = {
    cycle: spread(2, 10),
    lead: spread(2, 20),
    triage: spread(1, 4),
    age: spread(3, 30),
    in_status: [
      { status: "todo", ...spread(2, 5) },
      { status: "inReview", ...none },
    ],
    points: [point({ cycle: 10, person_uuid: "maya", type_id: "b1" }), point({ task_uuid: "t2", task_name: "=cmd()", priority: "low" })],
    points_capped: false,
    slices: [slice("project", "q4", "Q4 launch", 2, 3), slice("person", "maya", "Maya Chen", 1), slice("type", "b1", "Bug", 1)],
  }
  const report = { all_projects: [{ project_uuid: "q4", project_name: "Q4 launch" }], insights } as unknown as Report

  it("writes every chart's rows: the four measures, time in status, each slice and each task done", () => {
    const csv = insightsCSV(report)
    expect(csv.startsWith("\nHow long work takes,Tasks,")).toBe(true)
    expect(csv).toContain("Cycle time (started to done),2,5,10,20,30\n")
    expect(csv).toContain("Triage time (left the backlog),1,2,4,8,12\n")
    expect(csv).toContain("Age of open work,3,15,30,60,90\n")
    expect(csv).toContain("To do,2,2.5,5,10,15\nIn review,0,0,0,0,0\n")
    expect(csv).toContain("Project,Q4 launch,2,10,20,20,40,3,30,,,\n")
    expect(csv).toContain("Ship it,2026-10-06T10:00:00Z,10,20,Q4 launch,Maya Chen,No priority,Bug\n")
    // A task's own name is kept as text, never run as a formula; no cycle is an empty cell.
    expect(csv).toContain(`"'=cmd()",2026-10-06T10:00:00Z,,20,Q4 launch,Nobody,Low,Task\n`)
    expect(csv).not.toContain("latest")
  })

  it("says when the tasks drawn are only the latest, and is empty for a server that sends no insights", () => {
    expect(insightsCSV({ ...report, insights: { ...insights, points_capped: true } })).toContain("The latest 2 done tasks; the measures above count them all.")
    expect(insightsCSV({ ...report, insights: undefined })).toBe("")
  })

  // B9-b4 (CR-B14 M2): the report's own CSV, byte for byte, with every column
  // its points can fill: the report sends its projects and slices by person and type.
  it("writes the report's own CSV unchanged", () => {
    const head = "Tasks,25th percentile (hours),Median (hours),85th percentile (hours),95th percentile (hours)"
    expect(insightsCSV(report)).toBe(
      [
        "",
        `How long work takes,${head}`,
        "Cycle time (started to done),2,5,10,20,30",
        "Lead time (made to done),2,10,20,40,60",
        "Triage time (left the backlog),1,2,4,8,12",
        "Age of open work,3,15,30,60,90",
        "",
        `Time in status,${head}`,
        "To do,2,2.5,5,10,15",
        "In review,0,0,0,0,0",
        "",
        "Slice,Name,Done,Cycle median (hours),Cycle 85th percentile (hours),Lead median (hours),Lead 85th percentile (hours),Open,Age median (hours),Overdue,Open effort (hours),Done effort (hours)",
        "Project,Q4 launch,2,10,20,20,40,3,30,,,",
        "Person,Maya Chen,1,10,20,20,40,0,0,,,",
        "Type,Bug,1,10,20,20,40,0,0,,,",
        "",
        "Done task,Done at,Cycle (hours),Lead (hours),Project,Person,Priority,Type",
        "Ship it,2026-10-06T10:00:00Z,10,20,Q4 launch,Maya Chen,No priority,Bug",
        `"'=cmd()",2026-10-06T10:00:00Z,,20,Q4 launch,Nobody,Low,Task`,
        "",
      ].join("\n"),
    )
  })

  // B9-b4: a dashboard's chart asks for its own tables, from the parts of the
  // insights it has; a measure it wasn't sent is left out. A control chart is
  // sent no projects and no slices (business/Dashboard/data.go), so its tasks
  // have no Project, Person or Type column that could only ever be blank (CR-B14 M2).
  it("writes only the tables asked for, from what was sent", () => {
    expect(insightsCSV(report, ["in_status"])).toBe("\nTime in status,Tasks,25th percentile (hours),Median (hours),85th percentile (hours),95th percentile (hours)\nTo do,2,2.5,5,10,15\nIn review,0,0,0,0,0\n")
    const control = { insights: { cycle: insights.cycle, lead: insights.lead, points: insights.points, points_capped: false } }
    const csv = insightsCSV(control, ["measures", "points"])
    expect(csv).toContain("Cycle time (started to done),2,5,10,20,30\nLead time (made to done),2,10,20,40,60\n\nDone task,")
    expect(csv).not.toContain("Triage")
    expect(csv).not.toContain("Time in status")
    expect(csv).toContain("\nDone task,Done at,Cycle (hours),Lead (hours),Priority\nShip it,2026-10-06T10:00:00Z,10,20,No priority\n")
    expect(csv).toContain(`\n"'=cmd()",2026-10-06T10:00:00Z,,20,Low\n`)
  })

  it("writes a task's project only when the projects were sent, and its person or type only when the slices name them", () => {
    const points = (r: Parameters<typeof insightsCSV>[0]) => insightsCSV(r, ["points"]).split("\n").slice(1, 4)
    expect(points({ all_projects: report.all_projects, insights: { points: insights.points } })).toEqual([
      "Done task,Done at,Cycle (hours),Lead (hours),Project,Priority",
      "Ship it,2026-10-06T10:00:00Z,10,20,Q4 launch,No priority",
      `"'=cmd()",2026-10-06T10:00:00Z,,20,Q4 launch,Low`,
    ])
    expect(points({ insights: { points: insights.points, slices: [slice("person", "maya", "Maya Chen", 1)] } })).toEqual([
      "Done task,Done at,Cycle (hours),Lead (hours),Person,Priority",
      "Ship it,2026-10-06T10:00:00Z,10,20,Maya Chen,No priority",
      `"'=cmd()",2026-10-06T10:00:00Z,,20,Nobody,Low`,
    ])
    // Someone no slice names is an empty cell, never taken for nobody (CR-B14 W9).
    expect(insightsCSV({ insights: { points: [point({ person_uuid: "ben" })], slices: [slice("person", "maya", "Maya Chen", 1)] } }, ["points"])).toContain("\nShip it,2026-10-06T10:00:00Z,,20,,No priority\n")
    expect(points({ insights: { points: insights.points, slices: [slice("type", "b1", "Bug", 1)] } })).toEqual([
      "Done task,Done at,Cycle (hours),Lead (hours),Priority,Type",
      "Ship it,2026-10-06T10:00:00Z,10,20,No priority,Bug",
      `"'=cmd()",2026-10-06T10:00:00Z,,20,Low,Task`,
    ])
  })
})

describe("custom-field slices (B9-b1)", () => {
  const team = "field:f-team" as const
  it("offers each field the report sliced by after the four, and names a field's empty slice None", () => {
    expect(sliceChoices({ fields: [{ by: team, name: "Team", type: "select", project_uuid: "q4" }] }).map((c) => c.label)).toEqual(["Project", "Person", "Priority", "Type", "Status", "Labels", "Cycle", "Estimate", "Team"])
    expect(sliceChoices({}).length).toBe(8)
    expect(sliceName({ by: team, key: "", name: "" })).toBe("None")
    expect(sliceName({ by: team, key: "web", name: "Web" })).toBe("Web")
  })
  it("puts a done task in a field's slice by its keys there, several for a multi-select, and another project's task in none", () => {
    const p = { task_uuid: "t", task_name: "T", done_at: "2026-10-01T00:00:00Z", lead: 1, project_uuid: "q4", in: { [team]: ["web", "ops"] } } as InsightPoint
    expect(inSlice(p, { by: team, key: "web" }) && inSlice(p, { by: team, key: "ops" })).toBe(true)
    expect(inSlice(p, { by: team, key: "" })).toBe(false)
    expect(inSlice({ ...p, in: { [team]: [""] } }, { by: team, key: "" })).toBe(true)
    expect(inSlice({ ...p, in: undefined }, { by: team, key: "" })).toBe(false)
  })
})

describe("every way to slice, with counts and effort (L32)", () => {
  const e = (open: number, done: number, unit: "points" | "hours" = "points") => ({ open: { points: 0, hours: 0, [unit]: open }, done: { points: 0, hours: 0, [unit]: done } })
  it("offers status, labels, cycle and estimate after the four, then each field by name", () => {
    const labels = sliceChoices({ fields: [{ by: "field:f1", name: "Vendor", type: "text", project_uuid: "p" }] }).map((c) => c.label)
    expect(labels).toEqual(["Project", "Person", "Priority", "Type", "Status", "Labels", "Cycle", "Estimate", "Vendor"])
  })

  it("names the work with none each way, the rest of a text field Other, and a status as the board does", () => {
    expect(["labels", "cycle", "estimate", "field:f1"].map((by) => sliceName({ by: by as InsightSlice["by"], key: "", name: "" }))).toEqual(["No labels", "No cycle", "No estimate", "None"])
    expect(sliceName({ by: "field:f1", key: "Other", name: "Other" })).toBe("Other")
    expect(sliceName({ by: "status", key: "inReview", name: "" })).toBe("In review")
    expect(sliceName({ by: "cycle", key: "c7", name: "Cycle 7" })).toBe("Cycle 7")
  })

  it("puts a done task in a slice by its keys that way, and in none a server didn't key", () => {
    const p = point({ in: { labels: ["bug", "ui"], cycle: [""], person: ["u1"] } })
    expect([inSlice(p, { by: "labels", key: "ui" }), inSlice(p, { by: "cycle", key: "" }), inSlice(p, { by: "estimate", key: "" })]).toEqual([true, true, false])
    expect(inSlice(p, { by: "person", key: "u1" })).toBe(true)
    expect(inSlice(point({ priority: "low" }), { by: "priority", key: "low" })).toBe(true)
  })

  it("counts effort in points when any work has them, else hours, and the CSV adds open, overdue and effort", () => {
    const s = { ...slice("labels", "bug", "bug", 2, 1), open: 4, overdue: 1, done: 2, effort: e(5, 8) }
    expect(effortUnit({ slices: [s] })).toBe("points")
    expect(effortUnit({ slices: [{ ...s, effort: e(3, 1.5, "hours") }] })).toBe("hours")
    const csv = insightsCSV({ insights: { slices: [s], fields: [] } }, ["slices"])
    expect(csv).toContain("Open,Age median (hours),Overdue,Open effort (points),Done effort (points)\n")
    expect(csv).toContain("Labels,bug,2,10,20,20,40,4,30,1,5,8\n")
  })
})
