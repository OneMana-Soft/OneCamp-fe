"use client"

import type { EditorView } from "@tiptap/pm/view"
import type { Node as PMNode } from "@tiptap/pm/model"

import { LIST_ITEMS, carriesIndent, indentOf, textRange, type BlockRef } from "../block-commands/blocks"
import { blockUnder } from "../block-commands/blockUnder"
import { blocksWithIds } from "../block-commands/blockIds"
import { runsOf } from "../block-commands/commands"
import { COLUMN_LIST, MAX_INDENT } from "../block-commands/nodes"
import { clearEffect, reducedMotion, showEffect } from "../block-commands/effects"
import { besideAllowed, dropTransaction, landedRanges, type Drop } from "./dropTarget"

/**
 * DRAGGING BLOCKS (B1; editor.md P0-2, small-details V4, V5, S10; content.md
 * D10), with the board's drag feel (research-real-motion §A): the block
 * lifts as a ghost (pop, e3, r8, 90 %, at most 320 px wide and 160 px tall,
 * fading at the bottom), scaled to 1.03 on the spring and tilted 1.5° the way
 * the pointer first goes; the blocks left behind dim to 35 %; a 2 px brand
 * line with its disc shows where they will land and how deep (each 28 px to
 * the right is a level); the right fifth of a block puts them beside it, in
 * columns, shown by an upright line. Near the pane's top or bottom the doc
 * scrolls. ⌥ copies instead (the ghost shows a +). Esc puts everything back.
 * On the drop, the blocks glide from the ghost into place (200 ms) and
 * flash brand-muted (700 ms); with reduced motion they are simply there.
 */

/** A level of nesting, in px (the indent CSS's step). */
export const LEVEL = 28

/** How far the pointer goes before a press on the grip is a drag. */
export const DRAG_SLOP = 4

interface Line {
  left: number
  right: number
  y: number
}

interface Target {
  drop: Drop
  /** A gap's line, or beside's upright one. */
  line: Line | { x: number; top: number; bottom: number }
}

/** A block's first line, in viewport px: where the handle centres and where "below it" begins. */
export function firstLine(view: EditorView, block: BlockRef): { top: number; bottom: number } | null {
  const r = textRange(block.node, block.pos)
  if (r) {
    try {
      const c = view.coordsAtPos(r.start)
      return { top: c.top, bottom: c.bottom }
    } catch {
      return null
    }
  }
  const el = view.nodeDOM(block.pos) as HTMLElement | null
  if (!el || !el.getBoundingClientRect) return null
  const rect = el.getBoundingClientRect()
  // A divider is a 1 px line in its margin: centre on it.
  if (rect.height < 8) return { top: rect.top - 12, bottom: rect.bottom + 12 }
  return { top: rect.top, bottom: rect.top + Math.min(rect.height, 26) }
}

const OWNERS = new Set([...LIST_ITEMS, "callout", "blockquote"])

/** The block's box. */
function boxOf(view: EditorView, pos: number): DOMRect | null {
  const el = view.nodeDOM(pos) as HTMLElement | null
  return el && el.getBoundingClientRect ? el.getBoundingClientRect() : null
}

/** The indent a line at this left edge stands for, within what the gap allows. */
function indentAt(left: number, base: number, most: number): number {
  return Math.max(0, Math.min(most, MAX_INDENT, Math.round((left - base) / LEVEL)))
}

/**
 * Where blocks dragged to (x, y) would land. `left` is where the dragged
 * block's own left edge would be (the pointer, less where it took hold), which
 * picks the depth. Pure but for the view's layout reads.
 */
