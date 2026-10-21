"use client"

import { useEffect } from "react"

/**
 * Whether the pointer is busy: the page is scrolling under it, or a drag is
 * carrying it (lib/ui/dnd marks the document data-dragging).
 *
 * A list scrolled under a resting pointer sends pointerenter to every row
 * that passes beneath it. A row that mounts its hover controls on that event
 * mounted them in each row it crossed: 9,000 to 17,000 renders a scroll on
 * the 2,000-task list (FLUIDITY-LEAD, 20 Oct 2026). Such a row asks
 * isBusyPointer() first. It goes live on pointermove as well, so a pointer
 * that rests after the scroll wakes it as soon as it moves.
 *
 * One passive listener for the whole page, which only records the time: no
 * state, no render and no timer per scroll.
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

/** Starts the scroll watch when a surface mounts (a list), so the first scroll under the pointer already counts. */
export function useScrolling(): void {
  useEffect(watchScrolling, [])
}

/** Whether something on the page scrolled within the last SCROLL_SETTLE_MS. */
export function isScrolling(): boolean {
  watchScrolling()
  return performance.now() - lastScroll < SCROLL_SETTLE_MS
}

/** Whether a pointer event now comes from a scroll or a drag rather than from someone pointing. */
export function isBusyPointer(): boolean {
  return isScrolling() || (typeof document !== "undefined" && document.documentElement.hasAttribute("data-dragging"))
}
