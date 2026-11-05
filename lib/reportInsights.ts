// How long work takes (B9-a: jira-08, asana-08, linear-32): the pure helpers
// behind the report's Insights section (components/reports/ReportInsights),
// which reads the report's `insights` (business/Project/insights.go). Every
// duration is in hours, as the server sends it. Loaded with that section,
// never on the report's first load.

import { csvLine } from "@/lib/csv"
import { PRIORITY_LABEL, type InsightPoint, type InsightSlice, type Insights, type Report, type Spread } from "@/lib/reports"

/** The ways the server slices work, in the picker's order. */
export const SLICE_BY: { by: InsightSlice["by"]; label: string }[] = [
  { by: "project", label: "Project" },
  { by: "person", label: "Person" },
  { by: "priority", label: "Priority" },
  { by: "type", label: "Type" },
]

/** The steps time in status reports (business/Project/insights.go's steps), as the board names them. */
export const STATUS_LABEL: Record<string, string> = { backlog: "Backlog", todo: "To do", inProgress: "In progress", inReview: "In review" }

const tenth = (x: number) => (x >= 10 ? Math.round(x) : Math.round(x * 10) / 10)

/** Hours as a person reads them: minutes under an hour, hours under two days, days after. */
export function durationLabel(hours: number): string {
  if (!(hours > 0)) return "0 h"
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} min`
  if (hours < 48) return `${tenth(hours)} h`
  return `${tenth(hours / 24)} d`
}

/** The ways to slice a report's work: the server's four, then each custom field it sliced by (B9-b1). */
export function sliceChoices(ins: Pick<Insights, "fields">): { by: InsightSlice["by"]; label: string }[] {
  return [...SLICE_BY, ...(ins.fields ?? []).map((f) => ({ by: f.by, label: f.name }))]
}

/** A slice's name: a project, a person, a priority, a type or a field's value; the work with none named for what it lacks. */
export function sliceName(s: Pick<InsightSlice, "by" | "key" | "name">): string {
  if (s.by === "priority") return PRIORITY_LABEL[s.key] ?? s.name
  if (s.key === "") return s.by === "person" ? "Nobody" : s.by === "type" ? "Task" : s.by.startsWith("field:") ? "None" : s.name || "No project"
  return s.name || s.key
}

/** A slice to show on its own: which way, and which one. */
export type InsightFocus = { by: InsightSlice["by"]; key: string }

/** Whether a done task is in a slice. */
export function inSlice(p: InsightPoint, f: InsightFocus): boolean {
  if (f.by.startsWith("field:")) return (p.in?.[f.by] ?? []).includes(f.key)
  const key = f.by === "project" ? p.project_uuid : f.by === "person" ? p.person_uuid : f.by === "priority" ? p.priority : p.type_id
  return (key ?? "") === f.key
}

/** The slices one way, the busiest first: most done, then most open, then by name. */
export function slicesBy(slices: InsightSlice[], by: InsightSlice["by"]): InsightSlice[] {
  return slices
    .filter((s) => s.by === by)
    .sort((a, b) => b.lead.n - a.lead.n || b.age.n - a.age.n || sliceName(a).localeCompare(sliceName(b)))
}

const SPREAD_HEAD = ["Tasks", "25th percentile (hours)", "Median (hours)", "85th percentile (hours)", "95th percentile (hours)"]
const spreadCells = (s: Spread) => [s.n, s.p25, s.p50, s.p85, s.p95]

/**
 * Every Insights chart's rows, for the report's CSV after its own: the four
 * measures, time in status, each slice, and each done task drawn. Names come
 * from the slices (a person's, a type's) and the report's projects. Empty for
 * a server that sends no insights.
 */
export function insightsCSV(r: Report): string {
  const ins = r.insights
  if (!ins) return ""
  const lines = ["", csvLine(["How long work takes", ...SPREAD_HEAD])]
  const measures: [string, Spread][] = [
    ["Cycle time (started to done)", ins.cycle],
    ["Lead time (made to done)", ins.lead],
    ["Triage time (left the backlog)", ins.triage],
    ["Age of open work", ins.age],
  ]
  for (const [label, s] of measures) lines.push(csvLine([label, ...spreadCells(s)]))
  lines.push("", csvLine(["Time in status", ...SPREAD_HEAD]))
  for (const s of ins.in_status) lines.push(csvLine([STATUS_LABEL[s.status] ?? s.status, ...spreadCells(s)]))
  lines.push(
    "",
    csvLine(["Slice", "Name", "Done", "Cycle median (hours)", "Cycle 85th percentile (hours)", "Lead median (hours)", "Lead 85th percentile (hours)", "Open", "Age median (hours)"]),
  )
  for (const s of ins.slices) lines.push(csvLine([s.by, sliceName(s), s.lead.n, s.cycle.p50, s.cycle.p85, s.lead.p50, s.lead.p85, s.age.n, s.age.p50]))
  const named = (by: InsightSlice["by"]) => new Map(ins.slices.filter((s) => s.by === by).map((s) => [s.key, sliceName(s)]))
  const project = new Map(r.all_projects.map((p) => [p.project_uuid, p.project_name]))
  const person = named("person")
  const type = named("type")
  lines.push("", csvLine(["Done task", "Done at", "Cycle (hours)", "Lead (hours)", "Project", "Person", "Priority", "Type"]))
  for (const p of ins.points) {
    lines.push(
      csvLine([
        p.task_name,
        p.done_at,
        p.cycle ?? "",
        p.lead,
        project.get(p.project_uuid) ?? "",
        person.get(p.person_uuid ?? "") ?? "Nobody",
        PRIORITY_LABEL[p.priority ?? ""] ?? p.priority ?? "",
        type.get(p.type_id ?? "") ?? "Task",
      ]),
    )
  }
  if (ins.points_capped) lines.push(csvLine([`The latest ${ins.points.length} done tasks; the measures above count them all.`]))
  return lines.join("\n") + "\n"
}
