"use client"

import { startTransition, useLayoutEffect, useMemo, useReducer, useRef, useState, type RefObject } from "react"
import { flushSync } from "react-dom"
import { Virtualizer, elementScroll, observeElementOffset, observeElementRect, type Range, type VirtualizerOptions } from "@tanstack/react-virtual"

import type { Flow } from "@/lib/ui/windowedRows"

/**
 * Which part of a long list is near the screen (the windowing scope, 21 Oct
 * 2026), on @tanstack/react-virtual, for a list laid out by
 * lib/ui/windowedRows. The list scrolls in a scroller it shares with what is
 * above it (a page's toolbar, its tabs), so its offset there (the
 * virtualizer's scrollMargin) is measured, and measured again as anything in
 * the scroller changes size. Every item's size is exact, so no row is
 * measured.
 *
 * `window` is null until the list has a scroller and the scroller has a size:
 * the first frame, and jsdom, which lays nothing out (draw a first screen
 * then: windowedRows firstScreen).
 *
 * A list may hand over its scroller late (listWindow: once it is long enough
 * to window), when the reader is already far down the page. The virtualizer
 * scrolls a scroller it is handed to the offset it holds, which it caches
 * from its first read even with no scroller (0, and never reset), so it runs
 * only once it has one, and starts from where that scroller already is.
 *
 * The rows drawn are held (FLUIDITY-24, the J key path): while the screen's
 * rows stay EDGE rows inside them, a scroll draws nothing, not even this
 * hook's host. Past that they move, as many as ever (`overscan` each side)
 * but a half behind and three halves ahead, the way it went, so a key's
 * walk moves them once in ~12 rows; as a transition while the screen still
 * shows only drawn rows (a key's paint and scroll never wait on rows
 * mounting), at once when it shows rows not drawn (a fling, a jump).
 */
export function useWindowedRows({
  flow,
  list,
  scroller,
  overscan = 10,
}: {
  flow: Flow
  /** The list's own box, inside the scroller. */
  list: RefObject<HTMLElement | null>
  scroller: HTMLElement | null
  overscan?: number
}): { window: { first: number; last: number } | null; scrollTo: (index: number) => void } {
  const [margin, setMargin] = useState(0)
  useLayoutEffect(() => {
    const box = list.current
    if (!box || !scroller) return
    const measure = () => setMargin(Math.round(box.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop))
    measure()
    const resized = new ResizeObserver(measure)
    resized.observe(scroller)
    for (const child of Array.from(scroller.children)) resized.observe(child)
    // A section the page adds above the list later moves it as it grows: it is watched too.
    const added = new MutationObserver((records) => {
      for (const r of records) for (const node of Array.from(r.addedNodes)) if (node instanceof Element) resized.observe(node)
      measure()
    })
    added.observe(scroller, { childList: true })
    return () => {
      resized.disconnect()
      added.disconnect()
    }
  }, [list, scroller])

  // The rows drawn, held; and those last drawn, to draw again only when they change.
  const held = useRef<{ first: number; last: number } | null>(null)
  const shown = useRef<{ first: number; last: number } | null>(null)
  const rangeExtractor = useMemo(() => (r: Range) => heldRange(held, r, overscan), [overscan])
  const [, draw] = useReducer((n: number) => n + 1, 0)
  // As @tanstack/react-virtual's useVirtualizer, which draws on every change of the screen's rows (and flushSync while scrolling).
  const options: VirtualizerOptions<HTMLElement, Element> = {
    count: flow.items.length,
    enabled: !!scroller,
    getScrollElement: () => scroller,
    initialOffset: () => scroller?.scrollTop ?? 0,
    estimateSize: (i) => flow.items[i]?.size ?? 0,
    getItemKey: (i) => flow.items[i]?.key ?? i,
    overscan,
    scrollMargin: margin,
    initialRect: { width: 1024, height: 800 },
    observeElementRect,
    observeElementOffset,
    scrollToFn: elementScroll,
    rangeExtractor,
    onChange: (v, sync) => {
      const drawn = v.getVirtualIndexes()
      const was = shown.current
      if (was && was.first === drawn[0] && was.last === drawn[drawn.length - 1]) return
      const screen = v.range
      if (was && screen && screen.startIndex >= was.first && screen.endIndex <= was.last) startTransition(draw)
      else if (sync) flushSync(draw)
      else draw()
    },
  }
  const [virtualizer] = useState(() => new Virtualizer(options))
  virtualizer.setOptions(options)
  useLayoutEffect(() => virtualizer._didMount(), [virtualizer])
  useLayoutEffect(() => virtualizer._willUpdate())
  const items = virtualizer.getVirtualItems()
  const drawnRows = items.length ? { first: items[0].index, last: items[items.length - 1].index } : null
  useLayoutEffect(() => {
    shown.current = drawnRows
  })
  return {
    window: drawnRows,
    scrollTo: (index) => virtualizer.scrollToIndex(index, { align: "auto" }),
  }
}

/** How near the screen's rows may come to the edge of the rows drawn before these move. */
const EDGE = 3

/**
 * The rows to draw for the screen's rows `r`, from those held: kept while the
 * screen stays EDGE rows inside them (or reaches the list's end), else moved
 * to the screen's rows and 2 x `overscan` more, a quarter behind and three
 * quarters ahead the way it went (half each way the first time).
 */
function heldRange(held: { current: { first: number; last: number } | null }, r: Range, overscan: number): number[] {
  const end = r.count - 1
  const h = held.current
  const near = { first: Math.max(0, r.startIndex - EDGE), last: Math.min(end, r.endIndex + EDGE) }
  let next = h
  if (!next || near.first < next.first || near.last > next.last || next.last > end) {
    const down = !!h && near.last > h.last
    const up = !!h && near.first < h.first && !down
    const behind = Math.round(overscan / 2)
    next = held.current = {
      first: Math.max(0, r.startIndex - (down ? behind : up ? 2 * overscan - behind : overscan)),
      last: Math.min(end, r.endIndex + (up ? behind : down ? 2 * overscan - behind : overscan)),
    }
  }
  const { first, last } = next
  return Array.from({ length: last - first + 1 }, (_, i) => first + i)
}
