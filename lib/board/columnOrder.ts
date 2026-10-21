/**
 * A board's column order (design/projects-vs-asana-jira/BOARD_COLUMNS_PLAN.md):
 * the project's statuses in the order its admins dragged them, shared by
 * everyone. Open columns (backlog, to do, in progress, in review, and the
 * project's own that count as them) go in any order among themselves; closed
 * ones (done, cancelled, and those that count as them) always come after, in
 * any order among themselves. The server keeps the same rule
 * (business/TaskStatus order.go) and refuses an order that breaks it.
 *
 * A person may hide columns: the order still holds them where they were, and
 * a move is told in the columns that person sees.
 */

import { isClosedStatus, type StatusOption } from "@/lib/taskStatus"

/** Whether a column is closed, by its status's category. */
export function closedColumn(status: Pick<StatusOption, "value" | "category">): boolean {
  return isClosedStatus(status.category ?? status.value)
}

/** Whether order puts no closed column before an open one. */
export function keepsClosedLast(order: string[], closed: (value: string) => boolean): boolean {
  let seen = false
  for (const v of order) {
    const c = closed(v)
    if (!c && seen) return false
    seen = seen || c
  }
  return true
}

/**
 * order with value moved before `before` (another column's value), or to the
 * end with null; null when that would put a closed column before an open one,
 * or moves nothing.
 */
export function moveColumn(order: string[], value: string, before: string | null, closed: (value: string) => boolean): string[] | null {
  if (!order.includes(value) || before === value) return null
  const rest = order.filter((v) => v !== value)
  const at = before === null ? rest.length : rest.indexOf(before)
  if (at < 0) return null
  const next = [...rest.slice(0, at), value, ...rest.slice(at)]
  if (next.every((v, i) => v === order[i])) return null
  return keepsClosedLast(next, closed) ? next : null
}

/**
 * Where a column lands put in the gap at index `gap` among the other columns
 * shown (0 is before the first, others.length after the last): straight after
 * the column shown on the gap's left, or straight before the first one shown,
 * so it passes no hidden column it needn't. The new order, or null when the
 * gap is where it already is, or one it may not go to (the closed columns'
 * rule).
 */
export function dropColumn(
  order: string[],
  shown: string[],
  value: string,
  gap: number,
  closed: (value: string) => boolean,
): string[] | null {
  const others = shown.filter((v) => v !== value)
  if (gap < 0 || gap > others.length || gap === shown.indexOf(value)) return null
  if (gap === 0) return moveColumn(order, value, others[0] ?? null, closed)
  const rest = order.filter((v) => v !== value)
  const after = rest[rest.indexOf(others[gap - 1]) + 1]
  return moveColumn(order, value, after ?? null, closed)
}

/**
 * The column moved one place among the columns shown: left before the one
 * shown before it, right after the one shown after it. Null at an end, or
 * where the closed columns' rule stops it.
 */
export function shiftColumn(order: string[], shown: string[], value: string, by: -1 | 1, closed: (value: string) => boolean): string[] | null {
  const i = shown.indexOf(value)
  if (i < 0) return null
  const others = shown.filter((v) => v !== value)
  // Its gap among the others is i; one left is i - 1, one right is i + 1.
  const gap = i + by
  if (gap < 0 || gap > others.length) return null
  return dropColumn(order, shown, value, gap, closed)
}

/**
 * The gaps a column may be put in among the columns shown, by index (see
 * dropColumn): the ones where it goes and the order changes.
 */
export function placesFor(order: string[], shown: string[], value: string, closed: (value: string) => boolean): number[] {
  const others = shown.filter((v) => v !== value)
  const out: number[] = []
  for (let gap = 0; gap <= others.length; gap++) {
    if (dropColumn(order, shown, value, gap, closed)) out.push(gap)
  }
  return out
}
