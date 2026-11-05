// The reports view's data (GET /project/report, business/Project/report.go)
// and the pure helpers that turn it into what's drawn and downloaded.

import type { NormalizedChart } from "@/lib/utils/chartSpec"
import { ProjectsGet } from "@/services/endpoints/projects"
import { csvLine } from "@/lib/csv"

export interface ReportCounts {
  to_do: number
  in_progress: number
  in_review: number
  overdue: number
  /** Done in the weeks shown. */
  done: number
}

export interface ReportProjectRow extends ReportCounts {
  project_uuid: string
  project_name: string
}

/** user_uuid missing is the tasks nobody has. */
export interface ReportPersonRow extends ReportCounts {
  user_uuid?: string
  user_name?: string
  user_full_name?: string
  user_profile_object_key?: string
}

export interface ReportPriorityRow {
  /** high, medium, low, or "" for none. */
  priority: string
  open: number
  overdue: number
}

export interface Report {
  /** Each week's Monday ("2026-09-14"), oldest first; the lists below line up with it. */
  weeks: string[]
  done: number[]
  added: number[]
  /** null when the time logged couldn't be read. */
  hours: number[] | null
  open: number
  overdue: number
  due_this_week: number
  done_total: number
  /** Of what got done with a due date, the share done by it; missing when none had one. */
  on_time_percent?: number
  projects: ReportProjectRow[]
  people: ReportPersonRow[]
  priorities: ReportPriorityRow[]
  all_projects: { project_uuid: string; project_name: string }[]
  truncated: boolean
  /** Where the tasks stood at the end of each week (missing from servers before it). */
  flow?: FlowWeek[]
  /** How long the work took (business/Project/insights.go; missing from servers before it). */
  insights?: Insights
}

/** How a set of durations, in hours, spreads: how many, and the 25th to 95th percentiles (helpers/spread.go). */
export interface Spread {
  n: number
  p25: number
  p50: number
  p85: number
  p95: number
}

/** How long the report's work took, in hours. Cycle, lead and time in status: the tasks done in the weeks shown;
 * triage: the tasks that left the backlog in them; age: the tasks open now. */
export interface Insights {
  cycle: Spread
  lead: Spread
  triage: Spread
  age: Spread
  /** Each step work moves through (backlog, to do, in progress, in review; a project's own status counts as its category) and how long done tasks spent in it. */
  in_status: (Spread & { status: string })[]
  /** The tasks done in the weeks shown, the latest first, up to 500 (points_capped when there were more). */
  points: InsightPoint[]
  points_capped: boolean
  slices: InsightSlice[]
  /** The projects' custom fields the work is also sliced by (select, multi-select, person): their slices are by "field:<id>" (B9-b1). */
  fields?: InsightField[]
  /** More fields than the report slices by (20): narrowing to a project slices by its own. */
  fields_capped?: boolean
}

/** A custom field the report slices work by. */
export interface InsightField {
  by: `field:${string}`
  name: string
  type: "select" | "multi_select" | "person"
  project_uuid: string
}

/** One task done in the weeks shown; cycle is missing when it was never started. */
export interface InsightPoint {
  task_uuid: string
  task_name: string
  done_at: string
  cycle?: number
  lead: number
  project_uuid: string
  person_uuid?: string
  priority?: string
  type_id?: string
  /** The task's keys in each field it is sliced by ("" for none). */
  in?: Record<string, string[]>
}

/** The spreads of one project, person, priority, type or custom field's value; an empty key is the work with none. */
export interface InsightSlice {
  by: "project" | "person" | "priority" | "type" | `field:${string}`
  key: string
  name: string
  cycle: Spread
  lead: Spread
  age: Spread
}

/** The flow of work at the end of one week: the open tasks by where they stand, and what got done since the report began. */
export interface FlowWeek {
  to_do: number
  in_progress: number
  in_review: number
  done: number
}

/** The report's address in the cache: the reader's zone, how many weeks, which projects (none for all), and a view's filters as its list sends them (B9-b1). */
export function reportKey(tz: string, weeks: number, projects: string[] = [], filters = ""): string {
  const q = new URLSearchParams({ tz, weeks: String(weeks) })
  if (projects.length > 0) q.set("projects", [...projects].sort().join(","))
  if (filters) q.set("filters", filters)
  return `${ProjectsGet.ProjectReport}?${q.toString()}`
}

/**
 * The list or board view a report was opened from (lib/board/boardQuery's
 * insightsHref): its one project, its filters as the board sends them, and
 * its saved name ("" for a view never saved); null when the address names no
 * one project. Pure.
 */
export function reportView(q: { get(name: string): string | null }): { project: string; filters: string; name: string } | null {
  const project = (q.get("projects") ?? "").trim()
  if (!project || project.includes(",")) return null
  return { project, filters: q.get("filters") ?? "", name: (q.get("name") ?? "").trim() }
}

