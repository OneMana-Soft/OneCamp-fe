"use client"

/**
 * A simple table's commands (docs programme B3), and its actions on the doc's
 * surfaces: Header row, Header column and Turn into database in the block
 * menu and the palette; adding and deleting rows and columns in the palette;
 * and Table on the phone's bar, which opens the table's sheet. They're
 * registered when table editing loads, which is when a doc first shows a
 * table, the only time they mean anything; each shows only while the caret
 * (or the block menu) is on a table.
 */

import type { Editor } from "@tiptap/core"
import { NodeSelection, TextSelection, type Command, type EditorState } from "@tiptap/pm/state"
import {
  CellSelection,
  TableMap,
  addColumnAfter,
  addColumnBefore,
  addRowAfter,
  addRowBefore,
  columnIsHeader,
  deleteCellSelection,
  deleteColumn,
  deleteRow,
  isInTable,
  mergeCells,
  moveTableColumn,
  moveTableRow,
  rowIsHeader,
  selectedRect,
  setCellAttr,
  splitCell,
  toggleHeader,
} from "@tiptap/pm/tables"
import { registerAction } from "@/components/docEditor/registry/registry"
import type { ActionContext } from "@/components/docEditor/registry/types"
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Database, PanelLeft, PanelTop, Table2, Trash2 } from "@/lib/icons"
import type { CellColour } from "./simpleTable"

/** The table a node selection or the caret is in, by position. */
export function tableAt(state: EditorState): number | null {
  const sel = state.selection
  if (sel instanceof NodeSelection && sel.node.type.name === "table") return sel.from
  const $from = sel.$from
  for (let d = $from.depth; d > 0; d--) if ($from.node(d).type.name === "table") return $from.before(d)
  return null
}

/** Moves the caret into a table selected as a block (the block menu selects it), so a command acts on it. */
function intoTable(editor: Editor): boolean {
  if (isInTable(editor.state)) return true
  const pos = tableAt(editor.state)
  if (pos == null) return false
  editor.view.dispatch(editor.state.tr.setSelection(TextSelection.near(editor.state.doc.resolve(pos + 3))))
  return isInTable(editor.state)
}

const run = (cmd: Command) => (editor: Editor) => intoTable(editor) && cmd(editor.state, editor.view.dispatch, editor.view)

/** The rows and columns the selection covers, and the table's size. */
export function tableWhere(editor: Editor) {
  if (!isInTable(editor.state)) return null
  const rect = selectedRect(editor.state)
  return { ...rect, rows: rect.map.height, cols: rect.map.width }
}

const move = (kind: "row" | "column", by: -1 | 1) => (editor: Editor) => {
  const w = tableWhere(editor)
  if (!w) return false
  const from = kind === "row" ? w.top : w.left
  const to = from + by
  if (to < 0 || to >= (kind === "row" ? w.rows : w.cols)) return false
  const cmd = kind === "row" ? moveTableRow({ from, to, pos: w.tableStart }) : moveTableColumn({ from, to, pos: w.tableStart })
  return cmd(editor.state, editor.view.dispatch, editor.view)
}

export const TABLE_COMMANDS = {
  rowAbove: run(addRowBefore),
  rowBelow: run(addRowAfter),
  colLeft: run(addColumnBefore),
  colRight: run(addColumnAfter),
  deleteRow: run(deleteRow),
  deleteColumn: run(deleteColumn),
  headerRow: run(toggleHeader("row")),
  headerColumn: run(toggleHeader("column")),
  merge: run(mergeCells),
  split: run(splitCell),
  clear: run(deleteCellSelection),
  rowUp: move("row", -1),
  rowDown: move("row", 1),
  colLeftward: move("column", -1),
  colRightward: move("column", 1),
}

/** Colours the selected cells (or the caret's), by name; null takes the colour off. */
export function colourCells(editor: Editor, colour: CellColour | null): boolean {
  return run(setCellAttr("background", colour))(editor)
}

