import { isStillMove } from "@/lib/ui/stillArrival"

/** A windowed list's own order and reveal, for the keys (hooks/useListKeyboard); components/task/listWindow lends it. */
export interface ListNav {
  order: () => string[]
  has: (id: string) => boolean
  /** Into view and, unless `focus` is false, focused once drawn. */
  reveal: (id: string, focus?: boolean) => void
}

const navs = new WeakMap<Element, ListNav>()

/**
 * The keys' mark (V-1054): a key that moves a list's cursor marks the list's root data-kbd-nav, and while it is
 * there the row-hover variants (app/globals.css) hold a row's hover look. A key's scroll carries rows under a
 * resting pointer and the browser moves :hover with them, so without it a second row lit beside the keys' cursor.
 * The pointer's first real move or press takes it off; a move to where the pointer already was is the page moving
 * under it (lib/ui/stillArrival), and leaves it. Written once a streak, on and off, so the list restyles for it
 * twice a streak, never per key.
 */
export function keysDrive(list: Element): void {
  if (!pointerWatched) {
    pointerWatched = true
    window.addEventListener("pointermove", pointerTakes, { capture: true, passive: true })
    window.addEventListener("pointerdown", pointerTakes, { capture: true, passive: true })
  }
  if (list.hasAttribute(KEYS_MARK)) return
  list.setAttribute(KEYS_MARK, "")
  driven.add(list)
}

/**
 * Lets go of a list the keys marked: the mark off and the list out of the hold. For a list that goes while marked
 * (J, then Enter or a g-shortcut away): only a pointer event empties the hold, and a keyboard-only user sends none.
 */
export function keysRelease(list: Element): void {
  if (driven.delete(list)) list.removeAttribute(KEYS_MARK)
}

const KEYS_MARK = "data-kbd-nav"
const driven = new Set<Element>()
let pointerWatched = false

function pointerTakes(e: PointerEvent): void {
  if (driven.size === 0 || isStillMove(e)) return
  for (const list of driven) list.removeAttribute(KEYS_MARK)
  driven.clear()
}

/** Lends a [data-grouped-list] its nav; returns how to take it back. */
export function lendListNav(list: Element, nav: ListNav): () => void {
  navs.set(list, nav)
  return () => void (navs.get(list) === nav && navs.delete(list))
}

export function listNavIn(root: Element): ListNav | null {
  const list = root.matches("[data-grouped-list]") ? root : root.querySelector("[data-grouped-list]")
  return (list && navs.get(list)) ?? null
}

/**
 * A key's row: focused, unless `focus` is false, and brought into view, with nothing of the page's layout read in
 * the key's task (fluid-17 part 2). scrollIntoView and a focus that scrolls read the layout right after the key lit
 * its row, so each J forced the page's style and layout over again. The focus comes first and scrolls nothing, so
 * the key's light and focus are styled once, in the frame; and in that frame, before it paints, scrollIntoView
 * ("nearest") brings the row in, with the frame's own style and layout, done a little earlier. Keys faster than a
 * frame: only the last one's row is brought in, once; a row gone from the page by then is left alone.
 */
export function revealRow(row: HTMLElement, focus = true): void {
  if (focus) focusHolding(row)
  wanted = row
  if (frame) cancelAnimationFrame(frame)
  frame = requestAnimationFrame(bringWanted)
}

/**
 * A write of a list's focus listeners (the keys' place, the light box's Tab stop: hooks/useListKeyboard), made as a
 * key's focus() runs: held until it returns, then run once, in order. A write in a focus listener lands between
 * focus()'s own steps, so the browser restyled for it inside the key's task (forced recalcs and a layout per J);
 * afterwards it is styled with the key's light, once, in the frame. With no key's focus under way (a click's, Tab's)
 * a write runs at once, as before.
 */
export function afterFocus(write: () => void): void {
  if (holding) held.push(write)
  else write()
}

let holding = 0
let held: Array<() => void> = []

function focusHolding(row: HTMLElement) {
  holding++
  try {
    row.focus({ preventScroll: true })
  } finally {
    // A throw in focus() still runs what it held and holds nothing after; a reveal inside a focus waits for the outer.
    if (--holding === 0) runHeld()
  }
}

function runHeld() {
  // Still holding while they run, so a write a held write makes goes after the rest, in order.
  holding++
  try {
    for (let i = 0; i < held.length; i++) {
      try {
        held[i]()
      } catch (error) {
        // As a listener's own throw: reported, and the other writes still run.
        queueMicrotask(() => {
          throw error
        })
      }
    }
  } finally {
    held = []
    holding--
  }
}

let wanted: Element | null = null
let frame = 0

function bringWanted() {
  frame = 0
  const row = wanted
  wanted = null
  // The platform's own "nearest", both ways (scroll-padding and scroll-margin kept): it reads the layout the frame
  // lays out anyway, and scrolls each box the row sits in only as far as shows it wholly.
  if (row?.isConnected) row.scrollIntoView({ block: "nearest", inline: "nearest" })
}
