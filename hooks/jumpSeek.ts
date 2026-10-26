import { flashCard, linked } from "./useJumpFlash"

/**
 * What the person does that takes the page over, so the watch lets go of it.
 * pointerdown: taking the scrollbar fires none of the others.
 */
const TAKE_OVER = ["wheel", "touchstart", "keydown", "pointerdown"] as const

/** Ends the last watch: a jump watches for one card at a time. */
let release = () => {}

/**
 * Watches for a linked card that wasn't there when the page looked
 * (hooks/useJumpFlash). Its code and data load on their own, and a section may
 * wait for its own read: the admins' notice links to the earlier imports'
 * section, which draws once its read answers. It is looked for every 250 ms
 * and landed the first time it is there, once. The watch lets go once the
 * person takes the page over (a read that answers late can't pull the page
 * from under them), once the link names another card, and after half a
 * minute. Returns its stop.
 */
export function watch(id: string): () => void {
  release()
  let looks = 0
  let timer: number | undefined
  const stop = () => {
    window.clearTimeout(timer)
    for (const type of TAKE_OVER) window.removeEventListener(type, stop, true)
  }
  const look = () => {
    if (linked() !== id || flashCard(id) || ++looks >= 120) stop()
    else timer = window.setTimeout(look, 250)
  }
  // In the capture phase, so a key or a press that a component keeps to
  // itself still counts.
  for (const type of TAKE_OVER) window.addEventListener(type, stop, { capture: true, passive: true })
  timer = window.setTimeout(look, 250)
  release = stop
  return stop
}
