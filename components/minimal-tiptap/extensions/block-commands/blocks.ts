import { Fragment, type Node as PMNode, type ResolvedPos } from "@tiptap/pm/model"
import { COLUMN, COLUMN_LIST, INDENT_NODES } from "./nodes"

/**
 * What a "block" is for the hand (the handle, the block menu, block selection
 * and drag): pure helpers over a ProseMirror doc, no view.
 *
 * Any block at any depth is one: a paragraph in a callout, a list item, a
 * block in a column, an image. A container owns its first line, as Notion's
 * blocks do: a list item's first paragraph is the item, a callout's or a
 * quote's first block is the callout or the quote, and so is a first child
 * that is no block of its own (a toggle's summary). A column is layout, not a
 * block (its blocks are); a table's cells belong to the table.
 */

export interface BlockRef {
  /** The position just before the block. */
  pos: number
  node: PMNode
}

/** Containers whose first child is their own line. */
const OWN_FIRST_LINE = new Set(["listItem", "taskItem", "callout", "blockquote"])

/** Nodes that are never blocks of their own for the hand. */
const NOT_BLOCKS = new Set(["doc", "text", COLUMN])

export const LIST_ITEMS = ["listItem", "taskItem"]
export const LISTS = ["bulletList", "orderedList", "taskList"]

export const isBlock = (node: PMNode) => !node.isInline && !NOT_BLOCKS.has(node.type.name)

const roleOf = (node: PMNode) => (node.type.spec as { tableRole?: string }).tableRole
const inTable = (node: PMNode) => !!roleOf(node)

const inBlockGroup = (node: PMNode) => (node.type.spec.group ?? "").split(" ").includes("block")

/** Whether a container's first child is the container's own line. */
const ownsFirstLine = (parent: PMNode, child: PMNode) =>
  OWN_FIRST_LINE.has(parent.type.name) || (!inBlockGroup(child) && !LIST_ITEMS.includes(child.type.name) && child.type.name !== COLUMN)

/**
 * The block the hand takes at a position: the innermost block holding it,
 * moved up to the container that owns it as its first line, and to a table
 * from inside one of its cells. Null at the doc's own level (no block).
 */
export function blockAt(doc: PMNode, pos: number): BlockRef | null {
  return blockOfResolved(doc.resolve(Math.max(0, Math.min(pos, doc.content.size))))
}

/** As blockAt, from a resolved position. */
export function blockOfResolved($pos: ResolvedPos): BlockRef | null {
  let depth = $pos.depth
  while (depth > 0 && !isBlock($pos.node(depth))) depth--
  if (depth === 0) return null
  // A table's cells and rows: the table is the block. The outermost node with
  // a table role is the table itself (the simple table's is "table"), or, for
  // a table that names none, the parent of its rows. (It stopped a level short
  // of a table that names its role, and took the line in the cell.)
  for (let d = 1; d <= depth; d++) {
    if (!inTable($pos.node(d))) continue
    const t = roleOf($pos.node(d)) === "table" ? d : d - 1
    if (t >= 1) return { pos: $pos.before(t), node: $pos.node(t) }
    break
  }
  while (depth > 1 && $pos.index(depth - 1) === 0 && ownsFirstLine($pos.node(depth - 1), $pos.node(depth))) depth--
  return { pos: $pos.before(depth), node: $pos.node(depth) }
}

/** The block a node position names (the node there), when it is one. */
function blockAtNode(doc: PMNode, pos: number): BlockRef | null {
  const node = doc.nodeAt(pos)
  if (!node || !isBlock(node)) return null
  return { pos, node }
}

/**
 * The block under a point, from what posAtCoords answered: an atom (an image,
 * a divider, an embed) is the node the point is inside; anything else is the
 * block holding the position.
 */
export function blockAtPoint(doc: PMNode, hit: { pos: number; inside: number }): BlockRef | null {
  if (hit.inside >= 0) {
    const node = doc.nodeAt(hit.inside)
    if (node && isBlock(node) && node.isAtom) return { pos: hit.inside, node }
  }
  return blockAt(doc, hit.pos)
}

/** A block's place among its siblings. */
interface Place {
  parent: PMNode
  /** The parent's content start. */
  parentStart: number
  index: number
  depth: number
}

export function placeOf(doc: PMNode, pos: number): Place {
  const $pos = doc.resolve(pos)
  return { parent: $pos.parent, parentStart: $pos.start(), index: $pos.index(), depth: $pos.depth }
}

/** The position of a parent's child, by index. */
export function childPos(place: Pick<Place, "parent" | "parentStart">, index: number): number {
  let p = place.parentStart
  for (let i = 0; i < index; i++) p += place.parent.child(i).nodeSize
  return p
}

export const carriesIndent = (node: PMNode) => INDENT_NODES.includes(node.type.name)

export const indentOf = (node: PMNode): number => (carriesIndent(node) && typeof node.attrs.indent === "number" ? node.attrs.indent : 0)

/**
 * The end (exclusive child index) of a block's outline: the siblings after it
 * that are indented deeper are its children, and travel with it (Tab, drag,
 * duplicate, delete).
 */
export function outlineEnd(parent: PMNode, index: number): number {
  const block = parent.child(index)
  if (!carriesIndent(block)) return index + 1
  const base = indentOf(block)
  let i = index + 1
  while (i < parent.childCount && carriesIndent(parent.child(i)) && indentOf(parent.child(i)) > base) i++
  return i
}

/** A block with its outline children, as a range of positions. */
export function withChildren(doc: PMNode, pos: number): { from: number; to: number; count: number } {
  const place = placeOf(doc, pos)
  const end = outlineEnd(place.parent, place.index)
  let to = pos
  for (let i = place.index; i < end; i++) to += place.parent.child(i).nodeSize
  return { from: pos, to, count: end - place.index }
}

