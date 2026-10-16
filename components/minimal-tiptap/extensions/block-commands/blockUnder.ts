import type { Node as PMNode } from "@tiptap/pm/model"
import type { EditorView } from "@tiptap/pm/view"

import { blockAt, blockAtPoint, isBlock, type BlockRef } from "./blocks"

/** How many containers deep the search goes (a list in a callout in a column). */
const DEPTH = 6

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

/**
 * The block under a point, the doc's gutter included (the handle, a drag's
 * drop, a long-press, a ⇧-click). ProseMirror answers a point in the padding
 * beside a block, where the handle sits and a drag runs down, with the
 * position between two blocks, which is no block. So the search goes on from
 * the block beside that gap whose box holds the point's line (else the
 * nearer one), into containers as deep as they go: a list's item, a
 * column's block. Reads the layout: for a pointer, once a frame, never a key.
 */
export function blockUnder(view: EditorView, x: number, y: number): BlockRef | null {
  const { doc } = view.state
  const box = (view.dom as HTMLElement).getBoundingClientRect()
  const top = clamp(y, box.top + 1, box.bottom - 1)
  let left = clamp(x, box.left + 1, box.right - 1)
  let last = -1
  for (let i = 0; i < DEPTH; i++) {
    const hit = view.posAtCoords({ left, top })
    if (!hit) return null
    const $p = doc.resolve(hit.pos)
    // In a block's own text, or on an atom: that block.
    if (hit.inside >= 0 || $p.parent.inlineContent) return blockAtPoint(doc, hit)
    // Between blocks: the one beside the point.
    const before = $p.nodeBefore ? { pos: hit.pos - $p.nodeBefore.nodeSize, node: $p.nodeBefore } : null
    const after = $p.nodeAfter ? { pos: hit.pos, node: $p.nodeAfter } : null
    const near = nearer(view, [before, after], x, top)
    if (!near) return blockAt(doc, hit.pos)
    const { pos, node } = near
    if (node.isTextblock) return blockAt(doc, pos + 1)
    if (node.isAtom) return isBlock(node) ? near : null
    const r = (view.nodeDOM(pos) as HTMLElement | null)?.getBoundingClientRect?.()
    // No way further in: the container itself, or (a column) its first block.
    if (!r || hit.pos === last) return isBlock(node) ? blockAt(doc, pos + 1) ?? near : blockAt(doc, pos + 2)
    last = hit.pos
    // Into it, at the point's x kept inside its box.
    left = clamp(x, r.left + 2, r.right - 2)
  }
  return null
}

/** Of the nodes either side of a gap, the one whose box holds the point's line, else the closer (then the closer across). */
function nearer(view: EditorView, nodes: Array<{ pos: number; node: PMNode } | null>, x: number, y: number): { pos: number; node: PMNode } | null {
  let best: { pos: number; node: PMNode } | null = null
  let bestY = Infinity
  let bestX = Infinity
  for (const c of nodes) {
    if (!c) continue
    const r = (view.nodeDOM(c.pos) as HTMLElement | null)?.getBoundingClientRect?.()
    if (!r) continue
    const gy = y < r.top ? r.top - y : y > r.bottom ? y - r.bottom : 0
    const gx = x < r.left ? r.left - x : x > r.right ? x - r.right : 0
    if (gy < bestY || (gy === bestY && gx < bestX)) {
      best = c
      bestY = gy
      bestX = gx
    }
  }
  return best
}
