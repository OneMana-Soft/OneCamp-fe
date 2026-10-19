"use client"

import { Node, combineTransactionSteps, getChangedRanges, mergeAttributes, type Editor } from "@tiptap/core"
import { Fragment, type Node as PMNode } from "@tiptap/pm/model"
import { Plugin, PluginKey, TextSelection, type EditorState, type Transaction } from "@tiptap/pm/state"

import { COLUMN, COLUMN_LIST, MAX_COLUMNS } from "../block-commands/nodes"
import { isRemote } from "../block-id/blockId"
import { onEscape } from "@/lib/keys/onEscape"

/**
 * COLUMNS (B1; editor.md P1-14). A row (`columnList`) of 2–4 columns, each
 * holding blocks. Made by dragging a block beside another (the drop's right
 * or left fifth) or from "/" (2, 3 or 4 columns); widened by the grip between
 * two columns; stacked one above the other where the doc is narrower than
 * 768 px (index.css, a container query on the doc's pane).
 *
 * A column's width is a whole percent of its row (`width`, null for an equal
 * share); a row's columns are all set or all equal. The column is drawn as
 * plain DOM (no React), with its grip outside the text.
 *
 * A row left with one column (its others dragged or deleted away) gives its
 * blocks back to the doc in the same change, in this tab's own changes only
 * (I6). The schema is permissive (`column+`, `block+`): a collaborator's
 * change that leaves one column is never thrown away for not fitting.
 */

/** The narrowest a column may be dragged to, in percent of its row. */
const MIN_WIDTH = 10

/** A width from HTML: a whole percent, or null (an equal share). */
export function parseWidth(raw: string | null | undefined): number | null {
  if (raw == null || !/^\s*\d+\s*$/.test(raw)) return null
  const n = parseInt(raw, 10)
  return n >= 1 && n <= 99 ? n : null
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    columns: {
      /** A row of n empty columns (2–4) where the selection is, the caret in the first. */
      insertColumns: (count: number) => ReturnType
    }
  }
}

/** A row of columns, each holding these blocks (equal widths). */
export function rowOf(state: EditorState, columns: Fragment[]): PMNode {
  const { columnList, column } = state.schema.nodes
  return columnList.create(null, columns.map((c) => column.create(null, c)))
}

/**
 * Whole-percent widths for a row's columns from their drawn widths, summing
 * to 100, none under MIN_WIDTH. Pure.
 */
export function percentWidths(px: number[]): number[] {
  if (!px.length) return []
  const drawn = px.map((w) => (Number.isFinite(w) && w > 0 ? w : 0))
  // A column drawn narrower than the least is held at it; the others share
  // what is left by their widths, until none falls under. (A row of more
  // than ten, which only a crafted doc has, shares equally.)
  const least = Math.min(MIN_WIDTH, 100 / drawn.length)
  const held = new Set<number>()
  let shares: number[] = []
  for (;;) {
    const free = drawn.reduce((a, w, i) => (held.has(i) ? a : a + w), 0)
    const room = 100 - held.size * least
    const open = drawn.length - held.size
    shares = drawn.map((w, i) => (held.has(i) ? least : free > 0 ? (w / free) * room : room / open))
    const under = shares.findIndex((s, i) => !held.has(i) && s < least)
    if (under < 0) break
    held.add(under)
  }
  // Whole percents: each rounded down, the percents left over going to the
  // largest remainders, so the row sums to 100 and none drops under the least.
  const out = shares.map((s) => Math.floor(s + 1e-9))
  let left = 100 - out.reduce((a, b) => a + b, 0)
  const order = shares.map((s, i) => ({ i, rest: s - out[i] })).sort((a, b) => b.rest - a.rest)
  for (const { i } of order) {
    if (left <= 0) break
    out[i]++
    left--
  }
  return out
}

/** Sets every column of the row at rowPos to these widths (null: equal shares). */
export function setRowWidths(tr: Transaction, rowPos: number, widths: Array<number | null>): Transaction {
  const row = tr.doc.nodeAt(rowPos)
  if (!row || row.type.name !== COLUMN_LIST) return tr
  let pos = rowPos + 1
  row.forEach((col, _o, i) => {
    const width = widths[i] ?? null
    if (col.attrs.width !== width) tr.setNodeMarkup(pos, undefined, { ...col.attrs, width })
    pos += col.nodeSize
  })
  return tr
}

