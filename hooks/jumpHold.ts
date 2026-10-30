/** Ends the last jump's hold: a second jump holds its own place. */
let release = () => {}

/**
 * What the person does that takes the page over, so a jump lets go of it:
 * here, and in the watch for a card that draws late (./jumpSeek).
 * pointerdown: taking the scrollbar fires none of the others.
 */
export const TAKE_OVER = ["wheel", "touchstart", "keydown", "pointerdown"] as const

/**
 * Holds a jump's landing in place for `ms` (hooks/useJumpFlash). The page may
 * still be filling in, cards that load after the jump, and the jump could only
 * scroll as far as the page then went: as the page grows, `el` is brought back
 * to its place, unless the person scrolls or types first.
 */
export function hold(el: HTMLElement, into: ScrollIntoViewOptions, ms: number) {
  release()
  const frame = el.closest("[data-page-frame]")
  if (!frame) return
  let height = frame.clientHeight
  const grows = new ResizeObserver(() => {
    if (frame.clientHeight !== height) el.scrollIntoView(into)
    height = frame.clientHeight
  })
  grows.observe(frame)
  const stop = () => {
    grows.disconnect()
    window.clearTimeout(timer)
    for (const type of TAKE_OVER) window.removeEventListener(type, stop)
  }
  for (const type of TAKE_OVER) window.addEventListener(type, stop, { passive: true })
  const timer = window.setTimeout(stop, ms)
  release = stop
}
