import { Fragment, type Node as PMNode } from "@tiptap/pm/model"
import { NodeSelection, Selection, TextSelection, type EditorState, type Transaction } from "@tiptap/pm/state"

import { BlockSelection, blocksOfSelection, selectedBlocks } from "../block-selection/blockSelection"
import { newBlockId } from "../block-id/blockId"
import { blocksWithIds } from "./blockIds"
import { LIST_ITEMS, blocksInRange, carriesIndent, childPos, indentOf, outlineEnd, placeOf, removalRange, spanOf, textRange, type BlockRef } from "./blocks"
import { MAX_INDENT } from "./nodes"

/**
 * What the block menu, the phone's sheet and the block keys do to blocks:
 * move, duplicate and delete, each one transaction. Pure: each takes a state
 * and answers the transaction, or null when there is nothing to do.
 *
 * A block goes with its outline children (the blocks after it indented
 * deeper), as Notion's children go with their parent.
 */

/**
 * What a block command acts on: the ids of the blocks a menu stood for
 * (ctx.state.blocks, in document order), or the range they span
 * (ctx.state.range); with neither, the chosen blocks or the caret's.
 */
export type BlockTarget = { from: number; to: number } | readonly string[] | null | undefined

export { blocksWithIds } from "./blockIds"

/**
 * The blocks an action works on. Ids name exactly the blocks a menu chose,
 * apart or together (WAVE_B_CONTRACTS: actions prefer ctx.state.blocks); a
 * range is the blocks it spans, unless the blocks still chosen are the ones
 * it was made from (blocks chosen apart, never those between them); without
 * either, the chosen blocks, else the caret's.
 */
export function targetBlocks(state: EditorState, target?: BlockTarget): BlockRef[] {
  if (Array.isArray(target)) return blocksWithIds(state.doc, target)
  const range = target as { from: number; to: number } | null | undefined
  const chosen = selectedBlocks(state)
  if (range && range.from < range.to && range.to <= state.doc.content.size) {
    if (chosen) {
      const span = spanOf(chosen)
      if (span.from === range.from && span.to === range.to) return chosen
    }
    return blocksInRange(state.doc, range.from, range.to)
  }
  return chosen ?? blocksOfSelection(state)
}

/** A run of sibling blocks, with the outline children of its last. */
export interface Run {
  from: number
  to: number
  /** The run's parent, its content start, and the run's child indexes [start, end). */
  parent: PMNode
  parentStart: number
  start: number
  end: number
}

/** The blocks as runs of siblings side by side, each grown by its outline children; in document order. */
export function runsOf(doc: PMNode, blocks: BlockRef[]): Run[] {
  const sorted = [...blocks].sort((a, b) => a.pos - b.pos)
  const runs: Run[] = []
  for (const b of sorted) {
    const place = placeOf(doc, b.pos)
    const last = runs[runs.length - 1]
    // Inside a run already (a child of a block in it): nothing to add.
    if (last && b.pos >= last.from && b.pos < last.to) continue
    const end = outlineEnd(place.parent, place.index)
    const to = childPos(place, end)
    if (last && last.parent === place.parent && last.to === b.pos) {
      last.end = end
      last.to = to
    } else {
      runs.push({ from: b.pos, to, parent: place.parent, parentStart: place.parentStart, start: place.index, end })
    }
  }
  return runs
}

/**
 * A copy of blocks for elsewhere in the doc, each with an id of its own,
 * given here in this tab's own change (A1's rule), so the copy is chosen or
 * linked to at once.
 */
export function freshIds(fragment: Fragment): Fragment {
  const out: PMNode[] = []
  fragment.forEach((node) => {
    if (node.isText) return void out.push(node)
    const attrs = node.type.spec.attrs?.blockId ? { ...node.attrs, blockId: newBlockId() } : node.attrs
    out.push(node.type.create(attrs, freshIds(node.content), node.marks))
  })
  return Fragment.fromArray(out)
}

