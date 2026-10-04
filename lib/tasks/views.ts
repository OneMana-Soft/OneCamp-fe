/**
 * Saved task views: what a task list shows (filters, sort, columns), kept by
 * name per list. Pure helpers; the list itself lives on the server.
 */

export interface TaskViewState {
  filters: { id: string; value: unknown }[]
  sort: { id: string; desc: boolean }[]
  /** Desktop table only: which columns are hidden or shown. */
  columns?: Record<string, boolean>
}

export interface SavedTaskView {
  id: string
  scope: string
  name: string
  state: TaskViewState
}

export const taskViewScope = (projectId?: string) => (projectId ? `project:${projectId}` : "mine")

/** A view stripped to what it means, so key order and empties don't matter. */
function canonical(s: TaskViewState): string {
  const filters = [...(s.filters ?? [])]
    .filter((f) => !(Array.isArray(f.value) && f.value.length === 0))
    .map((f) => ({ id: f.id, value: Array.isArray(f.value) ? [...f.value].map(String).sort() : f.value }))
    .sort((a, b) => a.id.localeCompare(b.id))
  const sort = (s.sort ?? []).map((x) => ({ id: x.id, desc: !!x.desc }))
  const columns = Object.entries(s.columns ?? {})
    .filter(([, v]) => v === false)
    .map(([k]) => k)
    .sort()
  return JSON.stringify({ filters, sort, columns })
}

/** Whether the list is showing exactly this view. Columns count only when the
 *  caller tracks them (the phone drawers don't). */
export function sameView(a: TaskViewState, b: TaskViewState, withColumns = true): boolean {
  if (!withColumns) return canonical({ ...a, columns: {} }) === canonical({ ...b, columns: {} })
  return canonical(a) === canonical(b)
}
