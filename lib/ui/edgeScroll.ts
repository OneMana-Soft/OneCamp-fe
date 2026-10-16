/**
 * THE EDGE SCROLL (INTERACTION_SPEC.md §2.5): a drag that nears a scroller's
 * edge scrolls it, 48px from the edge under a pointer and 64px under a finger,
 * the speed ramping from 0 at the zone's inner side to 18px a frame at the
 * edge, on both axes, the innermost scroller first. One helper for every drag:
 * lib/ui/dnd.ts (@dnd-kit), the doc's blocks (blockDrag.ts) and the calendar.
 * No @dnd-kit import, so a custom engine pulls nothing in with it.
 */
export const EDGE_SCROLL = { zone: { pointer: 48, touch: 64 }, maxSpeed: 18 } as const

export interface EdgeBox {
  top: number
  right: number
  bottom: number
  left: number
}

/** One frame's scroll for a pointer at (x, y) over `box`: negative is up or left. */
export function edgeSpeed(box: EdgeBox, x: number, y: number, touch = false): { dx: number; dy: number } {
  const zone = touch ? EDGE_SCROLL.zone.touch : EDGE_SCROLL.zone.pointer
  const ramp = (d: number) => (d < zone ? Math.round(EDGE_SCROLL.maxSpeed * (1 - Math.max(0, d) / zone)) : 0)
  return { dx: ramp(box.right - x) - ramp(x - box.left), dy: ramp(box.bottom - y) - ramp(y - box.top) }
}

const scrolls = (el: Element) => {
  const s = getComputedStyle(el)
  return (/(auto|scroll)/.test(s.overflowX) && el.scrollWidth > el.clientWidth) || (/(auto|scroll)/.test(s.overflowY) && el.scrollHeight > el.clientHeight)
}

/** The scrollers under (x, y), innermost first, skipping what `skip` names (the lifted copy). */
export function scrollersAt(x: number, y: number, skip?: (el: Element) => boolean): Element[] {
  const hit = document.elementsFromPoint(x, y).find((el) => !skip?.(el))
  const out: Element[] = []
  for (let el = hit ?? null; el && el !== document.documentElement && el !== document.body; el = el.parentElement) if (scrolls(el)) out.push(el)
  const root = document.scrollingElement
  if (root && (root.scrollHeight > root.clientHeight || root.scrollWidth > root.clientWidth)) out.push(root)
  return out
}

const boxOf = (el: Element): EdgeBox => (el === document.scrollingElement ? { top: 0, left: 0, right: window.innerWidth, bottom: window.innerHeight } : el.getBoundingClientRect())

/**
 * Keeps scrolling, once a frame, while a dragged pointer rests in an edge
 * zone. With `scroller`, that one only (null: none); with no argument, the
 * scrollers under the pointer, innermost first, the first that can still move
 * that way. `onScrolled` runs after each step that moved, so an engine reads
 * again what lies under a still pointer.
 */
export function edgeScroller(scroller?: Element | null, onScrolled?: () => void, skip?: (el: Element) => boolean) {
  let at: { x: number; y: number; touch: boolean; under?: Element[] } | null = null
  let frame = 0
  const step = () => {
    frame = 0
    if (!at) return
    const list = scroller !== undefined ? (scroller ? [scroller] : []) : (at.under ??= scrollersAt(at.x, at.y, skip))
    for (const el of list) {
      const { dx, dy } = edgeSpeed(boxOf(el), at.x, at.y, at.touch)
      if (!dx && !dy) continue
      const left = el.scrollLeft
      const top = el.scrollTop
      el.scrollLeft = left + dx
      el.scrollTop = top + dy
      if (el.scrollLeft !== left || el.scrollTop !== top) {
        onScrolled?.()
        frame = requestAnimationFrame(step)
        return
      }
    }
  }
  return {
    /** Where the pointer is now; a finger gets the wider zone. */
    follow(x: number, y: number, touch = false) {
      at = { x, y, touch }
      if (!frame) frame = requestAnimationFrame(step)
    },
    stop() {
      at = null
      cancelAnimationFrame(frame)
      frame = 0
    },
  }
}