/** Whether the table's first row, or first column, is its header. */
export function headerOn(editor: Editor, kind: "row" | "column"): boolean {
  const pos = tableAt(editor.state)
  const table = pos == null ? null : editor.state.doc.nodeAt(pos)
  if (!table) return false
  const map = TableMap.get(table)
  return kind === "row" ? rowIsHeader(map, table, 0) : columnIsHeader(map, table, 0)
}

/** Whether more than one cell is selected (Merge), or the caret's cell spans several (Split). */
export function canMerge(editor: Editor) {
  return editor.state.selection instanceof CellSelection && mergeCells(editor.state)
}
export function canSplit(editor: Editor) {
  return splitCell(editor.state)
}

const onTable = (ctx: ActionContext) => !!ctx.editor && tableAt(ctx.editor.state) != null
const canEdit = (ctx: ActionContext) => onTable(ctx) && ctx.canEdit

/** Turn into database: the rows become a OneCamp table, embedded where this one was. */
export async function toDatabase(editor: Editor) {
  const pos = tableAt(editor.state)
  if (pos == null) return
  const { turnIntoDatabase } = await import("./toDatabase")
  await turnIntoDatabase(editor, pos)
}

let registered = false

/** Registers the table's actions, once. */
export function registerTableActions() {
  if (registered) return
  registered = true
  const common = { group: "table", edition: "both" as const, isVisible: onTable, isEnabled: canEdit }
  registerAction({
    ...common,
    id: "table.headerRow",
    label: "Header row",
    icon: PanelTop,
    order: 10,
    surfaces: ["blockMenu", "palette"],
    isChecked: (ctx) => !!ctx.editor && headerOn(ctx.editor, "row"),
    run: (ctx) => void (ctx.editor && TABLE_COMMANDS.headerRow(ctx.editor)),
  })
  registerAction({
    ...common,
    id: "table.headerColumn",
    label: "Header column",
    icon: PanelLeft,
    order: 20,
    surfaces: ["blockMenu", "palette"],
    isChecked: (ctx) => !!ctx.editor && headerOn(ctx.editor, "column"),
    run: (ctx) => void (ctx.editor && TABLE_COMMANDS.headerColumn(ctx.editor)),
  })
  registerAction({
    ...common,
    id: "table.toDatabase",
    label: "Turn into database",
    description: "A OneCamp table with these rows, embedded here",
    aliases: ["database", "convert"],
    icon: Database,
    order: 30,
    surfaces: ["blockMenu", "palette"],
    run: (ctx) => (ctx.editor ? toDatabase(ctx.editor) : undefined),
  })
  const palette: Array<[string, string, keyof typeof TABLE_COMMANDS, typeof ArrowUp]> = [
    ["table.rowAbove", "Insert a row above", "rowAbove", ArrowUp],
    ["table.rowBelow", "Insert a row below", "rowBelow", ArrowDown],
    ["table.colLeft", "Insert a column to the left", "colLeft", ArrowLeft],
    ["table.colRight", "Insert a column to the right", "colRight", ArrowRight],
    ["table.deleteRow", "Delete the row", "deleteRow", Trash2],
    ["table.deleteColumn", "Delete the column", "deleteColumn", Trash2],
  ]
  palette.forEach(([id, label, cmd, icon], i) =>
    registerAction({ ...common, id, label, icon, order: 40 + i, surfaces: ["palette"], run: (ctx) => void (ctx.editor && TABLE_COMMANDS[cmd](ctx.editor)) }),
  )
  // The phone has no handles to hover: its bar opens the table's sheet.
  registerAction({
    ...common,
    id: "table.options",
    label: "Table",
    icon: Table2,
    order: 10,
    surfaces: ["phoneBar"],
    run: async (ctx) => {
      if (!ctx.editor) return
      const { openTableMenu } = await import("./TableMenu")
      openTableMenu({ editor: ctx.editor, kind: "table" })
    },
  })
}
