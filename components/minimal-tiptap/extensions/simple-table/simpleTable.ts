"use client"

/**
 * The simple table (docs programme B3, editor.md P1-3): a grid of text in the
 * doc, beside the database a /table embeds. Tiptap's node names, attributes
 * and HTML (table, tableRow, tableHeader, tableCell; colspan, rowspan,
 * colwidth), so pasted tables, the collaboration service and the codec read
 * it as they read Tiptap's. A cell's colour is stored by name (`background`,
 * data-background="sky"), as every doc colour is (N15).
 *
 * Only what the editor needs to hold a table loads with the doc's editor:
 * these nodes, a table drawn in plain DOM (I20) with its column widths, its
 * add-a-row and add-a-column buttons, and Tab between cells. Editing it
 * (prosemirror-tables: cell selection, resizing, the row and column handles
 * and menus) loads the first time a doc holds a table (tableEditing.ts).
 */

import { Extension, Node, callOrReturn, getExtensionField, mergeAttributes, type Editor } from "@tiptap/core"
import type { Node as PMNode, ResolvedPos } from "@tiptap/pm/model"
import { TextSelection, type EditorState } from "@tiptap/pm/state"
import type { NodeView, ViewMutationRecord } from "@tiptap/pm/view"
import { glyph } from "@/components/docEditor/technical/glyphs"
import { isDocColour, type DocColour } from "@/lib/docColours"
import type { TableEditingApi } from "./tableEditing"
import { TABLE_EDITING } from "@/components/docEditor/technical/onDemandIds"
import { onDemandApi, withOnDemand } from "@/components/docEditor/registry/onDemand"

declare module "@tiptap/core" {
  interface NodeConfig<Options, Storage> {
    /** prosemirror-tables' role for the node. */
    tableRole?: string | ((this: { name: string; options: Options; storage: Storage }) => string)
  }
}

/** A cell's colour is one of the doc's colours, by name (B2's lib/docColours.ts). */
export type CellColour = DocColour

/** A column with no width of its own is at least this wide (px). */
export const CELL_MIN_WIDTH = 120

const cellAttributes = {
  colspan: { default: 1 },
  rowspan: { default: 1 },
  colwidth: {
    default: null,
    parseHTML: (el: HTMLElement) => {
      const w = el.getAttribute("colwidth")
      const widths = w ? w.split(",").map((x) => parseInt(x, 10)) : null
      return widths && widths.every((x) => x > 0) ? widths : null
    },
  },
  background: {
    default: null,
    parseHTML: (el: HTMLElement) => {
      const v = el.getAttribute("data-background")
      return isDocColour(v) ? v : null
    },
    renderHTML: (attrs: Record<string, unknown>) => (attrs.background ? { "data-background": attrs.background } : {}),
  },
}

/**
 * The table's columns as its first row has them: each column's width, or
 * none; and the table's width when every column has one, else its least.
 */
function updateColumns(node: PMNode, colgroup: HTMLElement, table: HTMLElement, minWidth = CELL_MIN_WIDTH): boolean {
  let total = 0
  let fixed = true
  let next = colgroup.firstChild as HTMLElement | null
  const row = node.firstChild
  if (!row) return false
  for (let i = 0; i < row.childCount; i++) {
    const { colspan, colwidth } = row.child(i).attrs as { colspan: number; colwidth: number[] | null }
    for (let j = 0; j < colspan; j++) {
      const w = colwidth?.[j]
      const css = w ? `${w}px` : ""
      total += w || minWidth
      if (!w) fixed = false
      if (!next) colgroup.appendChild(document.createElement("col")).style.width = css
      else {
        if (next.style.width !== css) next.style.width = css
        next = next.nextSibling as HTMLElement | null
      }
    }
  }
  while (next) {
    const after = next.nextSibling as HTMLElement | null
    next.remove()
    next = after
  }
  // Written only when they change: this runs as each key is typed in a cell.
  const cssWidth = fixed ? `${total}px` : ""
  const cssMin = fixed ? "" : `${total}px`
  if (table.style.width !== cssWidth) table.style.width = cssWidth
  if (table.style.minWidth !== cssMin) table.style.minWidth = cssMin
  return fixed
}

/** What a table's view hands its editor's table editing (tableEditing.ts). */
export interface TableViewParts {
  dom: HTMLElement
  frame: HTMLElement
  table: HTMLTableElement
  editor: Editor
  getPos(): number | undefined
}

/**
 * Does fn with the editor's table editing: at once when it's here, else as
 * soon as the doc's first table has fetched it (registry/onDemand.ts). An
 * action fetches it itself, if nothing has, and does nothing offline or just
 * after a failed fetch; a view (fetch false) waits.
 * Nothing on a page that only reads, such as the guest's, made without it.
 * Returns a way to stop waiting.
 */
export function withEditing(editor: Editor, fn: (editing: TableEditingApi) => void, fetch = true): () => void {
  return withOnDemand<TableEditingApi>(editor, TABLE_EDITING, fn, fetch)
}

