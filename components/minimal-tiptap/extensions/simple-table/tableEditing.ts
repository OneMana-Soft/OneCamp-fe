"use client"

/**
 * Editing a simple table (docs programme B3, editor.md P1-3): prosemirror-
 * tables' cell selection, column resizing and commands; adding a row or a
 * column at the end (the + under or beside the table, and Tab in its last
 * cell); the row and column handles, with their menus (TableMenu.tsx);
 * and the table's actions for the block menu, the palette and the phone's
 * bar (tableActions.ts). Its own chunk, on demand (technical/register.ts,
 * registry/onDemand.ts): the doc page's editor is made with stand-ins for its
 * plugins and fetches it the first time the doc holds a table (a doc whose
 * saved copy holds one waits for it before it is built). It is never added to
 * an open editor: that makes every plugin view again (an open menu closes, a
 * flash is lost).
 *
 * prosemirror-tables repairs a table a change left uneven. It does so only
 * for this tab's own changes, never another person's (I6): two tabs repairing
 * the same table at once would each add the missing cells.
 */

import type { Editor } from "@tiptap/core"
import { TextSelection, type EditorState, type Transaction } from "@tiptap/pm/state"
import {
  CellSelection,
  TableMap,
  addColumn,
  addRow,
  cellAround,
  columnResizing,
  deleteTable,
  tableEditing,
  type TableRect,
} from "@tiptap/pm/tables"
import { isRemote } from "@/components/minimal-tiptap/extensions/block-id/blockId"
import type { OnDemandChunk } from "@/components/docEditor/registry/onDemand"
import { glyph } from "@/components/docEditor/technical/glyphs"
import { CELL_MIN_WIDTH, type TableViewParts } from "./simpleTable"
import { registerTableActions } from "./tableActions"

export { tableAt } from "./tableActions"

registerTableActions()

/** Whether every cell of a table is selected (⌫ then deletes the table, as in Notion). */
function allCellsSelected(state: EditorState): boolean {
  const sel = state.selection
  if (!(sel instanceof CellSelection)) return false
  const map = TableMap.get(sel.$anchorCell.node(-1))
  const cells = new Set<number>()
  sel.forEachCell((_n, pos) => void cells.add(pos))
  return cells.size === new Set(map.map).size
}

/** What a table's view and keys ask of their editor's table editing (simpleTable.ts, through registry/onDemand.ts). */
export interface TableEditingApi {
  decorate(parts: TableViewParts): () => void
  addAtEnd(editor: Editor, tablePos: number | undefined, side: "row" | "column"): void
  /** ⌫ or Delete with every cell of a table selected: the table goes, as the block menu's Delete takes it. */
  deleteWholeTable(editor: Editor): boolean
}

/**
 * A doc page's table editing: its two plugins, which the stand-ins its
 * editor is made with take on once the doc holds a table (the block declares
 * two, and the DOM events they hear: technical/register.ts). Last of the
 * editor's plugins (the block's priority): every other plugin's keys and paste
 * go first. Its api is what a table's view and keys do with it; the keys that
 * take a whole table away are the table's own (simpleTable.ts TableKeys), as
 * they must run before anything empties the cells instead.
 */
export const tableEditingChunk: OnDemandChunk<TableEditingApi> = {
  plugins: () => {
    const editingPlugin = tableEditing({ allowTableNodeSelection: false })
    const repair = editingPlugin.spec.appendTransaction
    editingPlugin.spec.appendTransaction = (trs: readonly Transaction[], before: EditorState, after: EditorState) =>
      trs.some(isRemote) ? null : repair?.call(editingPlugin, trs, before, after)
    return [columnResizing({ handleWidth: 6, cellMinWidth: 48, defaultCellMinWidth: CELL_MIN_WIDTH, View: null }), editingPlugin]
  },
  api: { decorate, addAtEnd, deleteWholeTable: (editor) => allCellsSelected(editor.state) && deleteTable(editor.state, editor.view.dispatch) },
}

