import { prefersReducedMotion } from "@/lib/reducedMotion"

/**
 * The springy check: 1 -> 1.12 -> 1 over 220 ms on the house curve. For an
 * element the click itself changed; a check that was already ticked when the
 * page loaded never bounces. Returns the animation, or null when it did nothing.
 */
export function springPop(el: Element | null | undefined): Animation | null {
  if (!el || prefersReducedMotion() || typeof (el as HTMLElement).animate !== "function") return null
  return (el as HTMLElement).animate([{ scale: "1" }, { scale: "1.12", offset: 0.45 }, { scale: "1" }], {
    duration: 220,
    easing: "cubic-bezier(0.2, 0.8, 0.2, 1)",
  })
}