/** The table, drawn as prosemirror-tables' TableView draws it (a <colgroup> first), with the buttons that add a row and a column. */
class TableView implements NodeView {
  dom: HTMLElement
  contentDOM: HTMLElement
  private readonly frame: HTMLElement
  private readonly table: HTMLTableElement
  private readonly colgroup: HTMLElement
  private readonly controls: HTMLElement[] = []
  private detach: (() => void) | null = null
  private stopWaiting: () => void = () => {}

  constructor(
    private node: PMNode,
    private readonly editor: Editor,
    private readonly getPos: () => number | undefined,
  ) {
    this.dom = document.createElement("div")
    this.dom.className = "tableWrapper doc-table"
    this.frame = this.dom.appendChild(document.createElement("div"))
    this.frame.className = "doc-table-frame"
    const scroll = this.frame.appendChild(document.createElement("div"))
    scroll.className = "doc-table-scroll"
    this.table = scroll.appendChild(document.createElement("table"))
    this.colgroup = this.table.appendChild(document.createElement("colgroup"))
    this.contentDOM = this.table.appendChild(document.createElement("tbody"))
    if (editor.isEditable) {
      for (const [side, label] of [
        ["row", "Add a row"],
        ["column", "Add a column"],
      ] as const) {
        const b = this.frame.appendChild(document.createElement("button"))
        b.type = "button"
        b.className = `doc-table-add doc-table-add-${side}`
        b.contentEditable = "false"
        b.setAttribute("aria-label", label)
        b.title = label
        b.append(glyph("plus", 14))
        b.addEventListener("mousedown", (e) => e.preventDefault())
        b.addEventListener("click", () => void withEditing(editor, (editing) => editing.addAtEnd(editor, this.getPos(), side)))
        this.controls.push(b)
      }
    }
    this.layout()
    // The editor's table editing draws its handles on this view, once the
    // doc's tables have fetched it.
    if (editor.isEditable)
      this.stopWaiting = withEditing(
        editor,
        (editing) => {
          this.detach = editing.decorate(this.parts())
        },
        false,
      )
  }

  parts(): TableViewParts {
    return { dom: this.dom, frame: this.frame, table: this.table, editor: this.editor, getPos: this.getPos }
  }

  private layout() {
    this.dom.toggleAttribute("data-fixed", updateColumns(this.node, this.colgroup, this.table))
  }

  update(node: PMNode): boolean {
    if (node.type !== this.node.type) return false
    this.node = node
    this.layout()
    return true
  }

  stopEvent(event: Event): boolean {
    const t = event.target as HTMLElement | null
    return !!t && this.controls.some((c) => c.contains(t))
  }

  ignoreMutation(record: ViewMutationRecord): boolean {
    if (record.type === "attributes" && (record.target === this.table || this.colgroup.contains(record.target))) return true
    return !this.contentDOM.contains(record.target) && record.target !== this.contentDOM
  }

  destroy() {
    this.stopWaiting()
    this.detach?.()
  }
}

export const Table = Node.create({
  name: "table",
  group: "block",
  content: "tableRow+",
  isolating: true,
  allowGapCursor: false,
  tableRole: "table",
  parseHTML: () => [{ tag: "table" }],
  renderHTML({ node, HTMLAttributes }) {
    // The columns' widths travel with the HTML, as Tiptap writes them.
    const cols: Array<[string, Record<string, string>]> = []
    const row = node.firstChild
    for (let i = 0; row && i < row.childCount; i++) {
      const { colspan, colwidth } = row.child(i).attrs as { colspan: number; colwidth: number[] | null }
      for (let j = 0; j < colspan; j++) cols.push(["col", colwidth?.[j] ? { style: `width: ${colwidth[j]}px` } : {}])
    }
    return ["table", mergeAttributes(HTMLAttributes), ["colgroup", {}, ...cols], ["tbody", 0]]
  },
  addNodeView() {
    return ({ node, editor, getPos }) => new TableView(node, editor, () => (typeof getPos === "function" ? getPos() : undefined))
  },
})

export const TableRow = Node.create({
  name: "tableRow",
  content: "(tableCell | tableHeader)*",
  tableRole: "row",
  parseHTML: () => [{ tag: "tr" }],
  renderHTML: ({ HTMLAttributes }) => ["tr", mergeAttributes(HTMLAttributes), 0],
})

const TableHeader = Node.create({
  name: "tableHeader",
  content: "block+",
  isolating: true,
  tableRole: "header_cell",
  addAttributes: () => cellAttributes,
  parseHTML: () => [{ tag: "th" }],
  renderHTML: ({ HTMLAttributes }) => ["th", mergeAttributes(HTMLAttributes), 0],
})

const TableCell = Node.create({
  name: "tableCell",
  content: "block+",
  isolating: true,
  tableRole: "cell",
  addAttributes: () => cellAttributes,
  parseHTML: () => [{ tag: "td" }],
  renderHTML: ({ HTMLAttributes }) => ["td", mergeAttributes(HTMLAttributes), 0],
})

