/**
 * FLIP for the hub's lists: when a row leaves or a block opens, the rows that
 * follow move to their new places by transform, never by animating height
 * (hub.md §1.1, `resolve`; app/motionCost.test.ts).
 *
 * captureRects() reads where each child of a container is, before the change;
 * playFlip() runs after the change has been laid out, puts every child that
 * moved back where it was with a transform, and lets it go to its new place
 * over 200ms on the in-out curve. Children are matched by data-flip-key, or by
 * their key in document order when none is set.
 */
import { prefersReducedMotion } from "@/lib/reducedMotion"

export type Rects = Map<string, DOMRect>

const FLIP_MS = 200
const EASE_IO = "cubic-bezier(0.65, 0, 0.35, 1)"

function keyOf(el: Element, i: number): string {
  return (el as HTMLElement).dataset?.flipKey ?? `#${i}`
}

export function captureRects(container: Element): Rects {
  const out: Rects = new Map()
  Array.from(container.children).forEach((el, i) => out.set(keyOf(el, i), el.getBoundingClientRect()))
  return out
}

/** Plays the move from `before` to where the children are now. Returns how many moved. */
export function playFlip(container: Element, before: Rects, duration = FLIP_MS): number {
  if (prefersReducedMotion()) return 0
  let moved = 0
  Array.from(container.children).forEach((el, i) => {
    const was = before.get(keyOf(el, i))
    if (!was || typeof (el as HTMLElement).animate !== "function") return
    const now = el.getBoundingClientRect()
    const dy = was.top - now.top
    if (Math.abs(dy) < 0.5) return
    moved++
    ;(el as HTMLElement).animate([{ transform: `translateY(${dy}px)` }, { transform: "none" }], { duration, easing: EASE_IO })
  })
  return moved
}
