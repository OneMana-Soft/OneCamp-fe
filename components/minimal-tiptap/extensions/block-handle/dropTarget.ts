import { Fragment, type Node as PMNode, type NodeType } from "@tiptap/pm/model"
import { NodeSelection, TextSelection, type EditorState, type Transaction } from "@tiptap/pm/state"

import { LISTS, LIST_ITEMS, carriesIndent, indentOf, textRange, withChildren, type BlockRef } from "../block-commands/blocks"
import { freshIds, removeRuns, runsOf, type Run } from "../block-commands/commands"
import { COLUMN, MAX_COLUMNS, MAX_INDENT } from "../block-commands/nodes"
import { setRowWidths } from "../columns/columns"

/**
 * WHERE A DRAGGED BLOCK LANDS, and the one transaction that puts it there
 * (B1; editor.md P0-2, D10). Pure: the drag (blockDrag.ts) measures where the
 * pointer is and asks this for the change.
 *
 * - A gap: between two blocks, at the start or end of a container. In a
 *   container of blocks the blocks keep their kind (list items go in a list
 *   of theirs) at the indent the drop line showed. In a list, items join it
 *   (a to-do becomes a bullet there, and back), and any other block parts
 *   the list where it lands.
 * - Beside a block: the two stand in columns, or the dragged blocks take a
 *   new column beside the block's own (2–4 a row).
 *
 * A move is a delete and an insert in ONE transaction (Yjs has no move), so
 * a collaborator never sees a copy; ⌥ copies instead, the copies with ids of
 * their own.
 */

export type Drop =
  /** Between blocks: pos is a position between two children of a container. indent: the drop line's depth, where blocks indent. */
  | { kind: "gap"; pos: number; indent: number | null }
  /** Beside the block at pos (one at the doc's level or in a column). */
  | { kind: "beside"; pos: number }

const isList = (t: NodeType) => LISTS.includes(t.name)
const isItem = (t: NodeType) => LIST_ITEMS.includes(t.name)

const clampIndent = (n: number) => Math.max(0, Math.min(MAX_INDENT, n))

/** An item as an item of a list's kind: a to-do in a bulleted list is a bullet, and back. */
function asItem(node: PMNode, itemType: NodeType): PMNode {
  if (node.type === itemType) return node
  const attrs: Record<string, unknown> = { blockId: node.attrs.blockId ?? null }
  return itemType.create(attrs, node.content, node.marks)
}

/** Blocks as a container of blocks holds them: consecutive items in a list of the kind they came from. */
function asBlocks(moving: Array<{ node: PMNode; list: NodeType }>): PMNode[] {
  const out: PMNode[] = []
  let items: PMNode[] = []
  let listType: NodeType | null = null
  const flush = () => {
    if (listType && items.length) out.push(listType.create(null, items))
    items = []
    listType = null
  }
  for (const m of moving) {
    if (isItem(m.node.type)) {
      const t = m.node.type.name === "taskItem" ? m.node.type.schema.nodes.taskList : m.list.name === "taskList" ? m.node.type.schema.nodes.bulletList : m.list
      if (listType && t !== listType) flush()
      listType = t
      items.push(t.name === "taskList" ? asItem(m.node, t.schema.nodes.taskItem) : asItem(m.node, t.schema.nodes.listItem))
    } else {
      flush()
      out.push(m.node)
    }
  }
  flush()
  return out
}

/** The blocks shifted so the first that indents sits at `indent`, the rest keeping their depth under it. */
function atIndent(nodes: PMNode[], indent: number): PMNode[] {
  const first = nodes.find(carriesIndent)
  if (!first) return nodes
  const shift = indent - indentOf(first)
  if (!shift) return nodes
  return nodes.map((n) => (carriesIndent(n) ? n.type.create({ ...n.attrs, indent: clampIndent(indentOf(n) + shift) }, n.content, n.marks) : n))
}

/** The blocks shifted so the shallowest is at no indent (what a new column holds). */
function atNoIndent(nodes: PMNode[]): PMNode[] {
  const least = Math.min(...nodes.filter(carriesIndent).map(indentOf))
  return Number.isFinite(least) && least > 0 ? nodes.map((n) => (carriesIndent(n) ? n.type.create({ ...n.attrs, indent: indentOf(n) - least }, n.content, n.marks) : n)) : nodes
}

/** The caret at the end of the first landed block's text, or the block itself when it has none. */
function finish(tr: Transaction, from: number, to: number): { tr: Transaction; from: number; to: number } {
  const first = tr.doc.nodeAt(from)
  if (first) {
    const r = textRange(first, from)
    if (r) tr.setSelection(TextSelection.create(tr.doc, r.end))
    else if (NodeSelection.isSelectable(first)) tr.setSelection(NodeSelection.create(tr.doc, from))
  }
  return { tr, from, to }
}

/** The run's own children: the blocks a drag carries. */
function nodesOf(run: Run): PMNode[] {
  const out: PMNode[] = []
  for (let i = run.start; i < run.end; i++) out.push(run.parent.child(i))
  return out
}

/** Whether a drop changes nothing: the blocks onto their own place, at their own depth. */
function inPlace(runs: Run[], drop: Drop): boolean {
  if (drop.kind !== "gap" || runs.length !== 1) return false
  const r = runs[0]
  if (drop.pos !== r.from && drop.pos !== r.to) return false
  const first = r.parent.child(r.start)
  return drop.indent === null || !carriesIndent(first) || drop.indent === indentOf(first)
}

/**
 * The change a drop makes, with where the landed blocks are in the new doc;
 * null when there is nothing to do (a drop into the dragged blocks, onto
 * their own place, or where they can't go).
 */
