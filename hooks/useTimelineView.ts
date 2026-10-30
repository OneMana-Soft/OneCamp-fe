"use client"

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react"
import { dayAt, firstView, offsetOf, type Range, type ViewAnchor } from "@/lib/timeline"

type Spans = Parameters<typeof firstView>[0]

/**
 * Which days a timeline shows, as people move about it: first where
 * lib/timeline firstView says (the plan in view), then the day in the middle
 * of the view, kept there when the zoom changes, a panel opening beside it
 * narrows it, or the grid grows to the left. Every scroll moves that day,
 * a drag's own included. Shared by a project's timeline and the projects'.
 *
 * nameWidth is the sticky column the grid scrolls under; ready is when the
 * rows and the remembered zoom are in, and the scroller (scrollRef) may come
 * after it: the view is placed and watched from when it does; paused (a drag
 * under way) holds the view still while the timeline is resized.
 */
/** The CSS variable the timeline's scroller keeps its horizontal scroll in. */
export const SCROLL_X = "--timeline-scroll-x"

/**
 * The room a name stuck at the grid's left edge has, as a CSS length: what
 * is left in view of the span it labels, which ends `end` px into the grid
 * and sticks `inset` px in from the names column. Pure.
 */
export function stuckRoom(end: number, inset = 0): string {
  return `max(0px, calc(${end - inset}px - var(${SCROLL_X}, 0px)))`
}

export function useTimelineView({
  scrollRef,
  range,
  dayWidth,
  nameWidth,
  spans,
  today,
  ready,
  paused,
}: {
  scrollRef: RefObject<HTMLDivElement | null>
  range: Range
  dayWidth: number
  nameWidth: number
  spans: Spans
  today: Date
  ready: boolean
  paused?: () => boolean
}) {
  const anchor = useRef<ViewAnchor | null>(null)
  const visibleGrid = () => Math.max((scrollRef.current?.clientWidth ?? 0) - nameWidth, 0)
  const anchorNow = () => (anchor.current ??= firstView(spans, today, visibleGrid() / dayWidth))
  const place = (el: HTMLDivElement) => {
    const { day, at } = anchorNow()
    el.scrollLeft = Math.max(0, offsetOf(day, range, dayWidth) + dayWidth / 2 - visibleGrid() * at)
  }

  const onScroll = () => {
    const el = scrollRef.current
    if (!el) return
    anchor.current = { day: dayAt(el.scrollLeft + visibleGrid() / 2, range, dayWidth), at: 0.5 }
    // How far the grid has scrolled, for the names that stick at its left
    // edge: each one narrows to what is left of its month or bar instead of
    // sliding under the names column ("ptember 2026", PTC-29). A variable,
    // not state: a scroll renders nothing.
    el.style.setProperty(SCROLL_X, `${el.scrollLeft}px`)
  }

  // The scroller itself, as state, from scrollerRef on the caller's scroller
  // (which fills scrollRef too): placing it and watching its width start when
  // it mounts, whatever else holds its drawing back. A project's timeline
  // draws it only once its milestones are in too, which can be after ready;
  // keyed on ready alone, it was then never placed or watched, and a task's
  // panel opening beside it moved its centre day (V-63b, 29 Oct 2026).
  const [scroller, setScroller] = useState<HTMLDivElement | null>(null)
  const scrollerRef = useCallback(
    (el: HTMLDivElement | null) => {
      scrollRef.current = el
      setScroller(el)
    },
    [scrollRef],
  )

  const rangeFrom = range.from.getTime()
  useLayoutEffect(() => {
    if (scroller && ready) place(scroller)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the scroller comes, or the grid's first day or scale changes
  }, [scroller, rangeFrom, dayWidth, ready])

  useEffect(() => {
    const el = scroller
    if (!el || !ready || typeof ResizeObserver === "undefined") return
    let width = el.clientWidth
    const watch = new ResizeObserver(() => {
      if (el.clientWidth === width || paused?.()) return
      width = el.clientWidth
      place(el)
    })
    watch.observe(el)
    return () => watch.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-made when the scroller or the grid changes, as the layout effect is
  }, [scroller, rangeFrom, dayWidth, ready])

  const goToday = () => {
    const el = scrollRef.current
    if (!el) return
    anchor.current = { day: today, at: 1 / 3 }
    const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    el.scrollTo({ left: Math.max(0, offsetOf(today, range, dayWidth) + dayWidth / 2 - visibleGrid() / 3), behavior: reduce ? "auto" : "smooth" })
  }

  return { onScroll, goToday, scrollerRef }
}
