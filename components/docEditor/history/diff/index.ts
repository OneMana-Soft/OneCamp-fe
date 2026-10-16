/**
 * What changed between two versions, drawn into the preview (docs programme
 * B8). Loaded only when someone turns "Show changes" on (G-PERF), and done in
 * time slices, like the plain preview: blocks are made in groups, turned into
 * trees (tree.ts), lined up level by level (align.ts) and drawn with their
 * marks, a few at a time.
 *
 * The preview shows `after`, the version being read. A block only it has is
 * marked added; a block only `before` had comes back where it stood, marked
 * removed; a text block in both whose words differ is marked changed, with
 * the words added and removed inside it (marks.ts); a container in both
 * (a list, a quote, a checklist item) has its own blocks lined up the same
 * way, so one item changed in a long list is one item marked, not the list.
 */

import "./history-diff.css"
import { versionElements } from "../preview/materialize"
import { FIRST_BLOCKS, type RenderStats, type RenderTarget } from "../preview/renderVersion"
import { slicer, type SliceOptions } from "../preview/slices"
import { alignBlocks, type BlockKey, type BlockStep } from "./align"
import { markWords } from "./marks"
import { blockNode, lookOf, ownLook, type BlockNode } from "./tree"
import { wordsOf } from "@/lib/proposals/core"
import { diffWords } from "./words"

export interface DiffStats extends RenderStats {
  added: number
  removed: number
  changed: number
  wordsAdded: number
  wordsRemoved: number
}

/** The attribute on a block that changed, and what happened to it. */
export const CHANGE_ATTR = "data-history-change"

type Change = "added" | "removed" | "changed"

const keyOf = (n: BlockNode): BlockKey => ({ id: n.id, kind: n.kind, text: n.text })

const TEXT_KINDS = new Set(["p", "h1", "h2", "h3", "h4", "h5", "h6", "pre"])
const isText = (n: BlockNode) => !n.kids && TEXT_KINDS.has(n.kind)

function mark(el: HTMLElement, change: Change): HTMLElement {
  el.setAttribute(CHANGE_ATTR, change)
  // Said, not only shown; a list item keeps its role in its list.
  if (change !== "changed" && el.tagName !== "LI") el.setAttribute("role", change === "added" ? "insertion" : "deletion")
  return el
}

function emptyStats(blocks: number): DiffStats {
  return { blocks, ms: 0, slices: 0, longestSliceMs: 0, added: 0, removed: 0, changed: 0, wordsAdded: 0, wordsRemoved: 0 }
}

/** The words a block holds, in its text blocks (an image or an embed holds none). */
function wordsIn(node: BlockNode): number {
  if (node.kids) return node.kids.reduce((n, k) => n + wordsIn(k), 0)
  return TEXT_KINDS.has(node.kind) ? wordsOf(node.text).filter((t) => /\S/.test(t)).length : 0
}

/** The old block, put back where it stood, struck. */
function removedCopy(node: BlockNode, stats: DiffStats): HTMLElement {
  stats.removed++
  stats.wordsRemoved += wordsIn(node)
  return mark(node.el.cloneNode(true) as HTMLElement, "removed")
}

function added(node: BlockNode, stats: DiffStats) {
  stats.added++
  stats.wordsAdded += wordsIn(node)
  mark(node.el, "added")
}

function changed(el: HTMLElement, stats: DiffStats) {
  if (!el.hasAttribute(CHANGE_ATTR)) stats.changed++
  mark(el, "changed")
}

/**
 * One step, on the new block: marked as what happened to it. Returns the old
 * blocks to put back before it (an image swapped, words rewritten).
 */
