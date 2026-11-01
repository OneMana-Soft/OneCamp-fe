/**
 * The grid's moves, off the table's first load (tables V-148): the keys that go
 * between cells, and a column's edge dragged to a new width. They come with
 * the live cells' chunk (gridCells re-exports them); until it lands, the grid
 * (DataTableGrid) holds the keys that move (gridKeyKinds' waitsForLiveCells)
 * and presses them again in order, and follows a drag's pointer, handing both
 * on here once it does.
 */

import { nextCell, swallowsAtEdge } from "@/lib/tables/gridKeys"
import { cellOf, kindAt, type KeyInput } from "@/lib/tables/gridKeyKinds"

/** A key on the grid: a keyboard event's, or one held while the chunk came (its prevent and stop then do nothing). */
export interface GridKey extends KeyInput {
  target: EventTarget | null
  /** In an input method's word, which is its box's. */
  composing: boolean
  preventDefault(): void
  stopPropagation(): void
}

/** What the keys move: the grid's size and rows, its focus, its rows' selection and its live cell. */
export interface GridKeyHost {
  rows: number
  cols: number
  rowId(row: number): string | undefined
  focusCell(row: number, col: number): void
  toggleRow(id: string): void
  bringToLife(td: Element | null): boolean
}

/**
 * The keys between cells, from a cell's box or a shut cell (which holds the
 * focus itself): Shift+Space selects the row; Enter, F2 or a typed key opens
 * a shut cell; the arrows and Enter go to the next cell (gridKeys' nextCell).
 */
export function gridKeyDown(e: GridKey, g: GridKeyHost): void {
  const target = e.target
  if (!(target instanceof HTMLElement) || e.composing) return
  // A cell selected but shut holds the focus itself, its text box inside (TextCell).
  const shut = target.hasAttribute("data-cell-box")
  const at = cellOf(target)?.dataset.cell
  if (!at) return
  const [row, col] = at.split(":").map(Number)
  // Shift+Space selects the focused cell's row.
  if (e.key === " " && e.shiftKey) {
    const id = g.rowId(row)
    if (id) {
      e.preventDefault()
      g.toggleRow(id)
    }
    return
  }
  // Enter or F2 opens a shut cell's box, and a typed key opens it to
  // replace what's there (the key goes on to the box, and to nothing else).
  if (shut && (e.key === "Enter" || e.key === "F2" || (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey))) {
    e.stopPropagation()
    if (e.key.length > 1) e.preventDefault()
    g.bringToLife(target.closest("tbody td[data-field]"))
    return g.focusCell(row, col)
  }
  const kind = kindAt(target)
  let atStart = true
  let atEnd = true
  let lines: { first: boolean; last: boolean } | undefined
  // A box at rest is read-only with all of it selected: there is no caret
  // to move through, so the arrows go to the next cell from it.
  if ((target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) && (kind === "text" || kind === "number") && !target.hasAttribute("data-rest")) {
    const s = target.selectionStart ?? 0
    const end = target.selectionEnd ?? 0
    atStart = s === 0 && end === 0
    atEnd = s === target.value.length && end === target.value.length
    if (target instanceof HTMLTextAreaElement) lines = { first: !target.value.slice(0, s).includes("\n"), last: !target.value.slice(end).includes("\n") }
  }
  const to = nextCell(e, { row, col }, { rows: g.rows, cols: g.cols }, { kind, atStart, atEnd, lines })
  if (to) {
    e.preventDefault()
    e.stopPropagation()
    g.focusCell(to.row, to.col)
  } else if (swallowsAtEdge(e, kind)) {
    e.preventDefault()
    e.stopPropagation()
  }
}

/** A column's edge, pressed: the grid's table, the rule that follows the edge, the column's place, and where its width goes. */
export interface ColumnDrag {
  table: HTMLElement
  rule: HTMLElement
  index: number
  /** Where the press was. */
  startX: number
  done(width: number): void
}

/** How narrow and how wide a column is dragged. */
export const COLUMN_PX = { min: 80, max: 640 } as const

/**
 * Drags a column's edge from where the pointer is (`x`): the column and the
 * rule follow the pointer from the press, and the width is kept as the button
 * comes up. A press already ended (while the chunk came) keeps its last place.
 */
export function columnDrag(d: ColumnDrag, x: number, ended: boolean): void {
  const col = d.table.querySelectorAll("col")[d.index + 1] as HTMLTableColElement | undefined
  const th = d.table.querySelector<HTMLElement>(`thead th[data-col-index="${d.index}"]`)
  if (!col || !th) return
  const startW = th.offsetWidth
  const left = th.offsetLeft
  let w = startW
  const to = (clientX: number) => {
    w = Math.max(COLUMN_PX.min, Math.min(COLUMN_PX.max, startW + clientX - d.startX))
    col.style.width = `${w}px`
    d.rule.style.transform = `translateX(${left + w - 1}px)`
  }
  const move = (ev: PointerEvent) => to(ev.clientX)
  const up = () => {
    window.removeEventListener("pointermove", move)
    window.removeEventListener("pointerup", up)
    d.rule.dataset.resizing = "false"
    d.rule.dataset.on = "false"
    d.done(Math.round(w))
  }
  d.rule.dataset.resizing = "true"
  d.rule.style.height = `${d.table.offsetHeight}px`
  if (x !== d.startX) to(x)
  if (ended) return up()
  window.addEventListener("pointermove", move)
  window.addEventListener("pointerup", up)
}
