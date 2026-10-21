import { anchorTo } from "@/components/ui/anchor"

/**
 * A place measured once, kept beside an element as the page scrolls or
 * reflows: a block menu stands where its handle was clicked, in viewport px,
 * and the block it belongs to moves with the doc. The rect moves as `el` has
 * moved since it was measured, and floating-ui listens to `el`'s scrolling
 * (components/ui/anchor). Without `el` it is the place as it was; once `el`
 * has gone, the last place it was seen. Not first-load code: the cards that
 * hold a place this way load on first use.
 */
export function heldBeside(rect: DOMRectReadOnly, el: Element | null | undefined) {
  const then = el?.getBoundingClientRect()
  return anchorTo(
    () => {
      if (!then) return rect
      const now = el?.isConnected ? el.getBoundingClientRect() : null
      // An element hidden (display: none) measures nothing: no place from it.
      return now && (now.width || now.height) ? new DOMRect(rect.x + now.x - then.x, rect.y + now.y - then.y, rect.width, rect.height) : null
    },
    () => el,
  )
}
