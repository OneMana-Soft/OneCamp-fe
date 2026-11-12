/** The scroll container `el` is in: itself or its nearest ancestor that scrolls (overflow auto or scroll). */
export function scrollerOf(el: Element | null): HTMLElement | null {
  for (let p = el; p; p = p.parentElement) {
    if (p instanceof HTMLElement && /(auto|scroll)/.test(getComputedStyle(p).overflowY)) return p
  }
  return null
}
