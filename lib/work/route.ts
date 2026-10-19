/**
 * Where work opens: the one rule for every link to a task, a project, a saved
 * view or a cycle (projects programme, PROGRAM.md §5), which notifications,
 * chips, search, email and the desktop app call.
 *
 * DAY 0. Today's addresses: a task at /app/task/<id> (its page; the lists open
 * it beside them themselves), a project at /app/project/<id> with its view in
 * ?tab=, and a saved view or a cycle at its project, which has no address of
 * its own for them yet. Anything else is the projects page. Pure.
 */

/** A project's views, as its page names them in ?tab=. */
export type ProjectTab = "list" | "kanban" | "timeline" | "updates" | "attachments" | "docs"

export interface WorkTarget {
  task?: string | null
  project?: string | null
  tab?: ProjectTab
  view?: string | null
  cycle?: string | null
}

export function workRoute(to: WorkTarget = {}): string {
  if (to.task) return `/app/task/${to.task}`
  if (to.project) return to.tab ? `/app/project/${to.project}?tab=${to.tab}` : `/app/project/${to.project}`
  return "/app/project"
}
