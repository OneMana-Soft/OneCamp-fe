/**
 * The stage's reflow (hub.md C4): when someone joins or leaves, or the layout
 * switches between grid and speaker, every tile that moved slides from where
 * it was to where it is, by transform (translate and scale) over 240ms on the
 * in-out curve. Never by animating width or height: the stage is the busiest
 * surface in the app and must not lay itself out on every frame.
 *
 * Tiles are matched by data-flip-key (a participant's identity and source).
 */
import { prefersReducedMotion } from "@/lib/reducedMotion"

export type TileRects = Map<string, DOMRect>

export const STAGE_FLIP_MS = 240
const EASE_IO = "cubic-bezier(0.65, 0, 0.35, 1)"

export function captureTiles(stage: Element): TileRects {
  const out: TileRects = new Map()
  stage.querySelectorAll<HTMLElement>("[data-flip-key]").forEach((el) => out.set(el.dataset.flipKey!, el.getBoundingClientRect()))
  return out
}

/** The transform that puts a tile now at `to` back where it was at `from`. Pure. */
export function invert(from: DOMRect, to: DOMRect): string | null {
  const dx = from.left - to.left
  const dy = from.top - to.top
  const sx = to.width ? from.width / to.width : 1
  const sy = to.height ? from.height / to.height : 1
  if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5 && Math.abs(sx - 1) < 0.01 && Math.abs(sy - 1) < 0.01) return null
  return `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`
}

/**
 * Plays each moved tile from its old box to its new one; a tile that has just
 * joined pops in from .96. Returns how many tiles animated.
 */
export function flipTiles(stage: Element, before: TileRects): number {
  if (prefersReducedMotion()) return 0
  let n = 0
  stage.querySelectorAll<HTMLElement>("[data-flip-key]").forEach((el) => {
    if (typeof el.animate !== "function") return
    const was = before.get(el.dataset.flipKey!)
    if (!was) {
      if (before.size === 0) return
      n++
      el.animate([{ opacity: 0, transform: "scale(0.96)" }, { opacity: 1, transform: "none" }], { duration: 180, easing: "cubic-bezier(0.22, 1, 0.36, 1)" })
      return
    }
    const from = invert(was, el.getBoundingClientRect())
    if (!from) return
    n++
    el.animate([{ transformOrigin: "top left", transform: from }, { transformOrigin: "top left", transform: "none" }], { duration: STAGE_FLIP_MS, easing: EASE_IO })
  })
  return n
}
