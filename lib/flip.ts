/**
 * FLIP: measure, change, invert, play (work.md §1.5). A row that moves to
 * another group, a card that settles in a column, a chain of timeline bars
 * that shift along: each is measured before the change and, once the DOM has
 * its new place, animated from where it was to where it is, by transform
 * only, with the Web Animations API. Nothing re-renders for it and height is
 * never animated (motionCost.test.ts).
 *
 * Elements take part by carrying data-flip-id; ids are compared across the
 * two measurements, so an element React re-created in its new group still
 * travels.
 *
 *   const rects = measureFlip(list)
 *   applyChange()                 // React commits
 *   // in a layout effect:
 *   playFlip(list, rects, { duration: 240 })
 *
 * Under reduced motion, or without Web Animations, it does nothing: things
 * are simply where they are.
 */
import { prefersReducedMotion } from "@/lib/reducedMotion"

export type FlipRects = Map<string, DOMRect>

const SELECTOR = "[data-flip-id]"

/** Where each [data-flip-id] inside root is now. */
export function measureFlip(root: ParentNode | null | undefined): FlipRects {
  const rects: FlipRects = new Map()
  if (!root) return rects
  root.querySelectorAll<HTMLElement>(SELECTOR).forEach((el) => {
    const id = el.dataset.flipId
    if (id) rects.set(id, el.getBoundingClientRect())
  })
  return rects
}

export interface FlipOptions {
  /** ms; the settle move is 240 (work.md §1.3). */
  duration?: number
  easing?: string
  /** ms between elements, for a chain that visibly follows (timeline shift-along: 30). */
  stagger?: number
  /** Only these ids move; the others jump. */
  only?: Set<string>
}

/**
 * Plays every element inside root from where `before` saw it to where it is
 * now. Returns how many moved. Elements that appeared or left are not
 * animated (their callers fade them).
 */
export function playFlip(root: ParentNode | null | undefined, before: FlipRects, { duration = 240, easing = "cubic-bezier(0.65, 0, 0.35, 1)", stagger = 0, only }: FlipOptions = {}): number {
  if (!root || before.size === 0 || prefersReducedMotion()) return 0
  let moved = 0
  root.querySelectorAll<HTMLElement>(SELECTOR).forEach((el) => {
    const id = el.dataset.flipId
    if (!id || (only && !only.has(id))) return
    const was = before.get(id)
    if (!was || typeof el.animate !== "function") return
    const now = el.getBoundingClientRect()
    const dx = was.left - now.left
    const dy = was.top - now.top
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return
    el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "translate(0, 0)" }], {
      duration,
      easing,
      delay: moved * stagger,
      fill: "backwards",
    })
    moved++
  })
  return moved
}

/**
 * Plays one element from dx, dy pixels away back to where it is: for a view
 * that knows where things were from its data rather than a measurement (the
 * timeline's bars, laid out by date). Same rules: transform only, nothing
 * under reduced motion. Returns whether it moved.
 */
export function flipBy(el: HTMLElement | null | undefined, dx: number, dy: number, { duration = 240, easing = "cubic-bezier(0.65, 0, 0.35, 1)", delay = 0 }: { duration?: number; easing?: string; delay?: number } = {}): boolean {
  if (!el || typeof el.animate !== "function" || prefersReducedMotion()) return false
  if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return false
  el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "translate(0, 0)" }], { duration, easing, delay, fill: "backwards" })
  return true
}
