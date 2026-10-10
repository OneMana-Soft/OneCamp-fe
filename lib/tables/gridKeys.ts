/**
 * Moving around a table's grid from the keyboard, as a spreadsheet does.
 *
 * Every cell is an editor already (a text box, a select, a checkbox), so the
 * keys a cell needs for its own editing keep working, and the grid takes only
 * the ones a cell has no use for:
 *
 *  - Up and down move a row. A text box has no use for them, and a closed
 *    select or a date would change its value on them, which in a grid moves
 *    you a row by accident.
 *  - Left and right move a column only from the edge of the text (or from a
 *    cell with no text to move through); inside the text they move the caret.
 *    A date keeps them for moving between its day, month and year.
 *  - Enter in a text, number or date cell saves it (by leaving it) and goes
 *    down a row; Shift+Enter goes up. Enter on a button or a checkbox does
 *    what it does there.
 *  - Anything with Alt, Ctrl or Meta is left alone (Alt+Down opens a select).
 *
 * Pure: the grid hands it the key, where the caret is and the grid's size.
 */

export type CellKind = "text" | "number" | "date" | "select" | "checkbox" | "button" | "computed"

export interface CellPos {
  row: number
  col: number
}

export interface KeyInput {
  key: string
  shiftKey?: boolean
  altKey?: boolean
  ctrlKey?: boolean
  metaKey?: boolean
}

const TYPED: CellKind[] = ["text", "number"]
const COMMITS_ON_ENTER: CellKind[] = ["text", "number", "date"]

/**
 * Where a key moves the focus, or null to leave the key to the cell.
 * `atStart`/`atEnd` say whether the caret is at the start or end of a text
 * cell's text, with nothing selected.
 */
export function nextCell(
  e: KeyInput,
  at: CellPos,
  size: { rows: number; cols: number },
  cell: { kind: CellKind; atStart?: boolean; atEnd?: boolean },
): CellPos | null {
  if (e.altKey || e.ctrlKey || e.metaKey) return null
  const { row, col } = at
  const clamp = (p: CellPos): CellPos | null =>
    p.row < 0 || p.row >= size.rows || p.col < 0 || p.col >= size.cols || (p.row === row && p.col === col) ? null : p
  switch (e.key) {
    case "ArrowUp":
      return clamp({ row: row - 1, col })
    case "ArrowDown":
      return clamp({ row: row + 1, col })
    case "ArrowLeft":
      if (cell.kind === "date") return null
      if (TYPED.includes(cell.kind) && !cell.atStart) return null
      return clamp({ row, col: col - 1 })
    case "ArrowRight":
      if (cell.kind === "date") return null
      if (TYPED.includes(cell.kind) && !cell.atEnd) return null
      return clamp({ row, col: col + 1 })
    case "Enter":
      if (!COMMITS_ON_ENTER.includes(cell.kind)) return null
      return clamp({ row: e.shiftKey ? row - 1 : row + 1, col })
    default:
      return null
  }
}

/** Whether the grid takes this key even when there is nowhere to move (the edge). */
export function swallowsAtEdge(e: KeyInput, kind: CellKind): boolean {
  if (e.altKey || e.ctrlKey || e.metaKey) return false
  // A closed select changes its value on up and down, and a menu button opens:
  // at the first or last row those keys should do nothing, not that.
  return (e.key === "ArrowUp" || e.key === "ArrowDown") && (kind === "select" || kind === "button" || kind === "date" || kind === "number")
}
