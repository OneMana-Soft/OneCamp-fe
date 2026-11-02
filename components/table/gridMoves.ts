/**
 * The grid's moves, off the table's first load (tables V-148): the keys that go
 * between cells, what a click does with a cell's text (V-295), and a column's
 * edge dragged to a new width. They come with the live cells' chunk (gridCells
 * re-exports them); until it lands, the grid (DataTableGrid) holds the keys
 * that move (gridKeyKinds' waitsForLiveCells) and presses them again in order,
 * makes a click on a cell at rest again, and follows a drag's pointer, handing
 * each on here once it does.
 */

import { isMacLike } from "@/lib/keys/chord"
import { nextCell, swallowsAtEdge } from "@/lib/tables/gridKeys"
import { cellOf, kindAt, type KeyInput } from "@/lib/tables/gridKeyKinds"
import { tableCellCommand } from "@/lib/tables/tableKeys"
import { localDay } from "@/lib/utils/timeZone"

/** A key on the grid: a keyboard event's, or one held while the chunk came (its prevent and stop then do nothing). */
export interface GridKey extends KeyInput {
  code?: string
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
  /** Opens the row's record from this cell (Space); false when the grid opens none. */
  openRecord(row: number, col: number): boolean
  /** Saves the day in a date cell (⌘;); false for a cell of another kind, or for a reader who may only view the table. */
  setDay(row: number, col: number, day: string): boolean
}

// Firefox clicks a button on Space's keyup whatever its keydown said, so a Space taken keeps its keyup (gridKeyUp).
let spaceTaken = false

/** A cell's text box: its input, or its text area. */
type TextBox = HTMLInputElement | HTMLTextAreaElement
const isBox = (el: unknown): el is TextBox => el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement

/** A text box's selection, start and end (one place for a caret); null for a control without one, as a checkbox or an email box. */
function selectionOf(el: unknown): [number, number] | null {
  if (!isBox(el)) return null
  const { selectionStart: start, selectionEnd: end } = el
  return start === null || end === null ? null : [start, end]
}

/** Puts a text box's caret at the end of its text; a box with no caret to place (an email box) keeps its selection. */
function caretAtEnd(el: Element | null): void {
  if (isBox(el) && el.selectionStart !== null) el.setSelectionRange(el.value.length, el.value.length)
}

/**
 * Whether a cell reads as selected, not typed in, as a sheet's selected cell
 * (V-295): shut (it holds the focus itself), at rest, or its text box's whole
 * text selected and unchanged, as a click or a move between cells leaves it.
 * Enter and F2 open it, the caret at its text's end; Space expands its
 * record; the arrows go across from it; a key typed replaces its text.
 */
function selectedCell(el: Element): boolean {
  if (el.hasAttribute("data-cell-box") || el.hasAttribute("data-rest")) return true
  const s = selectionOf(el)
  return !!s && !el.hasAttribute("data-escape-own") && s[0] === 0 && s[1] > 0 && s[1] === (el as TextBox).value.length
}

/** The grid's cell an element sits in. */
const tdOf = (el: unknown) => (el instanceof Element ? el.closest<HTMLElement>("tbody td[data-field]") : null)

/**
 * The last press, a mouse's or a pen's (cellPress): whether it landed in the
 * cell being typed in. Null after a finger's, whose tap a touch screen selects
 * as it does. One before the live cells landed went unseen: a mouse's, on a
 * cell not typed in.
 */
let press: { typedIn: boolean } | null = { typedIn: false }
/** Where a click's press put the caret in a cell's text box, by the cell: a double-click's second press puts it back (cellMouseDown). */
let pressedAt: { cell: string; at: [number, number] } | null = null

/** A press on the grid (its pointerdown), as the focus is before the press moves it: what its click does with a cell's text (cellClick). */
export function cellPress(e: { pointerType: string; target: EventTarget | null }): void {
  const focused = document.activeElement
  const typedIn = !!focused && !!tdOf(focused) && tdOf(focused) === tdOf(e.target) && !selectedCell(focused)
  press = e.pointerType === "touch" ? null : { typedIn }
}

/**
 * A press's mousedown on the grid: a double-click's second press puts the
 * caret back where its first put it, to type there, where a browser would
 * select a word (V-295). In a cell being typed in, it selects the word.
 */
export function cellMouseDown(e: { detail: number; target: EventTarget | null; preventDefault(): void }): void {
  const at = pressedAt
  pressedAt = null
  if (e.detail !== 2 || !at || !isBox(e.target) || e.target.dataset.cell !== at.cell) return
  e.preventDefault()
  e.target.setSelectionRange(...at.at)
}

/**
 * A click on the grid, once the live cells are in (DataTableGrid's
 * onClickCapture). A mouse's or a pen's selects its cell, the whole text, so
 * a key typed replaces it, as a sheet's click does (V-295); a drag's
 * selection stays, and in the cell being typed in the caret stays where the
 * press put it. A cell at rest comes to life by its click, its live box
 * taking the focus, and the click is made again on that box, which opens a
 * picker's.
 */