/**
 * What a report opened from a view says it shows (reportView's view): the
 * saved view's name, or else its project's, filtered when the view was. Pure.
 */
export function reportViewName(view: { filters: string; name: string }, projectName: string | undefined): string {
  if (view.name) return view.name
  const project = projectName || "this project"
  return view.filters && view.filters !== "[]" ? `${project}, filtered` : project
}

/** The spans a report can cover, in weeks. */
export const REPORT_WEEKS = [4, 12, 26] as const

export const PRIORITY_LABEL: Record<string, string> = { high: "High", medium: "Medium", low: "Low", "": "No priority" }

/** The open tasks of a row. */
export const openOf = (c: ReportCounts) => c.to_do + c.in_progress + c.in_review

/**
 * "14 Sep" for a week's Monday ("2026-09-14"), read as a calendar day. Pure.
 * A month is always three letters: en-GB's own short month is "Sept", which
 * left one label in twelve a letter longer than its neighbours on the axis.
 */
export function weekLabel(iso: string, locale?: string): string {
  const [y, m, d] = iso.split("-").map(Number)
  if (!y || !m || !d) return iso
  const date = new Date(Date.UTC(y, m - 1, d))
  if (locale) return date.toLocaleDateString(locale, { day: "numeric", month: "short", timeZone: "UTC" })
  return `${d} ${MONTHS[m - 1]}`
}

/**
 * "6 Oct" for a moment, the day it fell on here, written as weekLabel writes a
 * week, so a dot's tip reads like the axis under it and like the rest of the
 * app: day before month, never the browser's "Oct 6". Pure.
 */
export function dayLabel(at: Date): string {
  return `${at.getDate()} ${MONTHS[at.getMonth()]}`
}
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

/** Done and added each week, as a chart. Pure. */
export function throughputChart(r: Report): NormalizedChart {
  return {
    type: "bar",
    title: "Done and added each week",
    unit: "Tasks",
    labels: r.weeks.map((w) => weekLabel(w)),
    // Done is the story, in the one chart hue; what came in is its context, in
    // the neutral ink. Two steps of one blue ramp were too close to tell apart.
    series: [
      // Two series in the chart's own order (sky, then berry): neither is a
      // status, so neither borrows a status colour.
      { name: "Done", values: r.done },
      { name: "Added", values: r.added },
    ],
  }
}

/**
 * The flow of work, week by week, as stacked bands: done at the bottom, then
 * in review, in progress and to do. A band that keeps widening is work piling
 * up at that step. Null when there's no flow to show. Pure.
 */
export function flowChart(r: Report): NormalizedChart | null {
  const flow = r.flow
  if (!flow || flow.length !== r.weeks.length || flow.every((w) => w.to_do + w.in_progress + w.in_review + w.done === 0)) return null
  return {
    type: "area",
    stacked: true,
    title: "Flow of work",
    unit: "Tasks",
    labels: r.weeks.map((w) => weekLabel(w)),
    // The statuses' own colours, the tokens their dots use (types/table).
    series: [
      { name: "Done", values: flow.map((w) => w.done), color: "var(--success)" },
      { name: "In review", values: flow.map((w) => w.in_review), color: "var(--warning)" },
      { name: "In progress", values: flow.map((w) => w.in_progress), color: "var(--info)" },
      { name: "To do", values: flow.map((w) => w.to_do), color: "var(--muted-foreground)" },
    ],
  }
}

/** Hours logged each week, or null when there are none to show. Pure. */
export function hoursChart(r: Report): NormalizedChart | null {
  if (!r.hours || r.hours.every((h) => h === 0)) return null
  return { type: "bar", title: "Hours logged each week", unit: "Hours", labels: r.weeks.map((w) => weekLabel(w)), series: [{ name: "Hours", values: r.hours }] }
}

/** The weekly total of hours, to one decimal. */
export const totalHours = (r: Report) => Math.round((r.hours ?? []).reduce((a, h) => a + h, 0) * 10) / 10


/** The report as CSV: the weeks, then each project and each person. Pure. */
export function reportCSV(r: Report, personName: (p: ReportPersonRow) => string): string {
  const lines = [csvLine(["Week starting", "Done", "Added", "Hours"])]
  r.weeks.forEach((w, i) => lines.push(csvLine([w, r.done[i] ?? 0, r.added[i] ?? 0, r.hours ? (r.hours[i] ?? 0) : ""])))
  const counts = ["To do", "In progress", "In review", "Overdue", "Done"]
  const row = (c: ReportCounts) => [c.to_do, c.in_progress, c.in_review, c.overdue, c.done]
  lines.push("", csvLine(["Project", ...counts]))
  for (const p of r.projects) lines.push(csvLine([p.project_name, ...row(p)]))
  lines.push("", csvLine(["Person", ...counts]))
  for (const p of r.people) lines.push(csvLine([personName(p), ...row(p)]))
  return lines.join("\n") + "\n"
}