export function targetAt(view: EditorView, x: number, y: number, left: number, dragged: BlockRef[]): Target | null {
  const { doc } = view.state
  const runs = runsOf(doc, dragged)
  const insideDragged = (pos: number) => runs.some((r) => pos >= r.from && pos < r.to)

  // Below the last block: the doc's end, at the depth the pointer shows.
  const last = doc.lastChild
  const lastPos = last ? doc.content.size - last.nodeSize : 0
  const lastBox = last ? boxOf(view, lastPos) : null
  if (last && lastBox && y > lastBox.bottom + 6) {
    const base = lastBox.left - indentOf(last) * LEVEL
    const indent = carriesIndent(last) ? indentAt(left, base, indentOf(last) + 1) : 0
    return { drop: { kind: "gap", pos: doc.content.size, indent }, line: { left: base + indent * LEVEL, right: lastBox.right, y: lastBox.bottom + 4 } }
  }

  // The pointer runs down the gutter as often as over the text.
  let block = blockUnder(view, x, y)
  if (!block) return null
  // Over the dragged blocks themselves: their own place.
  if (insideDragged(block.pos)) {
    const run = runs.find((r) => block!.pos >= r.from && block!.pos < r.to)!
    block = { pos: run.from, node: doc.nodeAt(run.from)! }
  }
  const rect = boxOf(view, block.pos)
  if (!rect) return null
  const $b = doc.resolve(block.pos)
  const own = block.node.type.name

  // The right fifth of a block at the doc's level, or in a column: beside it.
  if (!insideDragged(block.pos) && x > rect.right - rect.width * 0.2 && x < rect.right + 40 && !LIST_ITEMS.includes(own) && own !== COLUMN_LIST && besideAllowed(doc, block.pos)) {
    return { drop: { kind: "beside", pos: block.pos }, line: { x: rect.right + 6, top: rect.top, bottom: rect.bottom } }
  }

  // An item, a callout or a quote: the bottom of its first line is "under it".
  const owner = OWNERS.has(own)
  const firstBox = owner ? boxOf(view, block.pos + 1) : null
  const headBottom = owner && firstBox ? firstBox.bottom : rect.bottom
  const below = y > (owner ? (rect.top + headBottom) / 2 : rect.top + rect.height / 2)
  const textLeft = rect.left

  const parent = $b.parent
  const index = $b.index()
  if (!below) {
    // Above the block, at its level; the depth within what the block above allows.
    const prev = index > 0 ? parent.child(index - 1) : null
    const base = rect.left - indentOf(block.node) * LEVEL
    const indent = carriesIndent(block.node) ? indentAt(left, base, prev && carriesIndent(prev) ? indentOf(prev) + 1 : 0) : null
    return { drop: { kind: "gap", pos: block.pos, indent }, line: { left: indent === null ? textLeft : base + indent * LEVEL, right: rect.right, y: rect.top - 2 } }
  }

  const after = block.pos + block.node.nodeSize
  // Under an item, a callout or a quote, moved right: its first child.
  if (owner && left > textLeft + LEVEL / 2) {
    return { drop: { kind: "gap", pos: block.pos + 1 + block.node.child(0).nodeSize, indent: null }, line: { left: textLeft + (LIST_ITEMS.includes(own) ? LEVEL : 16), right: rect.right, y: headBottom + 2 } }
  }
  // The last item of a list (or the last block of a callout), moved left: after the container.
  const holder = $b.depth > 0 ? $b.node($b.depth) : null
  if (holder && index === parent.childCount - 1 && $b.depth > 0 && left < textLeft - LEVEL / 2 && holder.type.name !== "column") {
    const holderPos = $b.before($b.depth)
    const hBox = boxOf(view, holderPos)
    if (hBox && !insideDragged(holderPos)) {
      return { drop: { kind: "gap", pos: holderPos + holder.nodeSize, indent: carriesIndent(holder) ? indentOf(holder) : null }, line: { left: hBox.left, right: hBox.right, y: hBox.bottom + 2 } }
    }
  }
  // Under the block, at its level or one deeper (its child, where blocks indent).
  const base = rect.left - indentOf(block.node) * LEVEL
  const indent = carriesIndent(block.node) ? indentAt(left, base, indentOf(block.node) + 1) : null
  return { drop: { kind: "gap", pos: after, indent }, line: { left: indent === null ? textLeft : base + indent * LEVEL, right: rect.right, y: rect.bottom + 2 } }
}

/**
 * The ghost: a copy of the first dragged block in the doc's own type, on a
 * card capped and faded. The ghost follows the pointer at once; the card
 * inside it lifts (scale, tilt) on the spring.
 */
function makeGhost(view: EditorView, dragged: BlockRef[]): HTMLElement {
  const ghost = document.createElement("div")
  ghost.className = "block-drag-ghost"
  ghost.setAttribute("aria-hidden", "true")
  const card = document.createElement("div")
  card.className = "block-drag-card"
  const frame = document.createElement("div")
  frame.className = "minimal-tiptap-editor doc-editor"
  const body = document.createElement("div")
  body.className = "ProseMirror"
  const first = view.nodeDOM(dragged[0].pos) as HTMLElement | null
  if (first?.cloneNode) {
    const copy = first.cloneNode(true) as HTMLElement
    copy.removeAttribute("contenteditable")
    copy.classList.remove("block-drag-source", "block-selected", "ProseMirror-selectednode")
    copy.querySelectorAll("[contenteditable]").forEach((el) => el.removeAttribute("contenteditable"))
    body.append(copy)
  }
  frame.append(body)
  card.append(frame)
  if (dragged.length > 1) {
    const badge = document.createElement("span")
    badge.className = "block-drag-count"
    badge.textContent = `${dragged.length} blocks`
    card.append(badge)
  }
  const plus = document.createElement("span")
  plus.className = "block-drag-copy"
  plus.textContent = "+"
  card.append(plus)
  ghost.append(card)
  document.body.append(ghost)
  return ghost
}

