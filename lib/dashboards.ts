// Dashboards (B9-b3: jira-08, asana-08, linear-32): a page of widgets, each a
// question about the work (a number, a chart, a table or a goal) that the
// server works out as whoever reads it (business/Dashboard). One is a
// person's own, a project's, or the workspace's; its keepers arrange it on a
// 12-column grid, and a phone shows it as one column in the same order.
// Everything here is pure.

import { durationLabel } from "@/lib/reportInsights"
import type { Spread } from "@/lib/reports"
import { app_dashboards_path } from "@/components/project/overviewViews"

export type DashboardScope = "mine" | "project" | "workspace"

export interface Dashboard {
  id: string
  scope: DashboardScope
  project_id?: string
  name: string
  shared: boolean
  created_by: string
  created_at: string
  updated_at: string
}

export type WidgetKind = "metric" | "throughput" | "control_chart" | "time_in_status" | "flow" | "breakdown" | "goal"
export type MetricMeasure = "open" | "overdue" | "due_this_week" | "done_total" | "on_time" | "cycle" | "lead" | "triage" | "age"
export type BreakdownBy = "project" | "person" | "priority"

/** What a widget reads: its own copy, kept when it was added. No projects is every project the reader is in. */
export interface WidgetQuery {
  projects?: string[]
  filters?: unknown[]
  search?: string
  weeks?: number
  measure?: MetricMeasure
  by?: BreakdownBy
  goal?: string
}

export interface Widget {
  id: string
  kind: WidgetKind
  title: string
  query: WidgetQuery
  x: number
  y: number
  w: number
  h: number
}

export type Place = Pick<Widget, "id" | "x" | "y" | "w" | "h">

/** A widget worked out for the reader: what it shows, or why it can't just now. */
export interface WidgetData {
  id: string
  kind: WidgetKind
  data?: unknown
  error?: string
}

/** A metric widget's number: nil when there is nothing to measure yet; a time's spread beside it. */
export interface MetricData {
  measure: MetricMeasure
  value: number | null
  spread?: Spread
}

export const COLUMNS = 12
export const MAX_WIDGETS = 24
export const MAX_NAME = 80

/** Each kind of widget: what it's called, what it shows, and the place it takes when added. */
export const KINDS: readonly { kind: WidgetKind; label: string; about: string; w: number; h: number }[] = [
  { kind: "metric", label: "A number", about: "One count or time: open, overdue, on time, cycle time and more.", w: 3, h: 2 },
  { kind: "throughput", label: "Done and added", about: "The tasks finished each week, beside the tasks added.", w: 6, h: 4 },
  { kind: "flow", label: "Flow of work", about: "Where the work stood at each week's end.", w: 6, h: 4 },
  { kind: "control_chart", label: "Control chart", about: "Each task done, at its cycle or lead time.", w: 6, h: 5 },
  { kind: "time_in_status", label: "Time in status", about: "How long the work done spent at each step.", w: 6, h: 4 },
  { kind: "breakdown", label: "Breakdown", about: "Open, overdue and done, by project, person or priority.", w: 6, h: 4 },
  { kind: "goal", label: "A goal", about: "One goal's progress, pace and health.", w: 3, h: 2 },
]

export const MEASURES: readonly { value: MetricMeasure; label: string; unit: "count" | "percent" | "time" }[] = [
  { value: "open", label: "Open tasks", unit: "count" },
  { value: "overdue", label: "Overdue", unit: "count" },
  { value: "due_this_week", label: "Due this week", unit: "count" },
  { value: "done_total", label: "Done", unit: "count" },
  { value: "on_time", label: "Done on time", unit: "percent" },
  { value: "cycle", label: "Cycle time", unit: "time" },
  { value: "lead", label: "Lead time", unit: "time" },
  { value: "triage", label: "Triage time", unit: "time" },
  { value: "age", label: "Age of open work", unit: "time" },
]

export const BREAKDOWNS: readonly { value: BreakdownBy; label: string }[] = [
  { value: "project", label: "By project" },
  { value: "person", label: "By person" },
  { value: "priority", label: "By priority" },
]