/** The table holding a position, as prosemirror-tables' commands take it. */
function rectOf(state: EditorState, tablePos: number): TableRect | null {
  const table = state.doc.nodeAt(tablePos)
  if (!table || table.type.name !== "table") return null
  const map = TableMap.get(table)
  return { map, table, tableStart: tablePos + 1, left: 0, top: 0, right: map.width, bottom: map.height }
}

/** The caret goes into a cell: at the start of its text. */
function caretInCell(tr: Transaction, tableStart: number, map: TableMap, row: number, col: number) {
  const cellPos = tableStart + map.map[row * map.width + col]
  tr.setSelection(TextSelection.near(tr.doc.resolve(cellPos + 1)))
}

/** The + under the table, or beside it (and Tab in its last cell): a row at the bottom, or a column at the right, and the caret in its first cell. */
export function addAtEnd(editor: Editor, tablePos: number | undefined, side: "row" | "column") {
  if (tablePos == null || !editor.isEditable) return
  const rect = rectOf(editor.state, tablePos)
  if (!rect) return
  const tr = side === "row" ? addRow(editor.state.tr, rect, rect.map.height) : addColumn(editor.state.tr, rect, rect.map.width)
  const map = TableMap.get(tr.doc.nodeAt(tablePos)!)
  caretInCell(tr, rect.tableStart, map, side === "row" ? map.height - 1 : 0, side === "row" ? 0 : map.width - 1)
  editor.view.dispatch(tr.scrollIntoView())
  editor.view.focus()
}

/** Where a cell's element sits in its table: its row and column, and the table's position. */
function cellIndex(editor: Editor, cell: Element): { row: number; col: number; tablePos: number } | null {
  let pos: number
  try {
    pos = editor.view.posAtDOM(cell, 0)
  } catch {
    return null
  }
  const $cell = cellAround(editor.state.doc.resolve(pos))
  if (!$cell) return null
  const tableStart = $cell.start(-1)
  const map = TableMap.get($cell.node(-1))
  const rect = map.findCell($cell.pos - tableStart)
  return { row: rect.top, col: rect.left, tablePos: tableStart - 1 }
}

/** Selects a whole row or column (what its menu then acts on). */
function selectLine(editor: Editor, tablePos: number, kind: "row" | "column", index: number) {
  const rect = rectOf(editor.state, tablePos)
  if (!rect) return
  const { map, tableStart } = rect
  const first = kind === "row" ? index * map.width : index
  const last = kind === "row" ? index * map.width + map.width - 1 : (map.height - 1) * map.width + index
  const $a = editor.state.doc.resolve(tableStart + map.map[first])
  const $b = editor.state.doc.resolve(tableStart + map.map[last])
  const sel = kind === "row" ? CellSelection.rowSelection($a, $b) : CellSelection.colSelection($a, $b)
  editor.view.dispatch(editor.state.tr.setSelection(sel))
}

function grip(label: string, icon: "grip" | "gripHorizontal", kind: string): HTMLButtonElement {
  const b = document.createElement("button")
  b.type = "button"
  b.className = `doc-table-grip doc-table-grip-${kind}`
  b.contentEditable = "false"
  b.hidden = true
  b.setAttribute("aria-label", label)
  b.setAttribute("aria-haspopup", "menu")
  b.append(glyph(icon, 14))
  b.addEventListener("mousedown", (e) => e.preventDefault())
  return b
}

/**
 * A table's row and column handles: over the left edge of the row and the
 * top edge of the column under the pointer, or of the caret's cell. A click
 * selects that row or column and opens its menu. Placed when the pointer or
 * the caret moves to another cell, never as you type in one.
 */
