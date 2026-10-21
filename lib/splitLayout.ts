import { MAIN, MAIN_KEY, MAX_PANES, isCallPane, isPaneList, keyOf, paneKey, same, type Pane } from "@/lib/split"

// Split view's rules for many views, the shell's alone (design/split/ANALYSIS.md:
// W width, T tuck, L least recently used, O order, S sizes, P persistence). Pure.

/** A view's least width (the right panel's too), and a seam's. */
export const MIN_VIEW_PX = 360
export const SEAM_PX = 8

/** Views that fit side by side in `px` (W): one to four. */
export const viewsThatFit = (px: number) => Math.max(1, Math.min(MAX_PANES + 1, Math.floor((px + SEAM_PX) / (MIN_VIEW_PX + SEAM_PX))))

/**
 * Panes after opening one (L): past `max` the least recently used (`used`:
 * keys, latest first; else the oldest) closes, one at most, never a call
 * (that hangs it up). A new call replaces the one beside.
 */
export function withPane(panes: Pane[], p: Pane, max = MAX_PANES, used: string[] = []): Pane[] {
  if (panes.some((x) => same(x, p))) return panes
  const next = [...(isCallPane(p) ? panes.filter((x) => !isCallPane(x)) : panes), p]
  if (next.length <= max) return next
  const age = (x: Pane) => (used.includes(paneKey(x)) ? used.indexOf(paneKey(x)) : Infinity)
  let out = -1
  next.forEach((x, i) => {
    if (x !== p && !isCallPane(x) && (out < 0 || age(x) > age(next[out]))) out = i
  })
  if (out >= 0) next.splice(out, 1)
  return next
}

/** The views left to right (O), from their keys in `order`; any missing go last. */
export function viewRow(panes: Pane[], order: readonly string[]): number[] {
  const keys = [MAIN_KEY, ...panes.map(paneKey)]
  const row: number[] = []
  for (const k of [...order, ...keys]) {
    const i = keys.indexOf(k)
    if (i >= 0 && !row.includes(i - 1)) row.push(i - 1)
  }
  return row
}

/** The order with `view` at position `to`. */
export function moveTo(panes: Pane[], order: readonly string[], view: number, to: number): string[] {
  const row = viewRow(panes, order).filter((v) => v !== view)
  row.splice(Math.max(0, Math.min(to, row.length)), 0, view)
  return row.map((v) => keyOf(panes, v))
}

/** The order with two views swapped. */
export function swapIn(panes: Pane[], order: readonly string[], a: number, b: number): string[] {
  const row = viewRow(panes, order)
  const i = row.indexOf(a)
  const j = row.indexOf(b)
  if (i >= 0 && j >= 0) [row[i], row[j]] = [row[j], row[i]]
  return row.map((v) => keyOf(panes, v))
}

/** The views on screen when `fit` fit (T): the active one, a call, then by use. */
export function shownViews(panes: Pane[], row: number[], used: readonly string[], active: number, fit: number): number[] {
  const call = panes.findIndex(isCallPane)
  const byUse = used.map((k) => row.find((v) => keyOf(panes, v) === k))
  const pick: number[] = []
  for (const v of [active, ...(call >= 0 ? [call] : []), ...byUse, ...row]) {
    if (v !== undefined && row.includes(v) && !pick.includes(v) && pick.length < fit) pick.push(v)
  }
  return row.filter((v) => pick.includes(v))
}

/** Widths (S) sharing `total`: kept shares, an even one for a new view, none under `min`. */
export function shares(keys: string[], sizes: Readonly<Record<string, number>>, total: number, min: number): number[] {
  const n = keys.length
  const even = total / Math.max(1, n)
  const known = keys.filter((k) => sizes[k] > 0)
  const sum = known.reduce((a, k) => a + sizes[k], 0)
  const room = total - (n - known.length) * even
  const out = keys.map((k) => (sizes[k] > 0 ? (sizes[k] / sum) * room : even))
  for (let i = 0; i < n; i++) {
    let need = min - out[i]
    if (need <= 0) continue
    out[i] = min
    while (need > 1e-9) {
      const j = out.reduce((w, x, k) => (x > out[w] ? k : w), 0)
      const give = Math.min(need, out[j] - min)
      if (give <= 0) break
      out[j] -= give
      need -= give
    }
  }
  return out
}

/** What a browser keeps (P). */
export interface SavedSplit {
  panes: Pane[]
  order: string[]
  sizes: Record<string, number>
}

/** A kept layout, or null; the bare list kept before 20 Oct 2026 still reads. */
export function readSplit(v: unknown): SavedSplit | null {
  if (isPaneList(v)) return { panes: v, order: [], sizes: {} }
  const o = (v ?? {}) as Partial<Record<keyof SavedSplit, unknown>>
  if (!isPaneList(o.panes)) return null
  const order = Array.isArray(o.order) ? o.order.filter((k): k is string => typeof k === "string") : []
  const sizes = Object.fromEntries(Object.entries(o.sizes ?? {}).filter(([, n]) => typeof n === "number" && n > 0 && n <= 100))
  return { panes: o.panes, order, sizes }
}

/** The view `by` along from `from`, wrapping. */
export function stepView(row: number[], from: number, by: 1 | -1): number {
  const i = Math.max(0, row.indexOf(from)) + by
  return row[((i % row.length) + row.length) % row.length]
}

