"use client"

import { useEffect, useLayoutEffect, useRef, type RefObject } from "react"
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
 * rows and the remembered zoom are in; paused (a drag under way) holds the
 * view still while the timeline is resized.
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

  const rangeFrom = range.from.getTime()
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (el && ready) place(el)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the grid's first day or scale changes
  }, [rangeFrom, dayWidth, ready])

  useEffect(() => {
    const el = scrollRef.current
    if (!el || !ready || typeof ResizeObserver === "undefined") return
    let width = el.clientWidth
    const watch = new ResizeObserver(() => {
      if (el.clientWidth === width || paused?.()) return
      width = el.clientWidth
      place(el)
    })
    watch.observe(el)
    return () => watch.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-made when the grid changes, as the layout effect is
  }, [rangeFrom, dayWidth, ready])

  const goToday = () => {
    const el = scrollRef.current
    if (!el) return
    anchor.current = { day: today, at: 1 / 3 }
    const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    el.scrollTo({ left: Math.max(0, offsetOf(today, range, dayWidth) + dayWidth / 2 - visibleGrid() / 3), behavior: reduce ? "auto" : "smooth" })
  }

  return { onScroll, goToday }
}
