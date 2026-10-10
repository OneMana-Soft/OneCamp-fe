/**
 * The celebration burst and the springy check (the playful layer, "Motion").
 *
 * celebrate(el) is for the few moments worth it: a task done, a first message,
 * an import finished, a checklist completed. Never for routine actions, or it
 * stops meaning anything. 6 to 10 camp-hued sparks leave the element's centre
 * and fade within 300 to 500 ms. springPop(el) is the 1 -> 1.12 -> 1 bounce of
 * a check that has just been ticked.
 *
 * Both are Web Animations on elements appended for the purpose, so there is no
 * dependency, nothing re-renders, and nothing is left in the page. Both do
 * nothing at all for someone who asked for reduced motion, and nothing where
 * the browser has no Web Animations.
 */
import { CAMP_HUES } from "@/lib/campHue"

/** A four-point spark, the motif's (components/ui/graphics/Spark). */
const SPARK = "M5 0Q5.6 4.4 10 5Q5.6 5.6 5 10Q4.4 5.6 0 5Q4.4 4.4 5 0Z"
const SVG = "http://www.w3.org/2000/svg"
const EASE = "cubic-bezier(0.2, 0.8, 0.2, 1)"

/** True when there is no window to animate in, or the person asked for less motion. */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return true
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches
}

export interface CelebrateOptions {
  /** How many sparks, 6 to 10 (8 by default). */
  count?: number
}

/**
 * Bursts camp-hued sparks from the middle of `el`. Returns how many it
 * launched: 0 when it did nothing (no element, reduced motion, no Web
 * Animations).
 *
 *   onClick={(e) => { if (!done) celebrate(e.currentTarget); complete() }}
 */
export function celebrate(el: Element | null | undefined, { count = 8 }: CelebrateOptions = {}): number {
  if (!el || typeof document === "undefined" || prefersReducedMotion()) return 0
  const layer = document.createElement("div")
  if (typeof layer.animate !== "function") return 0

  const n = Math.min(10, Math.max(6, Math.round(count)))
  const box = el.getBoundingClientRect()
  layer.setAttribute("aria-hidden", "true")
  layer.setAttribute("data-celebrate", "")
  layer.style.cssText = [
    "position:fixed",
    `left:${box.left + box.width / 2}px`,
    `top:${box.top + box.height / 2}px`,
    "width:0",
    "height:0",
    "pointer-events:none",
    "z-index:var(--z-toast, 800)",
  ].join(";")
  document.body.appendChild(layer)

  const animations: Animation[] = []
  for (let i = 0; i < n; i++) {
    const hue = CAMP_HUES[i % CAMP_HUES.length]
    // Evenly round the circle, nudged off the grid so it reads as a burst,
    // not a clock face; three reaches and two sizes for depth.
    const angle = (i / n) * Math.PI * 2 + (i % 2 ? 0.18 : -0.12) - Math.PI / 2
    const reach = 22 + (i % 3) * 7
    const size = i % 3 === 1 ? 6 : 9
    const dx = Math.cos(angle) * reach
    const dy = Math.sin(angle) * reach
    const spark = document.createElementNS(SVG, "svg")
    spark.setAttribute("viewBox", "0 0 10 10")
    spark.setAttribute("width", String(size))
    spark.setAttribute("height", String(size))
    spark.style.cssText = `position:absolute;left:${-size / 2}px;top:${-size / 2}px;fill:var(--camp-${hue});overflow:visible`
    const path = document.createElementNS(SVG, "path")
    path.setAttribute("d", SPARK)
    spark.appendChild(path)
    layer.appendChild(spark)
    animations.push(
      spark.animate(
        [
          { transform: "translate(0, 0) scale(0.4) rotate(0deg)", opacity: 1 },
          { transform: `translate(${dx * 0.8}px, ${dy * 0.8}px) scale(1) rotate(45deg)`, opacity: 1, offset: 0.6 },
          { transform: `translate(${dx}px, ${dy}px) scale(0.6) rotate(90deg)`, opacity: 0 },
        ],
        // 300 to 500 ms, staggered so the sparks do not land as one.
        { duration: 300 + ((i * 53) % 201), easing: EASE, fill: "forwards" },
      ),
    )
  }

  let removed = false
  const remove = () => {
    if (removed) return
    removed = true
    layer.remove()
  }
  Promise.all(animations.map((a) => a.finished)).then(remove, remove)
  // A safety net: an animation the tab paused would otherwise leave the layer.
  window.setTimeout(remove, 700)
  return n
}

/**
 * The springy check: 1 -> 1.12 -> 1 over 220 ms on the house curve. For an
 * element the click itself changed; a check that was already ticked when the
 * page loaded never bounces. Returns the animation, or null when it did nothing.
 */
export function springPop(el: Element | null | undefined): Animation | null {
  if (!el || prefersReducedMotion() || typeof (el as HTMLElement).animate !== "function") return null
  return (el as HTMLElement).animate([{ scale: "1" }, { scale: "1.12", offset: 0.45 }, { scale: "1" }], {
    duration: 220,
    easing: EASE,
  })
}