/**
 * The blocks a range covers, at one level: the children of the deepest node
 * holding the whole range whose children are blocks, from the one holding
 * `a` to the one holding `b`. What block selection selects between two
 * blocks; blocks in two columns of one row select the row.
 */
export function blocksBetween(doc: PMNode, a: number, b: number): BlockRef[] {
  const path = (pos: number) => {
    const $p = doc.resolve(pos)
    const out: number[] = []
    for (let d = 0; d <= $p.depth; d++) out.push($p.index(d))
    return { $p, out }
  }
  const A = path(Math.min(a, b))
  const B = path(Math.max(a, b))
  let k = 0
  while (k < A.out.length - 1 && k < B.out.length - 1 && A.out[k] === B.out[k]) k++
  while (k > 0 && (A.$p.node(k).type.name === COLUMN_LIST || A.$p.node(k).type.name === COLUMN)) k--
  const parent = A.$p.node(k)
  const first = A.out[k]
  const last = Math.max(first, B.out[k])
  const out: BlockRef[] = []
  let p = k === 0 ? 0 : A.$p.start(k)
  for (let i = 0; i < parent.childCount && i <= last; i++) {
    const child = parent.child(i)
    if (i >= first && isBlock(child)) out.push({ pos: p, node: child })
    p += child.nodeSize
  }
  return out
}


/** The first text line or atom at or after (dir 1) or before (dir -1) a position, as the hand's block. */
function lineBlock(doc: PMNode, from: number, to: number, dir: -1 | 1): BlockRef | null {
  let found: BlockRef | null = null
  doc.nodesBetween(from, to, (node, pos) => {
    if (dir > 0 && found) return false
    if (dir > 0 && pos < from) return true
    if (dir < 0 && pos + node.nodeSize > to) return pos < to
    if (node.isTextblock || (node.isAtom && isBlock(node))) {
      found = node.isTextblock ? blockAt(doc, pos + 1) : { pos, node }
      return false
    }
    return true
  })
  return found
}

/**
 * The block before or after one as the eye reads them, at any depth: the
 * line above or below it (↑ and ↓ with blocks selected).
 */
export function adjacentBlock(doc: PMNode, block: BlockRef, dir: -1 | 1): BlockRef | null {
  const end = block.pos + block.node.nodeSize
  const hit = dir > 0 ? (end < doc.content.size ? lineBlock(doc, end, doc.content.size, 1) : null) : lineBlock(doc, 0, block.pos, -1)
  // Above a callout's second line is the callout's own line: the callout.
  return hit && hit.pos !== block.pos ? hit : null
}

/** The first and last text positions inside a block (for a caret), or null for an atom. */
export function textRange(node: PMNode, pos: number): { start: number; end: number } | null {
  if (node.isTextblock) return { start: pos + 1, end: pos + 1 + node.content.size }
  let first: { start: number; end: number } | null = null
  let last: { start: number; end: number } | null = null
  node.descendants((child, at) => {
    if (child.isTextblock) {
      const r = { start: pos + 1 + at + 1, end: pos + 1 + at + 1 + child.content.size }
      if (!first) first = r
      last = r
      return false
    }
    return true
  })
  if (!first || !last) return null
  return { start: (first as { start: number }).start, end: (last as { end: number }).end }
}

/** The span of blocks: from the first's start to the last's end. */
export function spanOf(blocks: BlockRef[]): { from: number; to: number } {
  let from = Infinity
  let to = -Infinity
  for (const b of blocks) {
    from = Math.min(from, b.pos)
    to = Math.max(to, b.pos + b.node.nodeSize)
  }
  return { from, to }
}

/**
 * The blocks a range names. A range of whole blocks (ctx.state.range, from a
 * block menu) is those blocks; a text range (a selection) is the blocks
 * holding its ends, and those between, at one level.
 */
export function blocksInRange(doc: PMNode, from: number, to: number): BlockRef[] {
  const at = blockAtNode(doc, from)
  if (at && at.pos + at.node.nodeSize <= to) {
    const out: BlockRef[] = []
    const place = placeOf(doc, from)
    let p = from
    for (let i = place.index; i < place.parent.childCount && p < to; i++) {
      const child = place.parent.child(i)
      if (isBlock(child)) out.push({ pos: p, node: child })
      p += child.nodeSize
    }
    return out
  }
  const a = blockAt(doc, from)
  const b = blockAt(doc, Math.max(from, to - 1))
  if (!a || !b) return a ? [a] : []
  return blocksBetween(doc, a.pos, b.pos)
}

/**
 * A block as it can stand on its own outside its container: a list item in a
 * list of its kind (what it is copied or moved as), anything else as it is.
 */
export function standAlone(node: PMNode, listType?: PMNode["type"]): PMNode {
  if (!LIST_ITEMS.includes(node.type.name)) return node
  const schema = node.type.schema
  const list = node.type.name === "taskItem" ? schema.nodes.taskList : listType && listType.name !== "taskList" ? listType : schema.nodes.bulletList
  return list.create(null, Fragment.from(node))
}

/**
 * What taking blocks away removes: the blocks, and a column they leave empty
 * with them (a row of columns it leaves empty too). ProseMirror's deleteRange
 * stops at a column (it is isolating) and would leave an empty line there.
 * Pure; doc is the one the range is in.
 */
export function removalRange(doc: PMNode, from: number, to: number): { from: number; to: number } {
  for (;;) {
    const $from = doc.resolve(from)
    const name = $from.parent.type.name
    if ((name !== COLUMN && name !== COLUMN_LIST) || from !== $from.start() || to !== $from.end()) return { from, to }
    from = $from.before()
    to = $from.after()
  }
}
