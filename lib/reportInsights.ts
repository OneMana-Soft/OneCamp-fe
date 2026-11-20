// How long work takes (B9-a: jira-08, asana-08, linear-32): the pure helpers
// behind the report's Insights section (components/reports/ReportInsights),
// which reads the report's `insights` (business/Project/insights.go). Every
// duration is in hours, as the server sends it. Loaded with that section,
// never on the report's first load.

import { csvLine } from "@/lib/csv"
import { PRIORITY_LABEL, type Effort, type InsightPoint, type InsightSlice, type Insights, type Report, type SliceBy, type Spread } from "@/lib/reports"

/** The ways the server slices work, in the picker's order; each custom field follows them. */
export const SLICE_BY: { by: SliceBy; label: string }[] = [
  { by: "project", label: "Project" },
  { by: "person", label: "Person" },
  { by: "priority", label: "Priority" },
  { by: "type", label: "Type" },
  { by: "status", label: "Status" },
  { by: "labels", label: "Labels" },
  { by: "cycle", label: "Cycle" },
  { by: "estimate", label: "Estimate" },
]

/** The way SLA slices work (linear-24): where each task's timer stands, sent only where the reader reads SLA state. */
export const SLA_SLICE: { by: SliceBy; label: string } = { by: "sla", label: "SLA" }

/** What the work with none is called, each way (a field's: None). */
const NONE_NAME: Partial<Record<SliceBy, string>> = {
  project: "No project",
  person: "Nobody",
  type: "Task",
  labels: "No labels",
  cycle: "No cycle",
  estimate: "No estimate",
  sla: "No SLA",
}

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

/**
 * The ways to slice a report's work: the server's own, SLA when it sent SLA slices (linear-24: only to members of
 * projects with SLAs on, so a guest's or an SLAs-off report never offers it), then each custom field it sliced by (B9-b1, L32).
 */
export function sliceChoices(ins: Pick<Insights, "fields"> & { slices?: Pick<InsightSlice, "by">[] }): { by: SliceBy; label: string }[] {
  const sla = (ins.slices ?? []).some((s) => s.by === "sla") ? [SLA_SLICE] : []
  return [...SLICE_BY, ...sla, ...(ins.fields ?? []).map((f) => ({ by: f.by, label: f.name }))]
}

/** A slice's name: a project, person, priority, type, status, label, cycle, estimate or a field's value; the work with none named for what it lacks. */
export function sliceName(s: Pick<InsightSlice, "by" | "key" | "name">): string {
  if (s.by === "priority") return PRIORITY_LABEL[s.key] ?? s.name
  if (s.key === "") return NONE_NAME[s.by] ?? (s.by.startsWith("field:") ? "None" : s.name)
  return s.name || STATUS_LABEL[s.key] || s.key
}

/** How the report's effort is counted: in points when any work was sent with them, else in hours. Pure. */
export function effortUnit(ins: Pick<Partial<Insights>, "effort" | "slices">): "points" | "hours" {
  const pts = (e?: { open: Effort; done: Effort }) => !!e && e.open.points + e.done.points > 0
  return pts(ins.effort) || (ins.slices ?? []).some((s) => pts(s.effort)) ? "points" : "hours"
}

/** An effort in its unit: "8 pt" or "12.5 h". Pure. */
export const effortLabel = (e: Effort | undefined, unit: "points" | "hours") => (unit === "points" ? `${tenth(e?.points ?? 0)} pt` : `${tenth(e?.hours ?? 0)} h`)

/** A slice to show on its own: which way, and which one. */
export type InsightFocus = { by: SliceBy; key: string }

/** Whether a done task is in a slice: by its keys that way (every way, L32), or, from a server before them, its own fields. */
export function inSlice(p: InsightPoint, f: InsightFocus): boolean {
  const keys = p.in?.[f.by]
  if (keys) return keys.includes(f.key)
  const own = OWN_KEY[f.by]
  return !!own && (own(p) ?? "") === f.key
}

/** A done task's own key the four first ways, for a server that sends no keys of its own. */
const OWN_KEY: Partial<Record<SliceBy, (p: InsightPoint) => string | undefined>> = {
  project: (p) => p.project_uuid,
  person: (p) => p.person_uuid,
  priority: (p) => p.priority,
  type: (p) => p.type_id,
}

const doneOf = (s: InsightSlice) => s.done ?? s.lead.n
const openOf = (s: InsightSlice) => s.open ?? s.age.n

/** The slices one way, the busiest first: most done, then most open, then by name. */
export function slicesBy(slices: InsightSlice[], by: SliceBy): InsightSlice[] {
  return slices.filter((s) => s.by === by).sort((a, b) => doneOf(b) - doneOf(a) || openOf(b) - openOf(a) || sliceName(a).localeCompare(sliceName(b)))
}

