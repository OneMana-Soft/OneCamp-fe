import { DUE_WEEK } from "@/lib/tasks/listAddress"

/**
 * A board's request, from the toolbar a project's list and board share
 * (components/task/WorkToolbar): its filters (status, priority, assignee,
 * cycle, the project's fields) as the list sends them, and its search as the
 * name filter the board's endpoint reads. A filter only the list draws (due
 * this week) is left out. Empty when nothing narrows the board, so the
 * default board keeps one cache key. Pure.
 */
export function boardQuery(filters: { id: string; value: unknown }[], search: string): string {
  const sent = boardFilters(filters, search)
  return sent.length ? new URLSearchParams({ filters: JSON.stringify(sent) }).toString() : ""
}

/** The filters a board sends (boardQuery's), as a list. Pure. */
export function boardFilters(filters: { id: string; value: unknown }[], search: string): { id: string; value: unknown }[] {
  const sent = filters.filter((f) => f.id !== DUE_WEEK).map(({ id, value }) => ({ id, value }))
  const name = search.trim()
  if (name) sent.push({ id: "task_name", value: name })
  return sent
}

/**
 * Where a project's list or board view opens its insights (B9-b1): the
 * overview's Reports, narrowed to the project and to the view's filters as
 * the board sends them, which the report runs through the list's own filter
 * builder; name is the view's, for the report to say which. Pure.
 */
export function insightsHref(projectId: string, filters: { id: string; value: unknown }[], search: string, name: string): string {
  const q = new URLSearchParams({ view: "reports", projects: projectId })
  const sent = boardFilters(filters, search)
  if (sent.length) q.set("filters", JSON.stringify(sent))
  if (name.trim()) q.set("name", name.trim())
  return `/app/project?${q.toString()}`
}
