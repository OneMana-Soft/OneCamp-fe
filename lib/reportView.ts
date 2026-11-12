// The task view a report was opened from (B9-b1, L32): read from the
// report's address (lib/board/boardQuery's insightsHref), named, and the
// filters its report is asked with. Only Reports reads a view, so these live
// apart from lib/reports, which the dashboards' first screen also loads.

/** A task view a report was opened from: its one project ("" for a person's own list, My tasks), filters and saved name. */
export type ReportView = { project: string; filters: string; name: string }

/**
 * The task view a report was opened from (lib/board/boardQuery's
 * insightsHref): its one project, or none for a person's own list (mine=1:
 * My tasks, across their projects), its filters as the board sends them, and
 * its saved name ("" for a view never saved); null when the address names
 * no view. Pure.
 */
export function reportView(q: { get(name: string): string | null }): ReportView | null {
  const project = (q.get("projects") ?? "").trim()
  if (project.includes(",") || (!project && q.get("mine") !== "1")) return null
  return { project, filters: q.get("filters") ?? "", name: (q.get("name") ?? "").trim() }
}

/**
 * What a report opened from a view says it shows (reportView's view): the
 * saved view's name, or else its project's (My tasks without one), filtered
 * when the view was. Pure.
 */
export function reportViewName(view: ReportView, projectName: string | undefined): string {
  if (view.name) return view.name
  const base = view.project ? projectName || "this project" : "My tasks"
  return view.filters && view.filters !== "[]" ? `${base}, filtered` : base
}

/**
 * The filters a view's report is asked with: the view's own; a person's own
 * list keeps, besides, to the work assigned to them (me, their graph uid), as
 * My tasks does. Null while who they are isn't known. Pure.
 */
export function reportFilters(view: ReportView, me: string | undefined): string | null {
  if (view.project) return view.filters
  if (!me) return null
  const own = (filtersOf(view.filters) ?? []).filter((f) => (f as { id?: unknown })?.id !== "task_assignee_name")
  return JSON.stringify([...own, { id: "task_assignee_name", value: [me] }])
}

/** A view's filters as its list sent them (a JSON list), or none. Pure. */
export function filtersOf(sent: string): unknown[] | undefined {
  try {
    const v: unknown = JSON.parse(sent)
    return Array.isArray(v) && v.length > 0 ? v : undefined
  } catch {
    return undefined
  }
}
