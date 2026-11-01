/**
 * What the grid's keys need before their own code is in (tables V-148): a
 * cell's kind, the keys' shape, and which keys move between cells. The keys
 * themselves (gridKeys' nextCell, and the grid's gridMoves) come with the live
 * cells' chunk; until it lands, the grid holds the keys waitsForLiveCells
 * names and presses them again, in order, once it does. Tiny, as it is on the
 * table's first load.
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

/** The kinds whose box Enter saves (by leaving it), going down a row: Enter on a button or a checkbox does what it does there. */
export const COMMITS_ON_ENTER: readonly CellKind[] = ["text", "number", "date"]

/** A cell's kind, from its markup (the cell's data-kind); text when none says. */
export const kindAt = (el: Element): CellKind => (el.closest<HTMLElement>("[data-kind]")?.dataset.kind ?? "text") as CellKind

/**
 * Whether the grid's keys take this key from a cell at rest of this kind:
 * Shift+Space (the row's selection), the arrows (a date keeps left and right
 * for its day, month and year), and Enter where it saves. Nothing with Alt,
 * Ctrl or Meta. gridKeys.test pins it to what nextCell and swallowsAtEdge do.
 */
export function movesBetweenCells(e: KeyInput, kind: CellKind): boolean {
  if (e.key === " " && e.shiftKey) return true
  if (e.altKey || e.ctrlKey || e.metaKey) return false
  if (e.key === "ArrowUp" || e.key === "ArrowDown") return true
  if (e.key === "ArrowLeft" || e.key === "ArrowRight") return kind !== "date"
  return e.key === "Enter" && COMMITS_ON_ENTER.includes(kind)
}

/**
 * The cell a key's target names (its element carrying data-cell): a cell
 * selected but shut holds the focus on its box, its text box inside (a tap
 * leaves a touch screen's focus there); anything else sits in its cell.
 */
export function cellOf(target: Element): HTMLElement | null {
  return target.hasAttribute("data-cell-box") ? target.querySelector<HTMLElement>("[data-cell]") : target.closest<HTMLElement>("[data-cell]")
}

/**
 * Whether the grid holds this key on target until the live cells land, and
 * presses it again once they do: a key that moves between cells, by the
 * cell's kind, and on a cell selected but shut, Enter or F2, which open it
 * (gridMoves' gridKeyDown). A key outside every cell goes by.
 */
export function waitsForLiveCells(e: KeyInput, target: Element): boolean {
  if (!cellOf(target)) return false
  if (target.hasAttribute("data-cell-box") && (e.key === "Enter" || e.key === "F2")) return true
  return movesBetweenCells(e, kindAt(target))
}
