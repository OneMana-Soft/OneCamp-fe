/**
 * The page's Tab order, for a Tab pressed in code. A key event made in code
 * (dispatchEvent) gets no browser default, so nothing moves the focus for
 * it: tabStop finds where the browser's Tab would take the focus from an
 * element, and pressTab takes it there. A table's grid plays a Tab held
 * while its cells' code came this way (gridMoves' pressHeld), so the box it
 * leaves saves on its blur, as it would have.
 *
 * The order is the page's (HTML's sequential focus order): elements with a
 * positive tabindex first, by it, then the rest as the page reads. Never an
 * element with a negative tabindex, disabled, inert or hidden, and of a
 * named group of radio buttons only its checked one (else its first, or its
 * last going back), and never one of the group being left. The page's own
 * elements only: not into a frame's page or a shadow root.
 */

const CANDIDATES =
  'a[href],area[href],button,input,select,textarea,iframe,summary,audio[controls],video[controls],[tabindex],[contenteditable]:not([contenteditable="false"])'

/** Whether an element shows: none of it display: none, nor its own visibility hidden. */
function shows(el: HTMLElement): boolean {
  // Every current engine; Chrome before 121 knows the second option by its first name.
  if (typeof el.checkVisibility === "function") return el.checkVisibility({ visibilityProperty: true, checkVisibilityCSS: true })
  for (let at: Element | null = el; at; at = at.parentElement) if (getComputedStyle(at).display === "none") return false
  return getComputedStyle(el).visibility !== "hidden"
}

const radio = (el: Element): el is HTMLInputElement => el instanceof HTMLInputElement && el.type === "radio" && el.name !== ""
const sameGroup = (a: HTMLInputElement, b: Element) => radio(b) && b.name === a.name && b.form === a.form

/** Whether the browser's Tab stops at an element (its group's radio as `group` reads, when it is one). */
function stops(el: HTMLElement, group: (r: HTMLInputElement) => boolean): boolean {
  if (el.tabIndex < 0 || el.closest("[inert]") || el.matches(":disabled")) return false
  if (el instanceof HTMLInputElement && el.type === "hidden") return false
  return (!radio(el) || group(el)) && shows(el)
}

/**
 * Where the browser's Tab (Shift+Tab, `back`) would take the focus from
 * `from`, which may be an element no Tab stops at itself (tabindex -1): the
 * next element it stops at in the page's order, or null when there's none
 * (a Tab then goes to the browser's own controls).
 */
export function tabStop(from: Element, back = false): HTMLElement | null {
  const doc = from.ownerDocument
  const rank = (el: Element) => ((el as HTMLElement).tabIndex > 0 ? (el as HTMLElement).tabIndex : Number.MAX_SAFE_INTEGER)
  const listed = Array.from(doc.querySelectorAll<HTMLElement>(CANDIDATES)).filter((el) => el.tabIndex >= 0 || el === from)
  // An element the list leaves out goes where the page reads it, before what it holds.
  if (!listed.includes(from as HTMLElement)) {
    const at = listed.findIndex((el) => !!(from.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING))
    listed.splice(at < 0 ? listed.length : at, 0, from as HTMLElement)
  }
  const order = listed.map((el, i) => ({ el, i })).sort((a, b) => rank(a.el) - rank(b.el) || a.i - b.i).map(({ el }) => el)
  const leaving = radio(from) ? from : null
  const group = (r: HTMLInputElement): boolean => {
    if (leaving && sameGroup(leaving, r)) return false
    const mates = order.filter((el) => sameGroup(r, el) && stops(el, () => true))
    const checked = mates.find((el) => (el as HTMLInputElement).checked)
    return checked ? checked === r : r === (back ? mates[mates.length - 1] : mates[0])
  }
  const step = back ? -1 : 1
  for (let i = order.indexOf(from as HTMLElement) + step; i >= 0 && i < order.length; i += step) {
    if (order[i] !== from && stops(order[i], group)) return order[i]
  }
  return null
}

/**
 * Moves the focus as the browser's Tab (Shift+Tab, `back`) would from
 * `from` (tabStop), a text field's text selected, as a Tab selects it. With
 * nowhere to stop, the focus leaves `from` (its blur), as a Tab out to the
 * browser's own controls takes it. The element the focus went to, or null.
 */
export function pressTab(from: HTMLElement, back = false): HTMLElement | null {
  const to = tabStop(from, back)
  if (!to) {
    from.blur()
    return null
  }
  to.focus()
  if (to instanceof HTMLInputElement && to.selectionStart !== null) to.select()
  return to
}
