// The report's CSV (B9-b4): Reports' Download CSV and every chart a dashboard
// downloads (lib/dashboardCSV) write it here, one writer for both. Its code
// comes when a CSV is first asked for, never on a page's first load (V-49).

import { csvLine } from "@/lib/csv"
import { PRIORITY_LABEL, type Report, type ReportCounts, type ReportPersonRow } from "@/lib/reports"

/** A table of the report's CSV: its weeks, the flow of work, and each project, person or priority. */
export type ReportPart = "weeks" | "flow" | "projects" | "people" | "priorities"

/** The report's own CSV: its weeks, the flow of work when it was sent, each project and each person. */
const REPORT_PARTS: readonly ReportPart[] = ["weeks", "flow", "projects", "people"]

/**
 * The report as CSV, a blank line between its tables (the report's own, or
 * the ones a chart elsewhere asks for: a dashboard's widget). A table whose
 * rows weren't sent isn't written, and the weeks' hours only when the report
 * read them. Pure.
 */
export function reportCSV(
  r: Partial<Pick<Report, "weeks" | "done" | "added" | "hours" | "flow" | "projects" | "people" | "priorities">>,
  personName: (p: ReportPersonRow) => string,
  parts: readonly ReportPart[] = REPORT_PARTS,
): string {
  const weeks = r.weeks ?? []
  const counts = ["To do", "In progress", "In review", "Overdue", "Done"]
  const row = (c: ReportCounts) => [c.to_do, c.in_progress, c.in_review, c.overdue, c.done]
  const table = (part: ReportPart): string[] | null => {
    switch (part) {
      case "weeks": {
        const hours = r.hours !== undefined
        return [
          csvLine(["Week starting", "Done", "Added", ...(hours ? ["Hours"] : [])]),
          ...weeks.map((w, i) => csvLine([w, r.done?.[i] ?? 0, r.added?.[i] ?? 0, ...(hours ? [r.hours ? (r.hours[i] ?? 0) : ""] : [])])),
        ]
      }
      case "flow":
        if (!r.flow) return null
        return [
          csvLine(["Week starting", "To do", "In progress", "In review", "Done"]),
          ...weeks.map((w, i) => {
            const f = r.flow?.[i]
            return csvLine([w, f?.to_do ?? 0, f?.in_progress ?? 0, f?.in_review ?? 0, f?.done ?? 0])
          }),
        ]
      case "projects":
        return r.projects ? [csvLine(["Project", ...counts]), ...r.projects.map((p) => csvLine([p.project_name, ...row(p)]))] : null
      case "people":
        return r.people ? [csvLine(["Person", ...counts]), ...r.people.map((p) => csvLine([personName(p), ...row(p)]))] : null
      case "priorities":
        return r.priorities
          ? [csvLine(["Priority", "Open", "Overdue"]), ...r.priorities.map((p) => csvLine([PRIORITY_LABEL[p.priority] ?? p.priority, p.open, p.overdue]))]
          : null
    }
  }
  const tables = parts.map(table).filter((t): t is string[] => t !== null)
  return tables.map((t) => t.join("\n")).join("\n\n") + "\n"
}
