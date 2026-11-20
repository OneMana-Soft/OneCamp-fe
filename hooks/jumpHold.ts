import { placeOf } from "./useJumpFlash"

/** Ends the last jump's hold: a second jump holds its own place. */
let release = () => {}

/**
 * What the person does that takes the page over, so a jump lets go of it:
 * here, and in the watch for a card that draws late (./jumpSeek).
 * pointerdown: taking the scrollbar fires none of the others.
 */
export const TAKE_OVER = ["wheel", "touchstart", "keydown", "pointerdown"] as const

/**
 * How long a landing is held: as long as a card that draws late is watched
 * for (./jumpSeek), since the page may fill in for as long (a read that
 * answers late, on a slow network or a busy server). Only a move of the
 * landing itself brings it back, so a longer hold moves nothing else.
 */
const HOLD_MS = 30_000

/**
 * Holds a jump's landing in place (hooks/useJumpFlash). The page may still be
 * filling in, cards that load after the jump, and the jump could only scroll
 * as far as the page then went. `at` is where `el` sat down its page at the
 * jump (placeOf): whenever it is found anywhere else, because a card above it
 * filled in (even before this code arrived), it is brought back, until the
 * person scrolls, presses or types, jumps again, or HOLD_MS has passed.
 */
export function hold(el: HTMLElement, into: ScrollIntoViewOptions, at: number | null) {
  release()
  const frame = el.closest("[data-page-frame]")
  if (!frame || at === null) return
  let landed = at
  const back = () => {
    const now = placeOf(el)
    if (now === null) return stop()
    if (Math.abs(now - landed) < 1) return
    landed = now
    el.scrollIntoView(into)
  }
  const grows = new ResizeObserver(back)
  grows.observe(frame)
  const stop = () => {
    grows.disconnect()
    window.clearTimeout(timer)
    for (const type of TAKE_OVER) window.removeEventListener(type, stop, true)
  }
  // In the capture phase, as ./jumpSeek: a key or a press that a component
  // keeps to itself still counts.
  for (const type of TAKE_OVER) window.addEventListener(type, stop, { capture: true, passive: true })
  const timer = window.setTimeout(stop, HOLD_MS)
  release = stop
  back()
}
