import { describe, expect, it } from "vitest"

import { durationLabel, inSlice, insightsCSV, sliceChoices, sliceName, slicesBy } from "@/lib/reportInsights"
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
    expect(csv).toContain("project,Q4 launch,2,10,20,20,40,3,30\n")
    expect(csv).toContain("Ship it,2026-10-06T10:00:00Z,10,20,Q4 launch,Maya Chen,No priority,Bug\n")
    // A task's own name is kept as text, never run as a formula; no cycle is an empty cell.
    expect(csv).toContain(`"'=cmd()",2026-10-06T10:00:00Z,,20,Q4 launch,Nobody,Low,Task\n`)
    expect(csv).not.toContain("latest")
  })

  it("says when the tasks drawn are only the latest, and is empty for a server that sends no insights", () => {
    expect(insightsCSV({ ...report, insights: { ...insights, points_capped: true } })).toContain("The latest 2 done tasks; the measures above count them all.")
    expect(insightsCSV({ ...report, insights: undefined })).toBe("")
  })
})

describe("custom-field slices (B9-b1)", () => {
  const team = "field:f-team" as const
  it("offers each field the report sliced by after the four, and names a field's empty slice None", () => {
    expect(sliceChoices({ fields: [{ by: team, name: "Team", type: "select", project_uuid: "q4" }] }).map((c) => c.label)).toEqual(["Project", "Person", "Priority", "Type", "Team"])
    expect(sliceChoices({}).length).toBe(4)
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
