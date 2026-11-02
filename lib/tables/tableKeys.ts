/**
 * A table's keys (airtable-04, AV-6 and AV-7): one table, which the table page
 * and its grid bind and the keys list shows as its Tables group while a table
 * is open (lib/shortcuts/pageGroups), so the list names no key that does
 * nothing. Rows are in lib/keys/chord's notation; a row without a command
 * names a key its own control binds (the grid's moves, a record's J and K).
 * Airtable's keys, Sheets' where they differ (Enter, Shift+Space). Pure.
 */

import { chordMatches, chordWords } from "@/lib/keys/chord"

/** The palette's switchers ⌘J and ⌘⇧K open on, "<surface>:<entry>" (components/table/tablePalette). */
export const TABLE_SURFACE = "table"
export const TABLE_VIEWS_SURFACE = "table-views"
export const SWITCH_TABLE = `${TABLE_SURFACE}:switch-table`
export const SWITCH_VIEW = `${TABLE_VIEWS_SURFACE}:switch-view`

export type TableCommand =
  | "switchTable"
  | "switchView"
  | "find"
  | "replace"
  | "search"
  | "filter"
  | "sort"
  | "addRow"
  | "expandRecord"
  | "today"
  | "undo"
  | "redo"

/** Where a key was pressed, as the table's keys stand aside for it. */
export interface KeyPlace {
  /** A text box (a cell's read-only one at rest too), a select, an editor. */
  field: boolean
  /** A box open for typing, a select, an editor: the browser undoes its text. */
  editing: boolean
  /** A menu or a picker. */
  menu: boolean
  /** A dialog over the table: a form, the keys list, a record. */
  dialog: boolean
}

export interface TableKeyRow {
  /** Tiptap's notation: 'Mod-Shift-k'; 'Space' is the space bar. */
  keys: string
  /** Other chords that do the same. */
  alt?: string[]
  /** Only on a Mac, or off one: ⌘H hides a Mac's app, so ⌘⇧H replaces there. */
  on?: "mac" | "pc"
  label: string
  /** What the table runs for it. */
  command?: TableCommand
  /** Where the key is left alone, to what is there. */
  not?: readonly (keyof KeyPlace)[]
  /** A key the grid's selected cell takes (Space, ⌘;), never the page. */
  cell?: true
}

const OVER: readonly (keyof KeyPlace)[] = ["menu", "dialog"]

export const TABLE_KEYS: readonly TableKeyRow[] = [
  { keys: "Mod-j", label: "Switch to another table", command: "switchTable", not: OVER },
  { keys: "Mod-Shift-k", label: "Switch to another view", command: "switchView", not: OVER },
  { keys: "Mod-f", label: "Find in this view", command: "find", not: ["dialog"] },
  { keys: "Mod-Shift-h", on: "mac", label: "Find and replace", command: "replace", not: ["dialog"] },
  { keys: "Mod-h", on: "pc", label: "Find and replace", command: "replace", not: ["dialog"] },
  { keys: "/", label: "Search the rows", command: "search", not: ["field", ...OVER] },
  { keys: "Mod-Shift-f", label: "Filter the view", command: "filter", not: OVER },
  { keys: "Mod-Shift-s", label: "Sort and group the view", command: "sort", not: OVER },
  // R off every field, as a selected cell types its R; ⌘⇧⏎ from a cell too.
  { keys: "r", label: "Add a row", command: "addRow", not: ["field", ...OVER] },
  { keys: "Mod-Shift-Enter", label: "Add a row", command: "addRow", not: OVER },
  { keys: "Space", label: "Expand the row's record", command: "expandRecord", cell: true },
  { keys: "Mod-;", label: "Set a date to today", command: "today", cell: true },
  { keys: "Mod-z", label: "Undo your last change", command: "undo", not: ["editing", "menu"] },
  { keys: "Mod-Shift-z", label: "Redo it", command: "redo", not: ["editing", "menu"] },
  { keys: "Mod-y", on: "pc", label: "Redo it", command: "redo", not: ["editing", "menu"] },
  { keys: "ArrowUp", alt: ["ArrowDown", "ArrowLeft", "ArrowRight"], label: "Move between cells" },
  // A click selects a cell (V-295): Enter edits a selected cell, the caret at its text's end, and saves one being edited.
  { keys: "Enter", label: "Edit the selected cell, or save the one being edited and go down" },
  { keys: "Shift-Enter", label: "Save the cell and go up a row" },
  { keys: "F2", label: "Edit the cell as it is (typing replaces it)" },
  { keys: "Shift-ArrowDown", alt: ["Shift-ArrowUp", "Shift-ArrowLeft", "Shift-ArrowRight"], label: "Select cells" },
  { keys: "Shift-Space", label: "Select the row" },
  { keys: "Mod-c", alt: ["Mod-v"], label: "Copy or paste cells" },
  { keys: "Mod-d", label: "Fill the selection down" },
  { keys: "Delete", alt: ["Backspace"], label: "Clear the selected cells" },
  { keys: "j", alt: ["k"], label: "The next or previous record, in a record" },
  { keys: "Escape", label: "Close the record, or stop editing" },
]

