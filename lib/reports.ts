// The reports view's data (GET /project/report, business/Project/report.go)
// and the pure helpers that turn it into what's drawn and downloaded.

import type { NormalizedChart } from "@/lib/utils/chartSpec"
import { GetEndpointUrl } from "@/services/endPoints"

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
}

/** The report's address in the cache: the reader's zone, how many weeks, which projects (none for all). */
export function reportKey(tz: string, weeks: number, projects: string[] = []): string {
  const q = new URLSearchParams({ tz, weeks: String(weeks) })
  if (projects.length > 0) q.set("projects", [...projects].sort().join(","))
  return `${GetEndpointUrl.ProjectReport}?${q.toString()}`
}

/** The spans a report can cover, in weeks. */
export const REPORT_WEEKS = [4, 12, 26] as const

export const PRIORITY_LABEL: Record<string, string> = { high: "High", medium: "Medium", low: "Low", "": "No priority" }

/** The open tasks of a row. */
export const openOf = (c: ReportCounts) => c.to_do + c.in_progress + c.in_review

/** "14 Sep" for a week's Monday ("2026-09-14"), read as a calendar day. Pure. */
export function weekLabel(iso: string, locale?: string): string {
  const [y, m, d] = iso.split("-").map(Number)
  if (!y || !m || !d) return iso
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(locale ?? "en-GB", { day: "numeric", month: "short", timeZone: "UTC" })
}

/** Done and added each week, as a chart. Pure. */
export function throughputChart(r: Report): NormalizedChart {
  return {
    type: "bar",
    title: "Done and added each week",
    labels: r.weeks.map((w) => weekLabel(w)),
    series: [
      { name: "Done", values: r.done },
      { name: "Added", values: r.added },
    ],
  }
}

/** Hours logged each week, or null when there are none to show. Pure. */
export function hoursChart(r: Report): NormalizedChart | null {
  if (!r.hours || r.hours.every((h) => h === 0)) return null
  return { type: "bar", title: "Hours logged each week", labels: r.weeks.map((w) => weekLabel(w)), series: [{ name: "Hours", values: r.hours }] }
}

/** The weekly total of hours, to one decimal. */
export const totalHours = (r: Report) => Math.round((r.hours ?? []).reduce((a, h) => a + h, 0) * 10) / 10

const csvCell = (v: string | number) => {
  const s = String(v)
  // A leading = + - @ (or a tab or carriage return before one) would run as a
  // formula in a spreadsheet, as the time report's CSV guards on the server.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}
const csvLine = (cells: (string | number)[]) => cells.map(csvCell).join(",")

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
