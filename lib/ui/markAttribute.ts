/**
 * An attribute a component puts on elements it doesn't draw (an overlay's
 * column, the boxes around a part of the page printed alone), so that CSS
 * keys on the mark instead of finding those elements by :has(), which Chrome
 * tries on every element of every page (app/selectorKeyGuard.test.ts).
 *
 * Marks are counted per element and name: two components marking one element
 * each push an undo, and the mark comes off with the last. A mark written by
 * hand stays the page's own.
 */
const marked = new WeakMap<Element, Map<string, number>>()

export function markAttribute(el: Element | null | undefined, name: string, undo: Array<() => void>) {
  if (!el) return
  const counts = marked.get(el) ?? new Map<string, number>()
  if (!counts.get(name) && el.hasAttribute(name)) return
  marked.set(el, counts)
  counts.set(name, (counts.get(name) ?? 0) + 1)
  el.setAttribute(name, "")
  undo.push(() => {
    const n = (counts.get(name) ?? 1) - 1
    counts.set(name, n)
    if (n <= 0) el.removeAttribute(name)
  })
}
