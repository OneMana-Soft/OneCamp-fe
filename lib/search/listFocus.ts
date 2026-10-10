/**
 * Moves the keyboard through a list of search results, the rows marked
 * [data-search-result]: down from the box into the first, and on from there.
 * Returns false at either end, so the caller can hand focus back to the box.
 */
export function moveListFocus(container: HTMLElement, dir: 1 | -1): boolean {
  const items = Array.from(container.querySelectorAll<HTMLElement>("[data-search-result]"))
  if (items.length === 0) return false
  const at = items.indexOf(container.ownerDocument.activeElement as HTMLElement)
  const next = at === -1 ? (dir === 1 ? 0 : items.length - 1) : at + dir
  if (next < 0 || next >= items.length) return false
  items[next].focus()
  return true
}
