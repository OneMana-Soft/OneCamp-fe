/**
 * MAKE ROOM (INTERACTION_SPEC.md §5.1: "siblings make room over 160 ms"):
 * while a row is held, the items past its slot sit lower by its height, so
 * the lifted copy sits in an open slot rather than over a neighbour.
 * app/interaction.css draws it by transform only: a [data-room-flow] item
 * slides (160 ms), a [data-room-shift] one sits lower by its --room. No React
 * and no @dnd-kit: a list's drag (components/task/listReorder) writes it
 * straight on the page, so a step renders nothing, and a step of one row
 * writes one item.
 *
 * Cheap at 60 fps on a long list: --room is set on each item, as a
 * registered property that isn't inherited (on the list it restyled every
 * element inside it, 12,000 on a 200-row list), and the list gives only the
 * items on screen (each item whose transform comes or goes is laid out again).
 */

/** Where a row of the list lies (its layout, without the room), top to bottom. */
export interface Span {
  top: number
  bottom: number
}

/**
 * The slot under y, the held copy's middle: before the row y is over, or,
 * between rows or past them (a group's header, "Show 5 more"), on the side of
 * the nearest row within `reach`. Null further off. The rows' own places
 * decide, never where the room has drawn them, so the slot doesn't flicker
 * as rows slide.
 */
export function slotAt(rows: readonly Span[], y: number, reach: number): { row: number; after: boolean } | null {
  // The first row that ends below y: the one y is over, or the next one down.
  let lo = 0
  let hi = rows.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (rows[mid].bottom <= y) lo = mid + 1
    else hi = mid
  }
  const below = rows[lo]
  if (below && y >= below.top) return { row: lo, after: false }
  const up = lo > 0 ? y - rows[lo - 1].bottom : Infinity
  const down = below ? below.top - y : Infinity
  if (Math.min(up, down) > reach) return null
  return down <= up ? { row: lo, after: false } : { row: lo - 1, after: true }
}

export interface Room {
  /** The list's items in order, read again (a scroll; rows a windowed list drew): the next `open` checks them all. */
  items(next: readonly HTMLElement[]): void
  /** Opens the slot before item `from`, which moves down with every item after it; null: none moves. */
  open(from: number | null): void
  /** Every item back: sliding (`slide`, a cancel), or at once, so a drop's FLIP plays from where they were drawn. */
  close(slide: boolean): void
}

const FLOW = "data-room-flow"
const SHIFT = "data-room-shift"
/** The slide back (--ix-lift, 160 ms) and a frame: then the items lose their transition. */
const BACK_MS = 200

/** The room a held row of `height` px makes. */
export function makeRoom(height: number): Room {
  const room = `${height}px`
  const marked = new Set<HTMLElement>()
  let flow: readonly HTMLElement[] = []
  // The items from `at` on sit lower (flow.length: none); -1 after new items, so all are checked.
  let at = -1
  let timer = 0
  const shift = (el: HTMLElement, on: boolean) => {
    if (on) el.setAttribute(SHIFT, "")
    else el.removeAttribute(SHIFT)
  }
  const drop = (el: HTMLElement) => {
    el.removeAttribute(FLOW)
    el.removeAttribute(SHIFT)
    el.style.removeProperty("--room")
    marked.delete(el)
  }
  return {
    items(next) {
      const keep = new Set(next)
      for (const el of marked) if (!keep.has(el)) drop(el)
      for (const el of next)
        if (!marked.has(el)) {
          el.style.setProperty("--room", room)
          el.setAttribute(FLOW, "")
          marked.add(el)
        }
      flow = next
      at = -1
    },
    open(from) {
      window.clearTimeout(timer)
      const to = from === null ? flow.length : Math.max(0, Math.min(from, flow.length))
      // New items: each is checked, and written only if it's wrong. Otherwise
      // only the items between the last slot and this one change.
      const [lo, hi] = at < 0 ? [0, flow.length] : [Math.min(at, to), Math.max(at, to)]
      for (let i = lo; i < hi; i++) if (flow[i].hasAttribute(SHIFT) !== i >= to) shift(flow[i], i >= to)
      at = to
    },
    close(slide) {
      window.clearTimeout(timer)
      const done = () => {
        for (const el of [...marked]) drop(el)
      }
      if (!slide) return done()
      for (const el of marked) el.removeAttribute(SHIFT)
      at = flow.length
      timer = window.setTimeout(done, BACK_MS)
    },
  }
}