/** The grip between a column and the next: dragging it moves width from one to the other. */
function startResize(event: PointerEvent, editor: Editor, getPos: () => number | undefined, dom: HTMLElement) {
  if (event.button !== 0 || !editor.isEditable) return
  const row = dom.parentElement
  const cols = row ? (Array.from(row.children).filter((c) => (c as HTMLElement).dataset.type === COLUMN) as HTMLElement[]) : []
  const i = cols.indexOf(dom)
  if (i < 0 || i >= cols.length - 1) return
  event.preventDefault()
  event.stopPropagation()
  const grip = event.currentTarget as HTMLElement
  grip.setPointerCapture?.(event.pointerId)
  const start = cols.map((c) => c.getBoundingClientRect().width)
  const before = cols.map((c) => c.style.flexGrow)
  const total = start[i] + start[i + 1]
  const min = (start.reduce((a, b) => a + b, 0) * MIN_WIDTH) / 100
  const x0 = event.clientX
  let widths = start
  // Marked on the column's own element, which its view keeps: a mark on the
  // row (ProseMirror's own DOM) reads as an edit, and the row is drawn anew
  // under the pointer, its grip and the resize with it.
  dom.setAttribute("data-resizing", "")
  const move = (e: PointerEvent) => {
    // In a right-to-left row the grip sits on the other side.
    const dx = (getComputedStyle(row!).direction === "rtl" ? -1 : 1) * (e.clientX - x0)
    const left = Math.max(min, Math.min(total - min, start[i] + dx))
    widths = start.map((w, k) => (k === i ? left : k === i + 1 ? total - left : w))
    cols.forEach((c, k) => (c.style.flexGrow = String(widths[k])))
  }
  const end = (commit: boolean) => {
    grip.removeEventListener("pointermove", move)
    grip.removeEventListener("pointerup", up)
    grip.removeEventListener("pointercancel", cancel)
    stopEscape()
    dom.removeAttribute("data-resizing")
    const pos = getPos()
    if (!commit || pos === undefined || widths === start) {
      cols.forEach((c, k) => (c.style.flexGrow = before[k]))
      return
    }
    const rowPos = editor.state.doc.resolve(pos).before()
    editor.view.dispatch(setRowWidths(editor.state.tr, rowPos, percentWidths(widths)))
  }
  const up = () => end(true)
  const cancel = () => end(false)
  // Esc puts the widths back: the drag layer of the one Escape (lib/keys/escape).
  const stopEscape = onEscape("drag", () => end(false))
  grip.addEventListener("pointermove", move)
  grip.addEventListener("pointerup", up)
  grip.addEventListener("pointercancel", cancel)
}