/** The widths a widget takes, in columns. */
export const SIZES: readonly { w: number; label: string }[] = [
  { w: 3, label: "Quarter" },
  { w: 6, label: "Half" },
  { w: 12, label: "Full width" },
]

export const kindOf = (kind: WidgetKind) => KINDS.find((k) => k.kind === kind) ?? KINDS[0]

/** A widget's name: its own title, or what it shows. */
export function widgetTitle(w: Pick<Widget, "kind" | "title" | "query">): string {
  if (w.title.trim()) return w.title.trim()
  if (w.kind === "metric") return MEASURES.find((m) => m.value === w.query.measure)?.label ?? "A number"
  if (w.kind === "breakdown") return BREAKDOWNS.find((b) => b.value === w.query.by)?.label ?? "Breakdown"
  return kindOf(w.kind).label
}

/** A metric's number in words: a count, a share, or a median time; "None" when there's nothing to measure. */
export function metricText(m: MetricData): string {
  if (m.value === null || m.value === undefined) return "None"
  const unit = MEASURES.find((x) => x.value === m.measure)?.unit
  if (unit === "percent") return `${Math.round(m.value)}%`
  if (unit === "time") return durationLabel(m.value)
  return m.value.toLocaleString()
}

/** The widgets in reading order: row by row, left to right (a phone's one column). */
export function ordered<T extends Pick<Place, "x" | "y">>(ws: readonly T[]): T[] {
  return [...ws].sort((a, b) => a.y - b.y || a.x - b.x)
}

/**
 * Places for widgets in this order: left to right, each row as tall as its
 * tallest, a widget that doesn't fit starting the next row. What the grid
 * draws and what is kept are the same. Pure.
 */
export function flowPlaces(ws: readonly Pick<Place, "id" | "w" | "h">[]): Place[] {
  let x = 0
  let y = 0
  let tall = 0
  return ws.map((wd) => {
    const w = Math.min(COLUMNS, Math.max(1, wd.w))
    if (x + w > COLUMNS) {
      y += tall
      x = 0
      tall = 0
    }
    const at = { id: wd.id, x, y, w, h: wd.h }
    x += w
    tall = Math.max(tall, wd.h)
    return at
  })
}

/** Whether two arrangements put every widget in the same place. */
export function samePlaces(a: readonly Place[], b: readonly Place[]): boolean {
  if (a.length !== b.length) return false
  const at = new Map(a.map((p) => [p.id, p]))
  return b.every((p) => {
    const q = at.get(p.id)
    return !!q && q.x === p.x && q.y === p.y && q.w === p.w && q.h === p.h
  })
}

/** The widgets in order with the one at `from` moved to `to`, then placed again. */
export function moved(ws: readonly Widget[], from: number, to: number): Place[] {
  const list = ordered(ws)
  if (from < 0 || from >= list.length || to < 0 || to >= list.length) return flowPlaces(list)
  const [w] = list.splice(from, 1)
  list.splice(to, 0, w)
  return flowPlaces(list)
}

/** The Mondays of the last n weeks to `now`'s, oldest first ("2026-11-02"), as a report names its weeks. */
export function lastWeeks(n: number, now: Date): string[] {
  const monday = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()))
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7))
  const out: string[] = []
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(monday)
    d.setUTCDate(d.getUTCDate() - 7 * i)
    out.push(d.toISOString().slice(0, 10))
  }
  return out
}

/** Who sees a dashboard, in words. */
export function scopeWords(d: Pick<Dashboard, "scope" | "shared">): string {
  if (d.scope === "mine") return "Only you"
  if (d.scope === "project") return d.shared ? "Everyone in the project" : "The project's admins"
  return d.shared ? "Everyone in the workspace" : "Workspace admins"
}


/** A dashboard's address, a project's list (?project=), or the page alone when neither is given. */
export function dashboardHref(id: string, project?: string): string {
  const q = new URLSearchParams()
  if (project) q.set("project", project)
  if (id) q.set("d", id)
  const s = q.toString()
  return s ? `${app_dashboards_path}?${s}` : app_dashboards_path
}
