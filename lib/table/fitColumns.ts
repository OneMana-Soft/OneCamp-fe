/**
 * Which columns step aside when a table is too narrow for all of them (a side
 * panel open beside it, a small window), so the table never scrolls sideways
 * to show a date. Least useful first; the title, status and due date always
 * stay. A column the person showed or hid themselves is left alone: this only
 * decides the ones they never touched.
 */

/** Rough width each column needs before its content starts to crowd. */
export const COLUMN_MIN_WIDTH: Record<string, number> = {
  select: 40,
  task_name: 240,
  task_status: 130,
  task_priority: 115,
  task_project_name: 140,
  task_assignee_name: 150,
  task_start_date: 120,
  task_due_date: 120,
  task_created_at: 120,
}

/**
 * The order the built-in columns are hidden in when space runs out. A
 * project's own field columns go in after the first, the created date: a
 * team added them on purpose, so they outrank it but nothing else.
 */
export const DROP_ORDER = ["task_created_at", "task_start_date", "task_assignee_name", "task_project_name", "task_priority"]

const DEFAULT_MIN = 120

export function columnsToHide(
  width: number,
  columns: string[],
  userVisibility: Record<string, boolean> = {},
): Record<string, false> {
  if (!width) return {}
  const shown = columns.filter((c) => userVisibility[c] !== false)
  const need = (cols: string[]) => cols.reduce((sum, c) => sum + (COLUMN_MIN_WIDTH[c] ?? DEFAULT_MIN), 0)
  const hide: Record<string, false> = {}
  let visible = shown
  // The created date steps aside first, then the field columns (the last one first), then the rest.
  const fields = shown.filter((c) => c.startsWith("field_")).reverse()
  const order = [DROP_ORDER[0], ...fields, ...DROP_ORDER.slice(1)]
  for (const c of order) {
    if (need(visible) <= width) break
    if (!visible.includes(c) || c in userVisibility) continue
    hide[c] = false
    visible = visible.filter((v) => v !== c)
  }
  return hide
}
