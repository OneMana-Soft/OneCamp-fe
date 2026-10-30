"use client"

import { useEffect, type RefObject } from "react"

/**
 * Whether the pointer is busy: the page scrolling under it, or a drag
 * carrying it. A row a scroll carries under a resting pointer gets
 * pointerenter, and mounting its hover controls then cost 9,000 to 17,000
 * renders a scroll (FLUIDITY-LEAD, 20 Oct 2026): it asks isBusyPointer()
 * first, and wakes on pointermove. One passive listener records the time.
 */

/** How long after the last scroll event the page counts as still scrolling: a janky frame or two of a wheel's glide. */
export const SCROLL_SETTLE_MS = 150

let lastScroll = Number.NEGATIVE_INFINITY
let listening = false

/** Starts the page's scroll watch, once. Scroll doesn't bubble; the capture phase sees every scroller's. */
export function watchScrolling(): void {
  if (listening || typeof window === "undefined") return
  listening = true
  window.addEventListener(
    "scroll",
    () => {
      lastScroll = performance.now()
    },
    { capture: true, passive: true },
  )
}

/** Starts the watch as a list mounts, so its first scroll counts. */
export function useScrolling(): void {
  useEffect(watchScrolling, [])
}

/** Whether something on the page scrolled within the last SCROLL_SETTLE_MS. */
export function isScrolling(): boolean {
  watchScrolling()
  return performance.now() - lastScroll < SCROLL_SETTLE_MS
}

/** Whether a drag carries the pointer (lib/ui/dnd's data-dragging). */
export function isDragging(): boolean {
  return typeof document !== "undefined" && document.documentElement.hasAttribute("data-dragging")
}

/** Whether a pointer event comes from a scroll or a drag, not someone pointing. */
export function isBusyPointer(): boolean {
  return isScrolling() || isDragging()
}

/** What waits for each moving list to settle (whenListStill). */
const waiting = new WeakMap<Element, Set<() => void>>()

/**
 * Marks a list's scroller data-list-moving from its first scroll until it has
 * been still for SCROLL_SETTLE_MS, the page's settle. A list that moves
 * carries its rows under a resting pointer, and each one lit and built its
 * hover controls as it passed. virtua turned the rows' pointer events off
 * instead, so a press just after a scroll went nowhere
 * (patches/virtua@0.41.5.patch). Now presses and taps land at all times, and
 * the rows' hover waits for the mark: their looks through the settled:
 * variant (app/globals.css), their controls through whenListStill.
 *
 * The end is the quiet after the last scroll, never the browser's scrollend:
 * Chromium sends one after each turn of a wheel, and a spin's next turn comes
 * a few frames later, so ended there the move stopped and began again between
 * turns, and the rows under the pointer lit at each. Returns the undo, so it
 * is a ref callback too.
 */
export function watchListMoving(el: HTMLElement | null): (() => void) | undefined {
  if (!el) return undefined
  let settle = 0
  const still = () => {
    window.clearTimeout(settle)
    if (!el.hasAttribute("data-list-moving")) return
    el.removeAttribute("data-list-moving")
    const fns = waiting.get(el)
    waiting.delete(el)
    fns?.forEach((fn) => fn())
  }
  const moved = () => {
    if (!el.hasAttribute("data-list-moving")) el.setAttribute("data-list-moving", "")
    window.clearTimeout(settle)
    settle = window.setTimeout(still, SCROLL_SETTLE_MS)
  }
  el.addEventListener("scroll", moved, { passive: true })
  return () => {
    el.removeEventListener("scroll", moved)
    still()
  }
}

/** watchListMoving for a list whose scroller is a ref, while it is mounted. */
export function useListMoving(ref: RefObject<HTMLElement | null>): void {
  useEffect(() => watchListMoving(ref.current), [ref])
}

/** Runs `fn` now if `row`'s list is still, or once it settles (watchListMoving). */
export function whenListStill(row: Element, fn: () => void): void {
  const list = row.closest("[data-list-moving]")
  if (!list) return fn()
  const fns = waiting.get(list) ?? new Set<() => void>()
  fns.add(fn)
  waiting.set(list, fns)
}
