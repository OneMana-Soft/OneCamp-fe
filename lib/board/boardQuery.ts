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
  const sent = filters.filter((f) => f.id !== DUE_WEEK).map(({ id, value }) => ({ id, value }))
  const name = search.trim()
  if (name) sent.push({ id: "task_name", value: name })
  return sent.length ? new URLSearchParams({ filters: JSON.stringify(sent) }).toString() : ""
}