/**
 * The selection the blocks had (sel, read before the change), after they
 * moved by delta (or their copies sit delta further on).
 */
function selectionShifted(sel: Selection, tr: Transaction, run: { from: number; to: number }, delta: number): Selection | null {
  const doc = tr.doc
  const inside = (p: number) => p >= run.from && p <= run.to
  if (sel instanceof BlockSelection) {
    const blocks = sel.blocks.filter(inside).map((p) => p + delta)
    if (blocks.length === sel.blocks.length) return new BlockSelection(doc, blocks, sel.anchorBlock + delta, sel.headBlock + delta)
    return null
  }
  if (sel instanceof NodeSelection) return inside(sel.from) ? NodeSelection.create(doc, sel.from + delta) : null
  if (inside(sel.from) && inside(sel.to)) return TextSelection.create(doc, sel.anchor + delta, sel.head + delta)
  return null
}

/** The run's first block kept at most one level under the block before it (an outline can't skip a level). */
function clampIndent(tr: Transaction, start: number, end: number): void {
  const $p = tr.doc.resolve(start)
  const parent = $p.parent
  const index = $p.index()
  const first = parent.maybeChild(index)
  if (!first || !carriesIndent(first)) return
  const before = index > 0 ? parent.child(index - 1) : null
  const most = before && carriesIndent(before) ? indentOf(before) + 1 : 0
  const over = indentOf(first) - most
  if (over <= 0) return
  let pos = start
  while (pos < end) {
    const node = tr.doc.nodeAt(pos)
    if (!node) break
    if (carriesIndent(node)) tr.setNodeMarkup(pos, undefined, { ...node.attrs, indent: Math.max(0, Math.min(MAX_INDENT, indentOf(node) - over)) })
    pos += node.nodeSize
  }
}

/**
 * ⌘⇧↑ ⌘⇧↓: the blocks change places with the block above or below them (that
 * block with its own children). At the top or bottom of their container they
 * stay. Of the two that trade places, the smaller is the one that moves, so a
 * collaborator typing in the other loses nothing.
 */
export function moveBlocks(state: EditorState, blocks: BlockRef[], dir: -1 | 1): Transaction | null {
  // Read before the change: in a command, state is the chain's, and its
  // selection is the transaction's as it changes.
  const before = state.selection
  const runs = runsOf(state.doc, blocks)
  if (runs.length !== 1) return null
  const run = runs[0]
  const { parent } = run
  let other: { from: number; to: number }
  if (dir < 0) {
    if (run.start === 0) return null
    // The unit above: back to the nearest block no deeper than the run's first.
    const base = indentOf(parent.child(run.start))
    let j = run.start - 1
    while (j > 0 && carriesIndent(parent.child(j)) && indentOf(parent.child(j)) > base) j--
    other = { from: childPos(run, j), to: run.from }
  } else {
    if (run.end >= parent.childCount) return null
    other = { from: run.to, to: childPos(run, outlineEnd(parent, run.end)) }
  }
  const tr = state.tr
  const mine = state.doc.slice(run.from, run.to)
  const theirs = state.doc.slice(other.from, other.to)
  const size = run.to - run.from
  const otherSize = other.to - other.from
  if (size <= otherSize) {
    tr.delete(run.from, run.to)
    const at = dir < 0 ? other.from : tr.mapping.map(other.to)
    tr.insert(at, mine.content)
  } else {
    tr.delete(other.from, other.to)
    const at = dir < 0 ? tr.mapping.map(run.to) : run.from
    tr.insert(at, theirs.content)
  }
  const newFrom = dir < 0 ? other.from : run.from + otherSize
  clampIndent(tr, newFrom, newFrom + size)
  const sel = selectionShifted(before, tr, run, newFrom - run.from)
  if (sel) tr.setSelection(sel)
  return tr.scrollIntoView()
}

/**
 * ⌘D, Duplicate: a copy of each block (with its children) right below it,
 * with ids of its own. The caret, or the choice, goes to the copy.
 */