export const Column = Node.create({
  name: COLUMN,
  content: "block+",
  isolating: true,
  defining: true,

  addAttributes() {
    return {
      width: {
        default: null,
        parseHTML: (el: HTMLElement) => parseWidth(el.getAttribute("data-width")),
        renderHTML: (attrs: Record<string, unknown>) => (typeof attrs.width === "number" ? { "data-width": String(attrs.width) } : {}),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-type="column"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes({ "data-type": COLUMN }, HTMLAttributes), 0]
  },

  addNodeView() {
    return ({ node, getPos, editor }) => {
      const dom = document.createElement("div")
      dom.dataset.type = COLUMN
      const body = document.createElement("div")
      body.className = "doc-column-body"
      const grip = document.createElement("div")
      grip.className = "doc-column-grip"
      grip.setAttribute("contenteditable", "false")
      grip.title = "Drag to resize. Double-click to even the columns"
      // A separator the keyboard can take too: ← and → move a twentieth.
      grip.tabIndex = 0
      grip.setAttribute("role", "separator")
      grip.setAttribute("aria-orientation", "vertical")
      grip.setAttribute("aria-label", "Column width")
      grip.setAttribute("aria-valuemin", String(MIN_WIDTH))
      grip.setAttribute("aria-valuemax", String(100 - MIN_WIDTH))
      dom.append(body, grip)
      const draw = (n: PMNode) => {
        const id = n.attrs.blockId
        if (id) dom.dataset.blockId = String(id)
        else delete dom.dataset.blockId
        if (typeof n.attrs.width === "number") {
          dom.dataset.width = String(n.attrs.width)
          dom.style.flexGrow = String(n.attrs.width)
        } else {
          delete dom.dataset.width
          dom.style.flexGrow = ""
        }
      }
      draw(node)
      /** The row's columns as whole percents, an equal share where none is set. */
      const shares = () => {
        const pos = (getPos as () => number | undefined)()
        if (pos === undefined) return null
        const $p = editor.state.doc.resolve(pos)
        const row = $p.parent
        if (row.type.name !== COLUMN_LIST) return null
        const all = Array.from({ length: row.childCount }, (_, k) => (row.child(k).attrs.width as number | null) ?? 100 / row.childCount)
        return { rowPos: $p.before(), index: $p.index(), all }
      }
      const valueNow = () => {
        const s = shares()
        if (s) grip.setAttribute("aria-valuenow", String(Math.round(s.all[s.index])))
      }
      grip.addEventListener("focus", valueNow)
      grip.addEventListener("keydown", (e) => {
        if ((e.key !== "ArrowLeft" && e.key !== "ArrowRight") || !editor.isEditable) return
        const s = shares()
        if (!s || s.index >= s.all.length - 1) return
        e.preventDefault()
        const rtl = getComputedStyle(dom).direction === "rtl"
        const step = (e.key === "ArrowRight") !== rtl ? 5 : -5
        const pair = s.all[s.index] + s.all[s.index + 1]
        const mine = Math.max(MIN_WIDTH, Math.min(pair - MIN_WIDTH, s.all[s.index] + step))
        const next = s.all.map((w, k) => (k === s.index ? mine : k === s.index + 1 ? pair - mine : w))
        editor.view.dispatch(setRowWidths(editor.state.tr, s.rowPos, percentWidths(next)))
        // The grip as drawn now (a column given its id in the same change is
        // drawn anew): it says its value, and keeps the keyboard.
        const row = editor.state.doc.nodeAt(s.rowPos)
        let at = s.rowPos + 1
        for (let k = 0; row && k < s.index; k++) at += row.child(k).nodeSize
        const now = ((editor.view.nodeDOM(at) as HTMLElement | null)?.querySelector(":scope > .doc-column-grip") as HTMLElement | null) ?? grip
        const share = row ? ((row.child(s.index).attrs.width as number | null) ?? 100 / row.childCount) : null
        if (share !== null) now.setAttribute("aria-valuenow", String(Math.round(share)))
        if (now !== grip && document.activeElement === grip) now.focus()
        else if (now !== grip && !grip.isConnected) now.focus()
      })
      grip.addEventListener("pointerdown", (e) => startResize(e, editor as Editor, getPos as () => number | undefined, dom))
      grip.addEventListener("dblclick", (e) => {
        e.preventDefault()
        const pos = (getPos as () => number | undefined)()
        if (pos === undefined || !editor.isEditable) return
        const rowPos = editor.state.doc.resolve(pos).before()
        editor.view.dispatch(setRowWidths(editor.state.tr, rowPos, []))
      })
      return {
        dom,
        contentDOM: body,
        update(next: PMNode) {
          if (next.type !== node.type) return false
          node = next
          draw(next)
          return true
        },
        ignoreMutation: (m: MutationRecord | { type: "selection"; target: globalThis.Node }) =>
          (m.type === "attributes" && m.target === dom) || grip.contains(m.target as globalThis.Node),
        stopEvent: (e: Event) => grip.contains(e.target as globalThis.Node),
      }
    }
  },
})

const columnsTidyKey = new PluginKey("columnsTidy")

/** A row left with one column gives its blocks back: the row's place takes the column's content. */
function unwrapLoneColumns(trs: readonly Transaction[], oldState: EditorState, newState: EditorState): Transaction | null {
  // Never in answer to itself alone (a plugin that answers its own changes can append for ever).
  if (trs.some(isRemote) || trs.every((t) => t.getMeta(columnsTidyKey))) return null
  const transform = combineTransactionSteps(oldState.doc, [...trs])
  const rows: Array<{ pos: number; node: PMNode }> = []
  for (const { newRange } of getChangedRanges(transform)) {
    newState.doc.nodesBetween(Math.max(0, newRange.from), Math.min(newState.doc.content.size, newRange.to), (node, pos) => {
      if (node.type.name === COLUMN_LIST && node.childCount < 2 && !rows.some((r) => r.pos === pos)) rows.push({ pos, node })
      return !node.isTextblock
    })
  }
  if (!rows.length) return null
  const tr = newState.tr
  for (const r of rows.sort((a, b) => b.pos - a.pos)) {
    const content = r.node.firstChild?.content ?? Fragment.empty
    tr.replaceWith(r.pos, r.pos + r.node.nodeSize, content)
  }
  return tr.docChanged ? tr.setMeta(columnsTidyKey, true) : null
}

export const ColumnList = Node.create({
  name: COLUMN_LIST,
  group: "block",
  content: `${COLUMN}+`,
  isolating: true,
  defining: true,

  parseHTML() {
    return [{ tag: 'div[data-type="column-list"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes({ "data-type": "column-list" }, HTMLAttributes), 0]
  },

  addCommands() {
    return {
      insertColumns:
        (count) =>
        ({ state, tr, dispatch }) => {
          const n = Math.max(2, Math.min(MAX_COLUMNS, Math.round(count)))
          const paragraph = state.schema.nodes.paragraph
          const row = rowOf(state, Array.from({ length: n }, () => Fragment.from(paragraph.create())))
          const { $from } = tr.selection
          if (!$from.parent.isTextblock || $from.depth < 1) return false
          if (!dispatch) return true
          let at = $from.after()
          const index = $from.index(-1)
          if ($from.parent.content.size === 0 && $from.node(-1).canReplaceWith(index, index + 1, row.type)) {
            // An empty line (what "/" leaves): the row takes its place.
            at = $from.before()
            tr.replaceWith(at, $from.after(), row)
          } else {
            tr.insert(at, row)
          }
          // The caret in the first column's line: row, column, paragraph.
          tr.setSelection(TextSelection.create(tr.doc, at + 3))
          tr.scrollIntoView()
          return true
        },
    }
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: columnsTidyKey,
        appendTransaction: (trs, oldState, newState) => (trs.some((t) => t.docChanged) ? unwrapLoneColumns(trs, oldState, newState) : null),
      }),
    ]
  },
})