const chordsOf = (row: TableKeyRow) => [row.keys, ...(row.alt ?? [])]
const onThis = (row: TableKeyRow, mac: boolean) => !row.on || row.on === (mac ? "mac" : "pc")

/**
 * A row's chords in the keys list's words. Chords that share their modifiers
 * read as one, as the list writes Ctrl + Alt + 1 / 2 / 3 (its combosOf reads
 * each back): Shift + ↓ / ↑ / ← / →. Any others are joined by "or".
 */
function rowWords(row: TableKeyRow): string {
  const words = chordsOf(row).map(chordWords)
  const mods = words.map((w) => w.slice(0, Math.max(0, w.lastIndexOf(" + "))))
  const keys = words.map((w, i) => (mods[i] ? w.slice(mods[i].length + 3) : w))
  // A slash key stays apart: "/" between keys is the list's "or".
  const one = words.length > 1 && mods[0] !== "" && mods.every((m) => m === mods[0]) && !keys.includes("/")
  return one ? `${mods[0]} + ${keys.join(" / ")}` : words.join(" or ")
}
type Press = Parameters<typeof chordMatches>[0]
// The space bar's key is " ", which the rows name Space. A copy by hand: an event's keys are getters a spread drops.
const named = (e: Press): Press => (e.key === " " ? { key: "Space", code: e.code, metaKey: e.metaKey, ctrlKey: e.ctrlKey, altKey: e.altKey, shiftKey: e.shiftKey } : e)
const matches = (row: TableKeyRow, e: Press, mac: boolean) => chordsOf(row).some((c) => chordMatches(named(e), c, mac))

/** Where a key event's target is, as the rows' `not` reads it. */
export function keyPlace(target: EventTarget | null): KeyPlace {
  const t = target as HTMLElement | null
  if (!t || typeof t.closest !== "function") return { field: false, editing: false, menu: false, dialog: false }
  const box = /^(INPUT|TEXTAREA)$/.test(t.tagName)
  // A read-only box (a grid's cell at rest, selected) has no text of its own to undo: the table's change is undone.
  const editing = t.isContentEditable || t.tagName === "SELECT" || (box && !(t as HTMLInputElement | HTMLTextAreaElement).readOnly)
  return { field: editing || box, editing, menu: !!t.closest("[data-radix-popper-content-wrapper]"), dialog: !!t.closest("[role=dialog]") }
}

/** The page's row a key press is, where it was pressed, if any: never one the grid's cell takes. */
export function tableKeyRow(e: Press, mac: boolean, place: KeyPlace): TableKeyRow | null {
  return (
    TABLE_KEYS.find((row) => row.command && !row.cell && onThis(row, mac) && !row.not?.some((p) => place[p]) && matches(row, e, mac)) ??
    null
  )
}

/** What a key asks of the grid's selected cell, if anything (Space, ⌘;). */
export function tableCellCommand(e: Press, mac: boolean): TableCommand | null {
  return TABLE_KEYS.find((row) => row.cell && matches(row, e, mac))?.command ?? null
}

/** A command's first chord on this computer, for a menu's or the palette's hint. */
export function tableKeyChord(command: TableCommand, mac: boolean): string | undefined {
  return TABLE_KEYS.find((row) => row.command === command && onThis(row, mac))?.keys
}

/** The table as the app's keys list shows it: its Tables group, one row for each thing a key does. */
export function tableShortcutRows(mac: boolean): { keys: string; does: string }[] {
  const rows: { keys: string; does: string }[] = []
  for (const row of TABLE_KEYS) {
    if (!onThis(row, mac)) continue
    const keys = rowWords(row)
    const same = rows.find((r) => r.does === row.label)
    if (same) same.keys = `${same.keys} or ${keys}`
    else rows.push({ keys, does: row.label })
  }
  return rows
}