export function cellClick(
  e: { detail: number; target: EventTarget | null; preventDefault(): void; stopPropagation(): void },
  bringToLife: (td: Element | null) => boolean,
): void {
  const target = e.target
  const td = tdOf(target)
  const root = td?.firstElementChild
  if (!(target instanceof HTMLElement) || !td || !root) return
  // Its press, a mouse's or a pen's: a click the keys or a script made has none.
  const p = e.detail === 1 ? press : null
  if (!target.closest("[data-rest]")) {
    if (p && isBox(target)) takeText(target, selectionOf(target), p.typedIn)
    return
  }
  const path = placeIn(root, target)
  // The caret, or a drag's selection, the press put in the box at rest.
  const pressed = e.detail > 0 ? selectionOf(target) : null
  e.preventDefault()
  e.stopPropagation()
  if (!bringToLife(td)) return
  const same = path && follow(td.firstElementChild, path)
  if (!(same instanceof HTMLElement)) return
  same.focus()
  if (isBox(same)) {
    if (p) takeText(same, pressed, p.typedIn)
    else if (pressed) same.setSelectionRange(...pressed)
    else same.select()
  }
  same.click()
}

/**
 * What a click does with a cell's text box after its press: pressed is the
 * press's caret, or a drag's selection, or null for a box without one. A
 * cell being typed in keeps the caret, and its double-click selects a word.
 */
function takeText(box: TextBox, pressed: [number, number] | null, typedIn: boolean): void {
  const caret = !typedIn && pressed && pressed[0] === pressed[1] ? pressed : null
  const cell = box.dataset.cell
  pressedAt = caret && cell ? { cell, at: caret } : null
  if (!typedIn && (caret || !pressed)) box.select()
  else if (pressed) box.setSelectionRange(...pressed)
}

/** Where el sits under root, as the index of each element on the way down. */
function placeIn(root: Element, el: Element): number[] | null {
  const path: number[] = []
  for (let n: Element | null = el; n !== root; n = n.parentElement) {
    if (!n?.parentElement) return null
    path.unshift(Array.prototype.indexOf.call(n.parentElement.children, n))
  }
  return path
}

/** The element at path under root: a live cell's markup is its resting cell's, place for place. */
function follow(root: Element | null, path: number[]): Element | null {
  let n: Element | null = root
  for (const i of path) n = n?.children[i] ?? null
  return n
}

/**
 * A selected cell's keys (the key table's cell rows, tableKeys), ahead of
 * the keys between cells: Space expands its record, unless the cell is typed
 * in or a checkbox, which Space ticks; ⌘; sets a date to today.
 */
export function cellKeyDown(e: GridKey, g: GridKeyHost): boolean {
  // A Space taken before whose keyup went elsewhere (to the record it opened) is done with (V-267).
  spaceTaken = false
  const target = e.target
  if (!(target instanceof HTMLElement) || e.composing) return false
  const { key, code, metaKey = false, ctrlKey = false, altKey = false, shiftKey = false } = e
  const command = tableCellCommand({ key, code, metaKey, ctrlKey, altKey, shiftKey }, isMacLike())
  const at = command ? cellOf(target)?.dataset.cell : undefined
  if (!at) return false
  const [row, col] = at.split(":").map(Number)
  if (command === "expandRecord") {
    // A cell its click selected isn't typed in, as one the keys reached isn't (selectedCell).
    const typing = isBox(target) && !target.readOnly && !selectedCell(target)
    if (typing || kindAt(target) === "checkbox" || !g.openRecord(row, col)) return false
    spaceTaken = true
  } else if (!g.setDay(row, col, localDay())) return false
  e.preventDefault()
  e.stopPropagation()
  return true
}

/** A key's release on the grid: a Space that cellKeyDown took keeps its keyup. */
export function gridKeyUp(e: { key: string; preventDefault(): void }): void {
  if (e.key !== " " || !spaceTaken) return
  spaceTaken = false
  e.preventDefault()
}

/**
 * The keys between cells, from a cell's box or a shut cell (which holds the
 * focus itself): Shift+Space selects the row; Enter or F2 opens a selected
 * cell (selectedCell), the caret at its text's end, and a typed key opens a
 * shut cell; the arrows, and Enter in a cell being typed in, go to the next
 * cell (gridKeys' nextCell).
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
  const kind = kindAt(target)
  // A shut cell, or a text or number cell's box selected: not typed in.
  const selected = shut || ((kind === "text" || kind === "number") && isBox(target) && selectedCell(target))
  const plain = !e.ctrlKey && !e.metaKey && !e.altKey
  // Enter or F2 opens a selected cell to type in, the caret at its text's
  // end, as a sheet's do (V-295; Shift+Enter goes up from it). A typed key
  // opens a shut cell to replace what's there (the key goes on to the box,
  // and to nothing else), as focusCell selects all of it.
  const opens = selected && plain && (e.key === "F2" || (e.key === "Enter" && !e.shiftKey))
  if (opens || (shut && plain && e.key.length === 1)) {
    e.stopPropagation()
    if (opens) e.preventDefault()
    g.bringToLife(tdOf(target))
    g.focusCell(row, col)
    if (opens) caretAtEnd(document.activeElement)
    return
  }
  let atStart = true
  let atEnd = true
  let lines: { first: boolean; last: boolean } | undefined
  // A selected box (one at rest is read-only, all of it selected) has no
  // caret to move through, so the arrows go to the next cell from it.
  if (isBox(target) && (kind === "text" || kind === "number") && !selected) {
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