/** The scrolling pane around the editor (the doc's .doc-scroll). */
function scrollerOf(view: EditorView): HTMLElement | null {
  let el: HTMLElement | null = (view.dom as HTMLElement).parentElement
  while (el && el !== document.body) {
    const style = getComputedStyle(el)
    if (/(auto|scroll)/.test(style.overflowY) && el.scrollHeight > el.clientHeight) return el
    el = el.parentElement
  }
  return null
}

export interface DragOptions {
  view: EditorView
  /** The blocks dragged, in document order. */
  dragged: BlockRef[]
  /** Where the pointer took hold, and the first dragged block's left edge then. */
  startX: number
  startY: number
  blockLeft: number
  /** The handle (shown again when the drag ends). */
  onEnd(): void
}

/**
 * Runs one drag from the grip until the pointer goes up (or Esc). The
 * pointer's moves are read once a frame.
 */
export function runBlockDrag({ view, dragged, startX, startY, blockLeft, onEnd }: DragOptions): void {
  const ids = dragged.map((b) => b.node.attrs.blockId as string | null)
  const startDoc = view.state.doc
  const ghost = makeGhost(view, dragged)
  const line = document.createElement("div")
  line.className = "block-drop-indicator"
  line.setAttribute("aria-hidden", "true")
  document.body.append(line)
  const firstBox = (view.nodeDOM(dragged[0].pos) as HTMLElement | null)?.getBoundingClientRect?.()
  const ghostWidth = Math.min(320, Math.max(160, firstBox?.width ?? 320))
  ghost.style.width = `${ghostWidth}px`
  const grabX = Math.max(-40, Math.min(ghostWidth - 24, startX - blockLeft))
  const grabY = Math.max(4, Math.min(40, startY - (firstBox?.top ?? startY)))
  const scroller = scrollerOf(view)
  const root = document.documentElement
  root.classList.add("block-dragging")
  const reduce = reducedMotion()
  const runs = runsOf(view.state.doc, dragged)
  showEffect(view, "drag-source", runs.flatMap((r) => landedRanges(view.state.doc, r.from, r.to)), { class: "block-drag-source" })

  let x = startX
  let y = startY
  let alt = false
  let tilt = 0
  let target: Target | null = null
  let frame = 0
  let ended = false

  const place = () => {
    frame = 0
    ghost.style.transform = `translate3d(${Math.round(x - grabX)}px, ${Math.round(y - grabY)}px, 0)`
    ghost.style.setProperty("--tilt", `${tilt}deg`)
    ghost.dataset.copy = alt ? "true" : "false"
    root.classList.toggle("block-dragging-copy", alt)
    target = targetAt(view, x, y, blockLeft + (x - startX), current())
    if (!target) {
      line.dataset.visible = "false"
    } else if ("y" in target.line) {
      const l = target.line
      line.dataset.visible = "true"
      line.dataset.upright = "false"
      line.style.width = `${Math.max(24, l.right - l.left)}px`
      line.style.height = ""
      line.style.transform = `translate3d(${Math.round(l.left)}px, ${Math.round(l.y - 1)}px, 0)`
    } else {
      const l = target.line
      line.dataset.visible = "true"
      line.dataset.upright = "true"
      line.style.width = ""
      line.style.height = `${Math.max(24, l.bottom - l.top)}px`
      line.style.transform = `translate3d(${Math.round(l.x - 1)}px, ${Math.round(l.top)}px, 0)`
    }
    autoScroll()
  }

  /** The dragged blocks where they are now (a collaborator's edit moves them): found again by id, once per doc. */
  let seen: { doc: PMNode; blocks: BlockRef[] } = { doc: startDoc, blocks: dragged }
  const current = (): BlockRef[] => {
    const doc = view.state.doc
    if (doc === seen.doc) return seen.blocks
    const found = ids.every(Boolean) ? blocksWithIds(doc, ids as string[]) : []
    seen = { doc, blocks: found.length === ids.length ? found : [] }
    return seen.blocks
  }

  let scrolling = 0
  const autoScroll = () => {
    if (!scroller || scrolling) return
    const r = scroller.getBoundingClientRect()
    const zone = r.height * 0.1
    const speed = y < r.top + zone ? -Math.ceil(((r.top + zone - y) / zone) * 16) : y > r.bottom - zone ? Math.ceil(((y - (r.bottom - zone)) / zone) * 16) : 0
    if (!speed) return
    scrolling = requestAnimationFrame(() => {
      scrolling = 0
      if (ended) return
      scroller.scrollTop += speed
      schedule()
    })
  }

  const schedule = () => {
    if (!frame && !ended) frame = requestAnimationFrame(place)
  }

  const move = (e: PointerEvent) => {
    x = e.clientX
    y = e.clientY
    alt = e.altKey
    // Tilted the way the pointer first goes, a mouse only (as the board's cards).
    if (!tilt && !reduce && e.pointerType === "mouse" && Math.abs(x - startX) > 2) tilt = x > startX ? 1.5 : -1.5
    schedule()
  }

  const finish = (drop: boolean) => {
    if (ended) return
    ended = true
    cancelAnimationFrame(frame)
    cancelAnimationFrame(scrolling)
    window.removeEventListener("pointermove", move, true)
    window.removeEventListener("pointerup", up, true)
    window.removeEventListener("pointercancel", cancel, true)
    window.removeEventListener("keydown", key, true)
    window.removeEventListener("keyup", key, true)
    scroller?.removeEventListener("scroll", schedule)
    root.classList.remove("block-dragging", "block-dragging-copy")
    line.remove()
    clearEffect(view, "drag-source")
    const ghostBox = ghost.getBoundingClientRect()
    ghost.remove()
    onEnd()
    if (!drop || view.isDestroyed) return
    // Where it lands, asked again: the doc may have moved since the last frame.
    const blocks = current()
    const at = blocks.length ? targetAt(view, x, y, blockLeft + (x - startX), blocks) : null
    const result = at && dropTransaction(view.state, blocks, at.drop, alt)
    if (!result) return
    view.dispatch(result.tr)
    view.focus()
    land(view, landedRanges(view.state.doc, result.from, result.to), ghostBox, reduce)
  }

  const up = () => finish(true)
  const cancel = () => finish(false)
  const key = (e: KeyboardEvent) => {
    if (e.type === "keydown" && e.key === "Escape") {
      e.preventDefault()
      e.stopPropagation()
      finish(false)
      return
    }
    if (e.key === "Alt" && alt !== (e.type === "keydown")) {
      alt = e.type === "keydown"
      schedule()
    }
  }

  window.addEventListener("pointermove", move, true)
  window.addEventListener("pointerup", up, true)
  window.addEventListener("pointercancel", cancel, true)
  window.addEventListener("keydown", key, true)
  window.addEventListener("keyup", key, true)
  // A wheel scroll moves the doc under a still pointer.
  scroller?.addEventListener("scroll", schedule, { passive: true })
  // The lift: the card scales up (and tilts) on the spring, from its rest.
  ghost.style.transform = `translate3d(${Math.round(x - grabX)}px, ${Math.round(y - grabY)}px, 0)`
  requestAnimationFrame(() => {
    if (ended) return
    if (!reduce) ghost.dataset.lifted = "true"
    schedule()
  })
}

/**
 * The landing: the blocks glide from where the ghost was into place (the
 * board's drop, 200 ms), then flash brand-muted (700 ms). Reduced motion:
 * they are simply there, tinted a moment.
 */
function land(view: EditorView, ranges: Array<{ from: number; to: number }>, ghost: DOMRect, reduce: boolean) {
  if (!ranges.length) return
  const first = view.nodeDOM(ranges[0].from) as HTMLElement | null
  const box = first?.getBoundingClientRect?.()
  if (!reduce && box) {
    const dx = Math.round(ghost.left - box.left)
    const dy = Math.round(ghost.top - box.top)
    showEffect(view, "landed", ranges, { class: "block-landing", style: `transform: translate(${dx}px, ${dy}px)` })
    requestAnimationFrame(() => requestAnimationFrame(() => showEffect(view, "landed", ranges, { class: "block-landed" }, 900)))
  } else {
    showEffect(view, "landed", ranges, { class: "block-landed-still" }, 700)
  }
}

/** The blocks a drag from this block takes: the chosen blocks when it is one of them, else it alone. */
export function draggedFor(block: BlockRef, chosen: BlockRef[] | null): BlockRef[] {
  if (chosen && chosen.some((b) => b.pos === block.pos)) return chosen
  return [block]
}

