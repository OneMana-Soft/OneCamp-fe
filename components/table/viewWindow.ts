"use client"

import * as React from "react"
import { useVirtualizer } from "@tanstack/react-virtual"
import { rowAtPlace } from "@/lib/tables/viewPlaces"

/**
 * The window a view shows of its rows, for the grid (GridBody) and the
 * phone's list (TableRowList): one virtualizer over the view's places, read
 * or not (tables T5c; lib/tables/viewPlaces says what a place is).
 */

export interface ViewWindowOptions {
  /** How many rows are given: the view's first rows read, then its last `tail`. */
  given: number
  /** How many rows the view has, read or not. */
  count: number
  tail: number
  /** Every row's height: rows are never measured. */
  rowPx: number
  /** A grouped view's: a place's height (a header's is its own), and how many of the rows given it needs read. */
  sizeOf?: (place: number) => number
  readTo?: (place: number) => number
  scrollRef: React.RefObject<HTMLElement | null>
  overscan: number
  /** The rows drawn before the frame has been measured: a screenful. */
  firstScreen: number
  initialRect: { width: number; height: number }
  scrollPaddingStart?: number
  /** How near the last row read the window gets before the view reads on: a few screens. */
  nearEnd: number
  /** The window neared the last row read, or passed it: the place of the last row in sight. */
  onNearEnd?: (last: number) => void
}

/**
 * The places in the window, and the room the places above and below it
 * take, so the scrollbar is the whole view's.
 *
 * Every row is one height (the cells clip), so none is measured: measuring
 * put a ResizeObserver and a layout read on each row the window mounted while
 * scrolling. A row's key for the virtualizer is its place, the virtualizer's
 * own, so it works out every place again only when the count changes. A key
 * function made each render had it do that every scroll tick (1.2 s a tick at
 * 100,000 rows, b15e80557); one made with the rows, each time a window of
 * rows landed.
 */
export function useViewWindow({ given, count, tail, rowPx, sizeOf, readTo, scrollRef, overscan, firstScreen, initialRect, scrollPaddingStart, nearEnd, onNearEnd }: ViewWindowOptions) {
  const size = (i: number) => sizeOf?.(i) ?? rowPx
  const virtualizer = useVirtualizer({
    count,
    getScrollElement: () => scrollRef.current,
    estimateSize: size,
    overscan,
    scrollPaddingStart,
    initialRect,
  })
  // With a new row height, every place moves: worked out again, and drawn.
  // On mount too: that is how the virtualizer finds a scroll box an ancestor
  // draws (the grid's), whose ref is set only after this component's layout
  // effects have run, so the first of them found none.
  React.useEffect(() => {
    virtualizer.measure()
  }, [rowPx, sizeOf, virtualizer])
  const measured = virtualizer.getVirtualItems()
  let end = 0
  const items: { index: number; start: number; end: number }[] =
    measured.length || !count ? measured : Array.from({ length: Math.min(count, firstScreen) }, (_, index) => ({ index, start: end, end: (end += size(index)) }))
  const padTop = items.length ? items[0].start : 0
  const padBottom = items.length ? virtualizer.getTotalSize() - items[items.length - 1].end : 0
  // Within a few screens of the last row read, or past it (a scrollbar
  // dragged): the view reads on, as far as the last place in sight.
  const read = given - tail
  const tailFrom = count - tail
  const last = items.length ? items[items.length - 1].index : -1
  // The last row in sight among those read, or on their way.
  const reached = readTo ? readTo(last) - 1 : Math.min(last, tailFrom - 1)
  React.useEffect(() => {
    if (onNearEnd && count && reached >= read - nearEnd) onNearEnd(reached)
  }, [onNearEnd, count, reached, read, nearEnd])
  const rowAt = React.useCallback((place: number) => rowAtPlace(place, given, count, tail), [given, count, tail])
  return { virtualizer, items, padTop, padBottom, rowAt }
}

/**
 * Each row's element as last drawn, by its id, kept while `same` holds for
 * its props, so React skips the row: a scroll renders the rows entering the
 * window and no other, and a window of rows landing renders none of those
 * drawn. A row in React.memo with a comparator is two components a row.
 */
export function useKeptRows<P>(same: (a: P, b: P) => boolean) {
  const [box] = React.useState(() => ({ current: new Map<string, { props: P; el: React.ReactElement }>() }))
  const drawn = box.current
  const now = new Map<string, { props: P; el: React.ReactElement }>()
  React.useLayoutEffect(() => {
    box.current = now
  })
  return (id: string, props: P, draw: (props: P) => React.ReactElement): React.ReactElement => {
    const kept = drawn.get(id)
    const el = kept && same(kept.props, props) ? kept.el : draw(props)
    now.set(id, { props: kept?.el === el ? kept.props : props, el })
    return el
  }
}