export function duplicateBlocks(state: EditorState, blocks: BlockRef[]): Transaction | null {
  const runs = runsOf(state.doc, blocks)
  if (!runs.length) return null
  // An image still uploading has no address yet: its upload belongs to the one placeholder.
  for (const r of runs) {
    let uploading = false
    state.doc.nodesBetween(r.from, r.to, (n) => {
      if (n.type.name === "image" && !n.attrs.src) uploading = true
      return !uploading
    })
    if (uploading) return null
  }
  // Read before the change (in a command, state follows the transaction).
  const { doc, selection: sel } = state
  const tr = state.tr
  for (const r of [...runs].reverse()) tr.insert(r.to, freshIds(doc.slice(r.from, r.to).content))
  // The copies of the chosen blocks, where they landed.
  const copyOf = (pos: number) => {
    const r = runs.find((x) => pos >= x.from && pos <= x.to)!
    return tr.mapping.map(r.to, -1) + (pos - r.from)
  }
  const inRuns = (pos: number) => runs.some((r) => pos >= r.from && pos <= r.to)
  if (sel instanceof BlockSelection && sel.blocks.every(inRuns)) tr.setSelection(new BlockSelection(tr.doc, sel.blocks.map(copyOf)))
  else if (sel instanceof NodeSelection && inRuns(sel.from)) tr.setSelection(NodeSelection.create(tr.doc, copyOf(sel.from)))
  else if (inRuns(sel.from) && inRuns(sel.to) && runs.some((r) => sel.from >= r.from && sel.to <= r.to)) tr.setSelection(TextSelection.create(tr.doc, copyOf(sel.anchor), copyOf(sel.head)))
  return tr.scrollIntoView()
}

/** Takes the runs away, the last first (so the others' places hold), with any column they leave empty. */
export function removeRuns(tr: Transaction, runs: Array<{ from: number; to: number }>): void {
  for (const r of [...runs].reverse()) {
    const { from, to } = removalRange(tr.doc, r.from, r.to)
    tr.deleteRange(from, to)
  }
}

/** Delete: the blocks go, with their children; the caret goes to the end of the block above, or the start of the one below. */
export function deleteBlocks(state: EditorState, blocks: BlockRef[]): Transaction | null {
  const runs = runsOf(state.doc, blocks)
  if (!runs.length) return null
  const tr = state.tr
  removeRuns(tr, runs)
  const at = Math.min(tr.mapping.map(runs[0].from, -1), tr.doc.content.size)
  tr.setSelection(Selection.near(tr.doc.resolve(at), -1))
  return tr.scrollIntoView()
}

/** The text of the blocks, selected: what Turn into and Comment act on, as on a selection. */
export function textSelectionOf(doc: PMNode, blocks: BlockRef[]): TextSelection | null {
  const ranges = blocks.map((b) => textRange(b.node, b.pos)).filter((r): r is { start: number; end: number } => !!r)
  if (!ranges.length) return null
  return TextSelection.create(doc, ranges[0].start, ranges[ranges.length - 1].end)
}

/** An empty line above or below a block (with its children), at its level and indent: "+" and ⌥-click on "+". */
export function insertLine(state: EditorState, block: BlockRef, above: boolean): Transaction | null {
  const paragraph = state.schema.nodes.paragraph
  if (!paragraph) return null
  const place = placeOf(state.doc, block.pos)
  const at = above ? block.pos : childPos(place, outlineEnd(place.parent, place.index))
  const indent = indentOf(block.node)
  const line = paragraph.create(indent && paragraph.spec.attrs?.indent ? { indent } : null)
  // A list item's new line is an item of its list.
  const item = LIST_ITEMS.includes(block.node.type.name)
  const node = item ? block.node.type.create(null, line) : line
  const tr = state.tr.insert(at, node)
  tr.setSelection(TextSelection.create(tr.doc, at + (item ? 2 : 1)))
  return tr.scrollIntoView()
}