function applyStep(step: BlockStep, olds: BlockNode[], neu: BlockNode, stats: DiffStats): HTMLElement[] {
  if (step.kind === "added") {
    added(neu, stats)
    return []
  }
  if (step.kind === "removed") return []
  const old = olds[step.a]
  if (step.kind === "same") {
    // The same words: what else changed, if anything (bold, a link, a tick).
    if (lookOf(old.el) === lookOf(neu.el)) return []
    if (old.kids && neu.kids) {
      if (ownLook(old.el) !== ownLook(neu.el)) changed(neu.el, stats)
      diffLevel(old.kids, neu.kids, neu.el, stats)
    } else {
      changed(neu.el, stats)
    }
    return []
  }
  if (old.kids && neu.kids) {
    if (old.kind !== neu.kind || ownLook(old.el) !== ownLook(neu.el)) changed(neu.el, stats)
    diffLevel(old.kids, neu.kids, neu.el, stats)
    return []
  }
  if (isText(old) && isText(neu)) {
    const words = diffWords(old.text, neu.text)
    if (words) {
      if (words.changes.length) markWords(neu.el, words.changes)
      changed(neu.el, stats)
      stats.wordsAdded += words.wordsAdded
      stats.wordsRemoved += words.wordsRemoved
      return []
    }
  }
  // Rewritten, or another kind of block: the old one struck, the new one whole.
  added(neu, stats)
  return [removedCopy(old, stats)]
}

/** A container's blocks, lined up and marked in place; removed ones go back where they stood. */
function diffLevel(olds: BlockNode[], news: BlockNode[], parent: HTMLElement, stats: DiffStats) {
  let pending: HTMLElement[] = []
  let last: HTMLElement | null = null
  for (const step of alignBlocks(olds.map(keyOf), news.map(keyOf))) {
    if (step.kind === "removed") {
      pending.push(removedCopy(olds[step.a], stats))
      continue
    }
    const neu = news[step.b]
    pending.push(...applyStep(step, olds, neu, stats))
    if (pending.length) neu.el.before(...pending)
    pending = []
    last = neu.el
  }
  if (!pending.length) return
  if (last) last.after(...pending)
  else parent.append(...pending)
}

/**
 * `after`, with what changed since `before`, into `container`. The plain
 * preview stays until the first screen of the diff replaces it. Keys are the
 * versions' ids, when they have one (preview/materialize.ts keeps them).
 */
export async function renderDiff(
  container: RenderTarget,
  beforeHtml: string,
  afterHtml: string,
  opts: SliceOptions & { firstBlocks?: number; beforeKey?: string; afterKey?: string } = {},
): Promise<DiffStats> {
  const t0 = performance.now()
  performance.mark("history-diff-start")
  const first = opts.firstBlocks ?? FIRST_BLOCKS
  const b = await versionElements(beforeHtml, { ...opts, key: opts.beforeKey })
  const a = await versionElements(afterHtml, { ...opts, key: opts.afterKey })
  const s = slicer(opts)
  const olds: BlockNode[] = []
  const news: BlockNode[] = []
  for (const [els, into] of [[b.elements, olds], [a.elements, news]] as const) {
    for (const el of els) {
      into.push(blockNode(el))
      if (!s.tick()) await s.next()
    }
  }
  const steps = alignBlocks(olds.map(keyOf), news.map(keyOf))
  // Lining 5,000 blocks up is a slice of its own at 4x CPU (25 ms).
  await s.next()
  const stats = emptyStats(news.length)
  const out: HTMLElement[] = []
  let shown = false
  const flush = () => {
    if (!shown) container.replaceChildren()
    shown = true
    container.append(...out)
    out.length = 0
  }
  for (let k = 0; k < steps.length; k++) {
    const step = steps[k]
    if (step.kind === "removed") out.push(removedCopy(olds[step.a], stats))
    else {
      const neu = news[step.b]
      out.push(...applyStep(step, olds, neu, stats), neu.el)
    }
    s.shown(1)
    // The first screen at once, then a slice at a time.
    if (k >= first && !s.tick()) {
      flush()
      await s.next()
    }
  }
  flush()
  const own = s.done()
  performance.mark("history-diff-end")
  return {
    ...stats,
    ms: performance.now() - t0,
    slices: b.stats.slices + a.stats.slices + own.slices,
    longestSliceMs: Math.max(b.stats.longestSliceMs, a.stats.longestSliceMs, own.longestSliceMs),
  }
}

/**
 * The changes to step through, in order: each run of marked blocks side by
 * side is one stop, and a block marked inside a marked one is part of it.
 */
export function changeTargets(container: HTMLElement): HTMLElement[] {
  const out: HTMLElement[] = []
  let prev: HTMLElement | null = null
  for (const el of Array.from(container.querySelectorAll<HTMLElement>(`[${CHANGE_ATTR}]`))) {
    if (prev?.contains(el)) continue
    if (!prev || prev.nextElementSibling !== el) out.push(el)
    prev = el
  }
  return out
}
