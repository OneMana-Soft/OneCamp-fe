import { useEffect, type RefObject } from "react"

/** The scroll container a sticky element pins to: its nearest ancestor that scrolls (overflow auto or scroll). */
function scrollerOf(el: HTMLElement): HTMLElement | null {
  for (let p = el.parentElement; p; p = p.parentElement) {
    if (/(auto|scroll)/.test(getComputedStyle(p).overflowY)) return p
  }
  return null
}

/**
 * A bar pinned over the top of its page's scroller (position: sticky, top 0)
 * covers whatever scrolls under it. While it's pinned, its height is the
 * scroller's top scroll padding, so what the page brings into sight (a row a
 * find steps to, with scrollIntoView, or a field taking focus) stops under the
 * bar rather than behind it. A bar in the page's flow, as on a computer,
 * leaves the scroller's padding as it was. The padding follows the bar's
 * height (a row it opens or closes), and goes when the bar goes.
 *
 * Why (G2b-2, DESIGN-BUILD-67 MUST 1): a phone's find bar sat in the page's
 * flow above the list, so a step that scrolled the page to bring its row in
 * carried the bar's field and count up under the app's bar and the demo's
 * banner. Pinned, the bar stays whole, and this keeps a step back up from
 * leaving its row behind it.
 */
export function usePinnedPad(ref: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const el = ref.current
    if (!el) return
    let padded: HTMLElement | null = null
    const pad = () => {
      if (getComputedStyle(el).position === "sticky") {
        padded ??= scrollerOf(el)
        if (padded) padded.style.scrollPaddingTop = `${el.offsetHeight}px`
      } else if (padded) {
        padded.style.scrollPaddingTop = ""
        padded = null
      }
    }
    pad()
    const sized = new ResizeObserver(pad)
    sized.observe(el)
    return () => {
      sized.disconnect()
      if (padded) padded.style.scrollPaddingTop = ""
    }
  }, [ref])
}
