/**
 * Marks a scroller data-more-above and data-more-below while it has more to
 * show that way, so the overlay layout's header and footer draw a hairline
 * only then (app/overlay.css 4). Returns the undo, so it is a ref callback too.
 */
export function watchMore(el: HTMLElement | null): (() => void) | undefined {
  if (!el) return undefined
  const measure = () => {
    el.toggleAttribute("data-more-above", el.scrollTop > 0)
    el.toggleAttribute("data-more-below", el.scrollTop + el.clientHeight < el.scrollHeight - 1)
  }
  measure()
  el.addEventListener("scroll", measure, { passive: true })
  const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null
  ro?.observe(el)
  // What it holds: a sheet's base draws no box (display: contents), so what is in it.
  const content = el.firstElementChild
  const box = content && getComputedStyle(content).display === "contents" ? content.firstElementChild : content
  if (box) ro?.observe(box)
  return () => {
    el.removeEventListener("scroll", measure)
    ro?.disconnect()
  }
}