export function decorate(p: TableViewParts): () => void {
  const { editor, frame, table } = p
  const rowGrip = frame.appendChild(grip("Row options", "grip", "row"))
  const colGrip = frame.appendChild(grip("Column options", "gripHorizontal", "column"))
  let cell: HTMLElement | null = null
  let pointerCell: HTMLElement | null = null
  let scheduled = 0
  let hideTimer: ReturnType<typeof setTimeout> | null = null

  const place = () => {
    scheduled = 0
    const showing = pointerCell ?? cell
    if (!showing || !showing.isConnected || !editor.isEditable) {
      rowGrip.hidden = colGrip.hidden = true
      return
    }
    const f = frame.getBoundingClientRect()
    const c = showing.getBoundingClientRect()
    const t = table.getBoundingClientRect()
    rowGrip.style.transform = `translate(${t.left - f.left - 9}px, ${c.top - f.top + c.height / 2 - 12}px)`
    colGrip.style.transform = `translate(${c.left - f.left + c.width / 2 - 12}px, ${t.top - f.top - 9}px)`
    rowGrip.hidden = colGrip.hidden = false
  }
  const schedule = () => {
    if (!scheduled) scheduled = requestAnimationFrame(place)
  }

  const onMove = (e: PointerEvent) => {
    if (e.pointerType !== "mouse") return
    const over = (e.target as Element | null)?.closest?.("td, th") as HTMLElement | null
    if (hideTimer) clearTimeout(hideTimer)
    hideTimer = null
    if (over && table.contains(over) && over !== pointerCell) {
      pointerCell = over
      schedule()
    }
  }
  const onLeave = () => {
    // A short grace, so the pointer can travel from a cell to its handle.
    hideTimer = setTimeout(() => {
      pointerCell = null
      schedule()
    }, 300)
  }
  const onEnterGrip = () => {
    if (hideTimer) clearTimeout(hideTimer)
    hideTimer = null
  }

  // The caret's cell, when it moves to another one.
  let caretCellPos = -1
  const onSelection = () => {
    const tablePos = p.getPos()
    const { $from } = editor.state.selection
    let at = -1
    if (tablePos != null && $from.pos > tablePos && $from.pos < tablePos + (editor.state.doc.nodeAt(tablePos)?.nodeSize ?? 0)) {
      const $cell = cellAround($from)
      if ($cell) at = $cell.pos
    }
    if (at === caretCellPos) return
    caretCellPos = at
    const dom = at >= 0 ? editor.view.nodeDOM(at) : null
    cell = dom instanceof HTMLElement ? dom : null
    schedule()
  }

  const open = async (kind: "row" | "column", keyboard: boolean) => {
    const showing = pointerCell ?? cell
    if (!showing) return
    const at = cellIndex(editor, showing)
    if (!at) return
    selectLine(editor, at.tablePos, kind, kind === "row" ? at.row : at.col)
    const { openTableMenu } = await import("./TableMenu")
    openTableMenu({ editor, anchor: kind === "row" ? rowGrip : colGrip, kind, keyboard })
  }
  // A click from Enter or Space has no detail: the menu then opens on its first item.
  rowGrip.addEventListener("click", (e) => void open("row", e.detail === 0))
  colGrip.addEventListener("click", (e) => void open("column", e.detail === 0))
  rowGrip.addEventListener("pointerenter", onEnterGrip)
  colGrip.addEventListener("pointerenter", onEnterGrip)

  frame.addEventListener("pointermove", onMove)
  frame.addEventListener("pointerleave", onLeave)
  editor.on("selectionUpdate", onSelection)
  editor.on("focus", onSelection)
  onSelection()

  return () => {
    frame.removeEventListener("pointermove", onMove)
    frame.removeEventListener("pointerleave", onLeave)
    editor.off("selectionUpdate", onSelection)
    editor.off("focus", onSelection)
    if (scheduled) cancelAnimationFrame(scheduled)
    if (hideTimer) clearTimeout(hideTimer)
    rowGrip.remove()
    colGrip.remove()
  }
}
