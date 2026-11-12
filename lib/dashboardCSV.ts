// A dashboard chart's rows as CSV (B9-b4, linear-32: "a CSV from every
// chart"), written by the report's own CSV (lib/reportCSV reportCSV,
// lib/reportInsights insightsCSV): a widget's data is a report's, cut to what
// the chart draws. Loaded when a widget's Download CSV is chosen, never on the
// dashboard's first load.

import { CSV_KINDS, widgetTitle, type Widget, type WidgetData } from "@/lib/dashboards"
import { displayNameOf } from "@/lib/personName"
import { insightsCSV } from "@/lib/reportInsights"
import { reportCSV } from "@/lib/reportCSV"
import type { FlowWeek, InsightField, InsightSlice, Insights, ReportPersonRow, ReportPriorityRow, ReportProjectRow } from "@/lib/reports"
import { downloadTextFile } from "@/lib/utils/file/downloadTextFile"

const personName = (p: ReportPersonRow) => displayNameOf(p) || "Nobody"

/** A chart widget's rows as CSV, as the reader was sent them; null for a number, a goal, or a widget with nothing worked out. Pure. */
export function widgetCSV(widget: Widget, result: WidgetData | undefined): string | null {
  if (!CSV_KINDS.has(widget.kind) || !result || result.error || !result.data) return null
  const d = result.data as Record<string, unknown>
  switch (widget.kind) {
    case "throughput":
      return reportCSV({ weeks: d.weeks as string[], done: d.done as number[], added: d.added as number[] }, personName, ["weeks"])
    case "flow":
      return reportCSV({ weeks: d.weeks as string[], flow: (d.flow as FlowWeek[] | undefined) ?? [] }, personName, ["flow"])
    case "control_chart":
      return insightsCSV({ insights: d as Partial<Insights> }, ["measures", "points"]).replace(/^\n+/, "")
    case "time_in_status":
      return insightsCSV({ insights: { in_status: (d.in_status as Insights["in_status"] | undefined) ?? [] } }, ["in_status"]).replace(/^\n+/, "")
    case "breakdown": {
      // Its slices (L32: any way, with counts and effort), named as Reports' CSV names them; a server before them sent rows.
      if (Array.isArray(d.slices)) {
        const field = d.field as InsightField | undefined
        return insightsCSV({ insights: { slices: d.slices as InsightSlice[], fields: field ? [field] : [] } }, ["slices"]).replace(/^\n+/, "")
      }
      const rows = (d.rows as unknown[] | null) ?? []
      if (d.by === "person") return reportCSV({ people: rows as ReportPersonRow[] }, personName, ["people"])
      if (d.by === "priority") return reportCSV({ priorities: rows as ReportPriorityRow[] }, personName, ["priorities"])
      return reportCSV({ projects: rows as ReportProjectRow[] }, personName, ["projects"])
    }
  }
  return null
}

/** The file a widget's CSV is saved as: its name, in plain letters. */
export function widgetCSVName(widget: Pick<Widget, "kind" | "title" | "query">): string {
  const slug = widgetTitle(widget).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
  return `onecamp-${slug || "widget"}.csv`
}

/** Saves a chart widget's CSV; false when there is none or the browser wouldn't save it. */
export function downloadWidgetCSV(widget: Widget, result: WidgetData | undefined): boolean {
  const csv = widgetCSV(widget, result)
  return csv !== null && downloadTextFile(widgetCSVName(widget), csv, "text/csv")
}
