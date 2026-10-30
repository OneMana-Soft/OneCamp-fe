"use client"

/**
 * What "What needs me now" resolved on this page, and what it shows, held
 * where Home's greeting line reads them, so the two never disagree
 * (design-01). The list keeps its own when no page holds it.
 */
import { createContext, useCallback, useMemo, useState } from "react"
import type { NeedsItem } from "@/components/home/needsMe"

/** What the list shows: its rows still waiting, and whether it is loading or its read failed. */
export interface NeedsShown {
  items: NeedsItem[]
  loading: boolean
  failed: boolean
}

export interface NeedsGone {
  gone: ReadonlyMap<string, NeedsItem>
  mark(item: NeedsItem): void
  unmark(id: string): void
  /** What the list shows, once it has drawn; null before. */
  shown: NeedsShown | null
  /** Called by the list as it draws. The same rows again change nothing. */
  show(next: NeedsShown): void
}

/** The same for the line: rows by id, kind and overdue, and the same states. Pure. */
export function sameShown(a: NeedsShown | null, b: NeedsShown): boolean {
  if (!a || a.loading !== b.loading || a.failed !== b.failed || a.items.length !== b.items.length) return false
  return a.items.every((x, i) => {
    const y = b.items[i]
    return x.id === y.id && x.kind === y.kind && !!x.overdue === !!y.overdue
  })
}

export const NeedsGoneContext = createContext<NeedsGone | null>(null)

/** The state a page holds for its list and its greeting. */
export function useNeedsGoneState(): NeedsGone {
  const [gone, setGone] = useState<ReadonlyMap<string, NeedsItem>>(() => new Map())
  const mark = useCallback((item: NeedsItem) => setGone((g) => new Map(g).set(item.id, item)), [])
  const unmark = useCallback(
    (id: string) =>
      setGone((g) => {
        if (!g.has(id)) return g
        const n = new Map(g)
        n.delete(id)
        return n
      }),
    [],
  )
  const [shown, setShown] = useState<NeedsShown | null>(null)
  const show = useCallback((next: NeedsShown) => setShown((prev) => (sameShown(prev, next) ? prev : next)), [])
  return useMemo(() => ({ gone, mark, unmark, shown, show }), [gone, mark, unmark, shown, show])
}
