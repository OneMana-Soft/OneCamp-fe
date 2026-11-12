/**
 * A long list drawn only near the screen (the windowing scope, 21 Oct 2026):
 * its geometry, pure. useWindowedRows (lib/ui/useWindowedRows.ts) finds the
 * window on @tanstack/react-virtual; this lays a grouped list's flow out and
 * says, for each group, what to draw and the space around it.
 *
 * Every item's size is exact (a row 40 px, a header or "Show N more" 36 px on
 * a computer), so nothing is measured. The space a group's list doesn't draw
 * is padding on the list, before and after, never a transform: FLIP and L-1's
 * "make room" move rows by transform, and rows stay the list's direct
 * children. Rows kept drawn away from the window (the focused, opened, held
 * and highlighted ones, an open menu's, the "+" field) carry the space above
 * them as their own top margin, so no spacer joins the list's flow.
 */

/** One thing in a list's flow, in order. */
export interface FlowItem {
  /** Unique in the flow: a row's id, or its group's key and what it is. */
  key: string
  /** The group it belongs to. */
  group: string
  /** A group's header sits outside the group's list, and is always drawn. */
  header?: boolean
  /** A task's row: what the keys step over. */
  row?: boolean
  /** Its height in px, exact. */
  size: number
}

export interface Flow {
  items: FlowItem[]
  /** Each item's top from the list's top. */
  starts: number[]
  total: number
  /** An item's index by its key. */
  index: Map<string, number>
}

/** The flow laid out: where each item starts, the whole height, and each key's index. */
export function layFlow(items: FlowItem[]): Flow {
  const starts: number[] = new Array(items.length)
  const index = new Map<string, number>()
  let at = 0
  items.forEach((item, i) => {
    starts[i] = at
    at += item.size
    index.set(item.key, i)
  })
  return { items, starts, total: at, index }
}

/** The indexes from `first` to `last` (the window, overscan included) and the kept ones, once each, in order. */
export function drawnIndexes(count: number, window: { first: number; last: number } | null, kept: Iterable<number>): number[] {
  const out = new Set<number>()
  if (window) for (let i = Math.max(0, window.first); i <= Math.min(count - 1, window.last); i++) out.add(i)
  for (const i of kept) if (i >= 0 && i < count) out.add(i)
  return [...out].sort((a, b) => a - b)
}

/** One group's list in a window: the space before its first drawn item and after its last, and each drawn item with the space above it since the one before. */
export interface GroupPlan {
  before: number
  after: number
  drawn: { key: string; gap: number }[]
}

/**
 * Each group's plan for drawing `drawn` (sorted indexes; headers among them are
 * skipped, being always drawn). A group with nothing drawn keeps its list's
 * whole height as `before`, so the page scrolls the same.
 */
export function planGroups(flow: Flow, drawn: number[]): Map<string, GroupPlan> {
  const plans = new Map<string, GroupPlan>()
  // Each group's list: where it starts and ends.
  const spans = new Map<string, { start: number; end: number }>()
  flow.items.forEach((item, i) => {
    if (item.header) return
    const top = flow.starts[i]
    const span = spans.get(item.group)
    if (span) span.end = top + item.size
    else spans.set(item.group, { start: top, end: top + item.size })
  })
  const reached = new Map<string, number>()
  for (const i of drawn) {
    const item = flow.items[i]
    if (!item || item.header) continue
    const span = spans.get(item.group)
    if (!span) continue
    const top = flow.starts[i]
    let plan = plans.get(item.group)
    if (!plan) {
      plan = { before: top - span.start, after: 0, drawn: [] }
      plans.set(item.group, plan)
      plan.drawn.push({ key: item.key, gap: 0 })
    } else {
      plan.drawn.push({ key: item.key, gap: top - (reached.get(item.group) ?? top) })
    }
    reached.set(item.group, top + item.size)
  }
  for (const [group, span] of spans) {
    const plan = plans.get(group)
    if (plan) plan.after = span.end - (reached.get(group) ?? span.end)
    else plans.set(group, { before: span.end - span.start, after: 0, drawn: [] })
  }
  return plans
}

/**
 * Where to draw before the window is known (the first frame, or jsdom, which
 * lays nothing out): the top `screen` px of the flow, overscan included.
 */
export function firstScreen(flow: Flow, screen: number): { first: number; last: number } {
  let last = -1
  while (last + 1 < flow.items.length && flow.starts[last + 1] < screen) last++
  return { first: 0, last }
}
