/**
 * Keys on a list of tasks or a board, as Linear, GitHub and Gmail have them:
 * J and K (or the arrows) move, X selects, Enter opens, and a letter changes
 * a field of what is selected. Pure, for its test.
 */

export type ListField = "status" | "assignee" | "tags" | "priority"

export type ListAction =
  | { type: "move"; by: 1 | -1; extend: boolean }
  | { type: "column"; by: 1 | -1 }
  | { type: "open" }
  | { type: "toggle" }
  | { type: "clear" }
  | { type: "edit"; field: ListField }

interface Keys {
  key: string
  ctrlKey: boolean
  metaKey: boolean
  altKey: boolean
  shiftKey: boolean
}

/** What a key press means on a list, or null. Modified keys belong to others (Ctrl/⌘ K, the split view's Ctrl + Alt). */
export function listKey(e: Keys): ListAction | null {
  if (e.ctrlKey || e.metaKey || e.altKey) return null
  switch (e.key) {
    case "j":
    case "J":
    case "ArrowDown":
      return { type: "move", by: 1, extend: e.shiftKey }
    case "k":
    case "K":
    case "ArrowUp":
      return { type: "move", by: -1, extend: e.shiftKey }
    case "ArrowRight":
      return e.shiftKey ? null : { type: "column", by: 1 }
    case "ArrowLeft":
      return e.shiftKey ? null : { type: "column", by: -1 }
    case "Enter":
    case "o":
      return e.shiftKey ? null : { type: "open" }
    case "x":
      return { type: "toggle" }
    case "Escape":
      return { type: "clear" }
    case "s":
      return { type: "edit", field: "status" }
    case "a":
      return { type: "edit", field: "assignee" }
    // T for tags; L as Linear and GitHub call them labels.
    case "t":
    case "l":
      return { type: "edit", field: "tags" }
    case "p":
      return { type: "edit", field: "priority" }
  }
  return null
}

/** The id `by` steps from `current`, kept within the list; with none yet, the first (or the last, going up). */
export function stepIn(order: string[], current: string | null, by: 1 | -1): string | null {
  if (order.length === 0) return null
  const i = current === null ? -1 : order.indexOf(current)
  if (i < 0) return by > 0 ? order[0] : order[order.length - 1]
  return order[Math.min(order.length - 1, Math.max(0, i + by))]
}

/** Everything from `a` to `b`, both included, in the list's order: a run selected with Shift. */
export function rangeOf(order: string[], a: string, b: string): string[] {
  const i = order.indexOf(a)
  const j = order.indexOf(b)
  if (i < 0 || j < 0) return j < 0 ? [] : [b]
  return order.slice(Math.min(i, j), Math.max(i, j) + 1)
}

/**
 * On a board: the card at the same height in the nearest column `by` away
 * that has any, or the last card there if it is shorter. Columns that are
 * empty or folded are passed over.
 */
export function stepAcross(columns: string[][], current: string | null, by: 1 | -1): string | null {
  const from = current === null ? -1 : columns.findIndex((c) => c.includes(current))
  if (from < 0) return columns.find((c) => c.length > 0)?.[0] ?? null
  const row = columns[from].indexOf(current as string)
  for (let k = from + by; k >= 0 && k < columns.length; k += by) {
    if (columns[k].length > 0) return columns[k][Math.min(row, columns[k].length - 1)]
  }
  return current
}

/** The keys, for the list behind "?". */
export const LIST_SHORTCUTS: { keys: string; does: string }[] = [
  { keys: "J / K (or ↓ / ↑)", does: "Move down or up a list or a board's column" },
  { keys: "← / →", does: "The next column on a board" },
  { keys: "Enter (or O)", does: "Open the task. J and K then move from task to task" },
  { keys: "X", does: "Select it. Shift + J / K, or Shift-click, selects a run; Ctrl/⌘-click picks" },
  { keys: "S", does: "Set the status of what's selected" },
  { keys: "A", does: "Assign it to someone" },
  { keys: "T (or L)", does: "Its tags" },
  { keys: "P", does: "Its priority" },
  { keys: "Esc", does: "Clear the selection" },
]