export function dropTransaction(state: EditorState, dragged: BlockRef[], drop: Drop, copy: boolean): { tr: Transaction; from: number; to: number } | null {
  const { doc, schema } = state
  const runs = runsOf(doc, dragged)
  if (!runs.length) return null
  if (runs.some((r) => drop.pos > r.from && drop.pos < r.to)) return null
  if (drop.kind === "beside" && runs.some((r) => drop.pos === r.from)) return null
  if (!copy && inPlace(runs, drop)) {
    // Its own place at another depth: only the indent changes.
    if (drop.kind !== "gap" || drop.indent === null) return null
    const r = runs[0]
    const nodes = atIndent(nodesOf(r), drop.indent)
    const tr = state.tr
    let pos = r.from
    nodes.forEach((n, i) => {
      if (n !== r.parent.child(r.start + i)) tr.setNodeMarkup(pos, undefined, n.attrs)
      pos += n.nodeSize
    })
    return tr.docChanged ? finish(tr, r.from, r.to) : null
  }

  const fresh = (n: PMNode) => (copy ? freshIds(Fragment.from(n)).firstChild! : n)
  const moving = runs.flatMap((r) => nodesOf(r).map((node) => ({ node: fresh(node), list: isList(r.parent.type) ? r.parent.type : schema.nodes.bulletList })))

  const tr = state.tr
  if (!copy) removeRuns(tr, runs)

  if (drop.kind === "gap") {
    const at = tr.mapping.map(drop.pos)
    const $at = tr.doc.resolve(at)
    const parent = $at.parent
    const index = $at.index()
    if (isList(parent.type)) {
      const itemType = parent.type.name === "taskList" ? schema.nodes.taskItem : schema.nodes.listItem
      if (moving.every((m) => isItem(m.node.type))) {
        const items = Fragment.fromArray(moving.map((m) => asItem(m.node, itemType)))
        if (!parent.canReplace(index, index, items)) return null
        tr.insert(at, items)
        return finish(tr, at, at + items.size)
      }
      // A block among a list's items: the list parts where it lands.
      const listPos = $at.before()
      const before: PMNode[] = []
      const after: PMNode[] = []
      parent.forEach((c, _o, i) => (i < index ? before : after).push(c))
      const blocks = atIndent(asBlocks(moving), indentOf(parent))
      const parts: PMNode[] = []
      if (before.length) parts.push(parent.type.create(parent.attrs, before))
      parts.push(...blocks)
      if (after.length) {
        const start = parent.type.name === "orderedList" ? { start: (Number(parent.attrs.start) || 1) + before.length } : {}
        parts.push(parent.type.create({ ...parent.attrs, ...start, blockId: null }, after))
      }
      const holder = $at.node(-1)
      const listIndex = $at.index(-1)
      if (!holder.canReplace(listIndex, listIndex + 1, Fragment.fromArray(parts))) return null
      tr.replaceWith(listPos, listPos + parent.nodeSize, parts)
      const from = listPos + (before.length ? parts[0].nodeSize : 0)
      return finish(tr, from, from + Fragment.fromArray(blocks).size)
    }
    let blocks = asBlocks(moving)
    if (drop.indent !== null) blocks = atIndent(blocks, drop.indent)
    const content = Fragment.fromArray(blocks)
    if (!parent.canReplace(index, index, content)) return null
    tr.insert(at, content)
    return finish(tr, at, at + content.size)
  }

  // Beside a block: columns.
  const pos = tr.mapping.map(drop.pos)
  const target = tr.doc.nodeAt(pos)
  if (!target) return null
  const $t = tr.doc.resolve(pos)
  const content = Fragment.fromArray(atNoIndent(asBlocks(moving)))
  if ($t.parent.type.name === COLUMN) {
    const row = $t.node(-1)
    if (row.childCount >= MAX_COLUMNS) return null
    const end = $t.after()
    tr.insert(end, schema.nodes.column.create(null, content))
    setRowWidths(tr, $t.before(-1), [])
    return finish(tr, end + 1, end + 1 + content.size)
  }
  if ($t.depth !== 0) return null
  // The block with its outline children makes the first column.
  const own = withChildren(tr.doc, pos)
  const kept: PMNode[] = []
  for (let p = own.from; p < own.to; ) {
    const n = tr.doc.nodeAt(p)!
    kept.push(n)
    p += n.nodeSize
  }
  const first = schema.nodes.column.create(null, Fragment.fromArray(atNoIndent(kept)))
  const second = schema.nodes.column.create(null, content)
  const row = schema.nodes.columnList.create(null, [first, second])
  tr.replaceWith(own.from, own.to, row)
  const from = own.from + 1 + first.nodeSize + 1
  return finish(tr, from, from + content.size)
}

/** Whether blocks may stand beside this one: at the doc's level, or in a row with room for one more column. */
export function besideAllowed(doc: PMNode, pos: number): boolean {
  const $p = doc.resolve(pos)
  if ($p.depth === 0) return true
  return $p.parent.type.name === COLUMN && $p.node(-1).childCount < MAX_COLUMNS
}

/** The landed blocks, each its own range: what the landing look marks. */
export function landedRanges(doc: PMNode, from: number, to: number): Array<{ from: number; to: number }> {
  const out: Array<{ from: number; to: number }> = []
  let pos = from
  while (pos < to) {
    const node = doc.nodeAt(pos)
    if (!node) break
    out.push({ from: pos, to: pos + node.nodeSize })
    pos += node.nodeSize
  }
  return out
}

