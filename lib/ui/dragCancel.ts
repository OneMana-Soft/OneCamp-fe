import { onEscape } from "@/lib/keys/onEscape"

/**
 * Listens, for as long as one pointer drag is live, for the ways it ends
 * without landing, and calls `cancel` for each. Returns the function that
 * stops listening: call it when the drag ends, either way.
 *
 * - Escape: the person calls it off, and what was dragged goes back to where
 *   it started. The drag layer of the one Escape (lib/keys/escape) hears the
 *   key before anything else and stops it there, so a card or a panel under
 *   the drag doesn't close as well.
 * - pointercancel: the browser took the pointer for itself (a scroll or a
 *   pinch on a touch screen), and no pointerup will come. Left alone, the
 *   drag stays live, and the next tap anywhere lands it.
 * - lostpointercapture at `holder`, the element the drag holds the pointer
 *   with, or after `holder` has left the page: the capture is gone without a
 *   pointerup. A capture lost elsewhere is the browser handing the pointer
 *   from the pressed element to `holder`, and isn't an end.
 *
 * `cancel` may run twice (a pointercancel is followed by its capture's loss,
 * and a pointerup by its capture's release): it puts back what is still live,
 * and so does nothing the second time.
 */
export function onDragCancel(cancel: () => void, holder?: Element | null): () => void {
  const stopEscape = onEscape("drag", () => cancel())
  const taken = () => cancel()
  const lost = (e: Event) => {
    if (holder && (e.target === holder || !holder.isConnected)) cancel()
  }
  window.addEventListener("pointercancel", taken, true)
  window.addEventListener("lostpointercapture", lost, true)
  return () => {
    stopEscape()
    window.removeEventListener("pointercancel", taken, true)
    window.removeEventListener("lostpointercapture", lost, true)
  }
}