/** The cell the caret is in (the position before it), when it is plainly in one: not in a list or code in it, which keep their own Tab. */
function plainCell(state: EditorState): ResolvedPos | null {
  const { $from } = state.selection
  for (let d = $from.depth; d > 0; d--) {
    const n = $from.node(d).type
    if (n.spec.code || n.name === "listItem" || n.name === "taskItem") return null
    if (n.name === "tableCell" || n.name === "tableHeader") return state.doc.resolve($from.before(d))
  }
  return null
}

/**
 * The cell after $cell's (dir 1) or before it (-1), in reading order: the
 * position before it, or null past the table's last cell or first. Read as
 * prosemirror-tables' findNextCell reads it, from the doc alone.
 */
function cellBeside($cell: ResolvedPos, dir: 1 | -1): number | null {
  const table = $cell.node(-1)
  if (dir > 0) {
    if ($cell.index() < $cell.parent.childCount - 1) return $cell.pos + $cell.nodeAfter!.nodeSize
    for (let row = $cell.indexAfter(-1), start = $cell.after(); row < table.childCount; row++) {
      if (table.child(row).childCount) return start + 1
      start += table.child(row).nodeSize
    }
  } else {
    if ($cell.nodeBefore) return $cell.pos - $cell.nodeBefore.nodeSize
    for (let row = $cell.index(-1) - 1, end = $cell.before(); row >= 0; row--) {
      const last = table.child(row).lastChild
      if (last) return end - 1 - last.nodeSize
      end -= table.child(row).nodeSize
    }
  }
  return null
}

/**
 * The table's keys and its roles. Tab moves to the next cell (a new row
 * after the last), ⇧Tab to the one before. Above the doc's Tab (150) and
 * nesting (160), which would indent the cell's line instead; Escape, then
 * Tab still leaves the text.
 *
 * Moving between cells needs only the doc. The row after the last cell comes
 * from the editor's table editing, which the doc page's editor is made with
 * (technical/register.ts). Tab once waited for it to load, after a table
 * first showed: a Tab pressed as a new table appeared did nothing, and what
 * was typed next went into the cell it left ("StepOwner").
 */
const TableKeys = Extension.create({
  name: "simpleTableKeys",
  priority: 170,

  extendNodeSchema(extension) {
    const ctx = { name: extension.name, options: extension.options, storage: extension.storage }
    return { tableRole: callOrReturn(getExtensionField(extension, "tableRole", ctx)) }
  },

  addKeyboardShortcuts() {
    const editor = this.editor
    const move = (dir: 1 | -1) => () => {
      const leaving = (editor.storage.docKeymap as { tabLeaves?: boolean } | undefined)?.tabLeaves
      const { state, view } = editor
      const $cell = leaving ? null : plainCell(state)
      if (!$cell) return false
      const beside = cellBeside($cell, dir)
      if (beside != null) {
        // The cell's text, chosen, as prosemirror-tables' goToNextCell chooses it.
        const $next = state.doc.resolve(beside)
        view.dispatch(state.tr.setSelection(TextSelection.between($next, state.doc.resolve(beside + $next.nodeAfter!.nodeSize))).scrollIntoView())
      } else if (dir > 0) {
        // Past the last cell: a row below, as + under the table adds one
        // (once table editing is here, to the table the caret is in then).
        withEditing(editor, (editing) => editing.addAtEnd(editor, tableAtCaret(editor), "row"))
      }
      return true
    }
    // ⌫ or Delete over every cell: the table goes, as in Notion. Here, ahead
    // of the keys that would empty the cells instead (Tiptap's own, and table
    // editing's); a cell selection is only ever table editing's.
    const whole = () => onDemandApi<TableEditingApi>(editor, TABLE_EDITING)?.deleteWholeTable(editor) ?? false
    return { Tab: move(1), "Shift-Tab": move(-1), Backspace: whole, Delete: whole }
  },
})

export const SIMPLE_TABLE = [Table, TableRow, TableHeader, TableCell, TableKeys]

/** Where the table holding the caret starts, if one does. */
function tableAtCaret(editor: Editor): number | undefined {
  const { $from } = editor.state.selection
  for (let d = $from.depth; d > 0; d--) if ($from.node(d).type.name === "table") return $from.before(d)
  return undefined
}

/** "/" Simple table: three by three, its first row a header. */
export function insertSimpleTable(editor: Editor, range: { from: number; to: number }) {
  const { schema } = editor
  const cell = (type: string) => schema.nodes[type].create(null, schema.nodes.paragraph.create())
  const rows = [0, 1, 2].map((r) => schema.nodes.tableRow.create(null, [0, 1, 2].map(() => cell(r === 0 ? "tableHeader" : "tableCell"))))
  const table = schema.nodes.table.create(null, rows)
  editor.chain().focus().deleteRange(range).insertContent(table.toJSON()).run()
  // The caret goes to the first cell.
  const { doc } = editor.state
  let at = -1
  doc.nodesBetween(Math.max(0, range.from - 1), Math.min(doc.content.size, range.from + table.nodeSize + 2), (n, pos) => {
    if (at < 0 && n.type.name === "tableHeader") at = pos + 2
    return at < 0
  })
  if (at > 0) editor.commands.setTextSelection(at)
}