const SPREAD_HEAD = ["Tasks", "25th percentile (hours)", "Median (hours)", "85th percentile (hours)", "95th percentile (hours)"]
const spreadCells = (s: Spread) => [s.n, s.p25, s.p50, s.p85, s.p95]

/** A table of the Insights CSV: the measures, time in status, the slices, and each done task drawn. */
export type InsightsPart = "measures" | "in_status" | "slices" | "points"

const INSIGHTS_PARTS: readonly InsightsPart[] = ["measures", "in_status", "slices", "points"]

/**
 * Every Insights chart's rows, for the report's CSV after its own (each table
 * after a blank line): the four measures, time in status, each slice, and
 * each done task drawn; or the tables a chart elsewhere asks for (a
 * dashboard's widget), from the parts of the insights it was sent. A measure
 * it wasn't sent is left out. Names come from the slices (a person's, a
 * type's) and the report's projects; one they don't name is an empty cell.
 * Empty for a server that sends no insights.
 */
export function insightsCSV(r: { insights?: Partial<Insights>; all_projects?: Report["all_projects"] }, parts: readonly InsightsPart[] = INSIGHTS_PARTS): string {
  const ins = r.insights
  if (!ins) return ""
  const slices = ins.slices ?? []
  const lines: string[] = []
  if (parts.includes("measures")) {
    lines.push("", csvLine(["How long work takes", ...SPREAD_HEAD]))
    const measures: [string, Spread | undefined][] = [
      ["Cycle time (started to done)", ins.cycle],
      ["Lead time (made to done)", ins.lead],
      ["Triage time (left the backlog)", ins.triage],
      ["Age of open work", ins.age],
    ]
    for (const [label, s] of measures) if (s) lines.push(csvLine([label, ...spreadCells(s)]))
  }
  if (parts.includes("in_status") && ins.in_status) {
    lines.push("", csvLine(["Time in status", ...SPREAD_HEAD]))
    for (const s of ins.in_status) lines.push(csvLine([STATUS_LABEL[s.status] ?? s.status, ...spreadCells(s)]))
  }
  if (parts.includes("slices") && ins.slices) {
    // Each way by its name (a field's own); the effort in the report's one unit.
    const way = new Map(sliceChoices(ins).map((c) => [c.by, c.label]))
    const unit = effortUnit(ins)
    lines.push(
      "",
      csvLine([
        "Slice",
        "Name",
        "Done",
        "Cycle median (hours)",
        "Cycle 85th percentile (hours)",
        "Lead median (hours)",
        "Lead 85th percentile (hours)",
        "Open",
        "Age median (hours)",
        "Overdue",
        `Open effort (${unit})`,
        `Done effort (${unit})`,
      ]),
    )
    const size = (e?: Effort) => (e ? e[unit] : "")
    for (const s of slices) {
      lines.push(csvLine([way.get(s.by) ?? s.by, sliceName(s), doneOf(s), s.cycle.p50, s.cycle.p85, s.lead.p50, s.lead.p85, openOf(s), s.age.p50, s.overdue ?? "", size(s.effort?.open), size(s.effort?.done)]))
    }
  }
  if (parts.includes("points") && ins.points) {
    // A column only for names that were sent: a dashboard's chart gets no projects or slices.
    const named = (by: SliceBy) => slices.some((s) => s.by === by) && new Map(slices.filter((s) => s.by === by).map((s) => [s.key, sliceName(s)]))
    const project = r.all_projects && new Map(r.all_projects.map((p) => [p.project_uuid, p.project_name]))
    const person = named("person")
    const type = named("type")
    const columns = (
      [
        ["Done task", (p) => p.task_name],
        ["Done at", (p) => p.done_at],
        ["Cycle (hours)", (p) => p.cycle ?? ""],
        ["Lead (hours)", (p) => p.lead],
        project && ["Project", (p) => project.get(p.project_uuid) ?? ""],
        person && ["Person", (p) => (p.person_uuid ? (person.get(p.person_uuid) ?? "") : "Nobody")],
        ["Priority", (p) => PRIORITY_LABEL[p.priority ?? ""] ?? p.priority ?? ""],
        type && ["Type", (p) => (p.type_id ? (type.get(p.type_id) ?? "") : "Task")],
      ] as ([string, (p: InsightPoint) => string | number] | false | undefined)[]
    ).filter((c) => !!c)
    lines.push("", csvLine(columns.map(([head]) => head)))
    for (const p of ins.points) lines.push(csvLine(columns.map(([, cell]) => cell(p))))
    if (ins.points_capped) lines.push(csvLine([`The latest ${ins.points.length} done tasks; the measures above count them all.`]))
  }
  return lines.length ? lines.join("\n") + "\n" : ""
}
