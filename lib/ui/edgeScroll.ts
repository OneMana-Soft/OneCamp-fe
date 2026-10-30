/**
 * THE EDGE SCROLL (INTERACTION_SPEC.md §2.5): a drag that nears a scroller's
 * edge scrolls it, 48px from the edge under a pointer and 64px under a finger,
 * the speed ramping from 0 at the zone's inner side to 18px a frame at the
 * edge, on both axes, the innermost scroller first. One helper for every drag:
 * lib/ui/dnd.ts (@dnd-kit), the doc's blocks (blockDrag.ts), the calendar and
 * a project timeline's bars.
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

export interface EdgeOptions {
  /** How far in from each side the zone starts: a column drawn over the scroller's edge (a timeline's names). */
  inset?: Partial<EdgeBox>
  /** The one way it scrolls, for a drag that moves one way only (a timeline's bar, by days). */
  axis?: "x" | "y"
}

/** How long the scrollers found under a pointer are kept while it stays inside the innermost: a nested one it enters is found within this. */
export const HIT_KEEP_MS = 150

const inside = (b: EdgeBox, x: number, y: number) => x >= b.left && x <= b.right && y >= b.top && y <= b.bottom

/**
 * Keeps scrolling, once a frame, while a dragged pointer rests in an edge
 * zone. With `scroller`, that one only (null: none); with no argument, the
 * scrollers under the pointer, innermost first, the first that can still move
 * that way. `onScrolled` runs after each step that moved, so an engine reads
 * again what lies under a still pointer.
 *
 * Finding the scrollers under the pointer is a hit test and a read of every
 * ancestor's style: 3 to 8 ms a frame on a long list, every frame of a drag.
 * So they are kept, with their boxes, while the pointer stays inside the
 * innermost, for HIT_KEEP_MS at most, and until one of them scrolls.
 */
export function edgeScroller(scroller?: Element | null, onScrolled?: () => void, skip?: (el: Element) => boolean, { inset, axis }: EdgeOptions = {}) {
  let at: { x: number; y: number; touch: boolean } | null = null
  let under: { list: Element[]; boxes: EdgeBox[]; when: number } | null = null
  let frame = 0
  const step = () => {
    frame = 0
    if (!at) return
    let list: Element[]
    let boxes: EdgeBox[] | null = null
    if (scroller !== undefined) list = scroller ? [scroller] : []
    else {
      const now = performance.now()
      if (!under || now - under.when > HIT_KEEP_MS || (under.boxes[0] && !inside(under.boxes[0], at.x, at.y))) {
        const found = scrollersAt(at.x, at.y, skip)
        under = { list: found, boxes: found.map(boxOf), when: now }
      }
      list = under.list
      boxes = under.boxes
    }
    for (let i = 0; i < list.length; i++) {
      const el = list[i]
      const b = boxes?.[i] ?? boxOf(el)
      const box = inset ? { top: b.top + (inset.top ?? 0), right: b.right - (inset.right ?? 0), bottom: b.bottom - (inset.bottom ?? 0), left: b.left + (inset.left ?? 0) } : b
      const speed = edgeSpeed(box, at.x, at.y, at.touch)
      const dx = axis === "y" ? 0 : speed.dx
      const dy = axis === "x" ? 0 : speed.dy
      if (!dx && !dy) continue
      const left = el.scrollLeft
      const top = el.scrollTop
      el.scrollLeft = left + dx
      el.scrollTop = top + dy
      if (el.scrollLeft !== left || el.scrollTop !== top) {
        // What scrolls moves the scrollers inside it: found again next time.
        under = null
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
      under = null
      cancelAnimationFrame(frame)
      frame = 0
    },
  }
}
