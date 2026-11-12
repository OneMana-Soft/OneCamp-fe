/**
 * Keeps the field being typed in, in a sheet, in sight over the on-screen
 * keyboard, as an app's sheet does (the phone pair, 10 Nov).
 *
 * While the keyboard is up, app/phone.css stands every sheet on it and fits
 * it to what is left (lib/ui/visualViewport's followKeyboard), so the sheet's
 * scroller gets shorter while the field it holds stays where it was: below
 * the scroller's new foot, under the pinned footer or behind the keyboard. A
 * record's last field, tapped in the lower half of the screen, was hidden as
 * the keyboard came up. This scrolls the scroller, and only it, so the field
 * shows whole, each time the scroller gets shorter with one of its fields
 * focused and as a field in it takes focus with the keyboard up. With the
 * keyboard down it does nothing (a computer's narrow window, a pinch-zoom).
 */

/** What a field kept in sight keeps clear of the scroller's edges: the 12px
 *  fade a pinned footer draws over the scroller's foot (app/phone.css), and 4px. */
export const FIELD_ROOM_PX = 16

type Edges = { top: number; bottom: number }

/**
 * The mark followKeyboard (lib/ui/visualViewport) writes on <html> while it fits the app's frame to the keyboard,
 * data-keyboard="open": read here off the page, as app/phone.css reads it. Not imported from there: that module is
 * the signed-in shell's, and a sheet's lazy chunk importing a shell module made Turbopack regroup unchanged modules
 * into new chunks (the phone pair, 11 Nov).
 */
const KEYBOARD_MARK = "data-keyboard"
const frameFitted = (doc: Document) => doc.documentElement.getAttribute(KEYBOARD_MARK) === "open"

/**
 * How far a scroller scrolls (down is positive) for a field in it to show
 * whole in its box, `room` clear of its edges; 0 when it already does. A
 * field taller than the box keeps its top in sight. Pure.
 */
export function revealBy(field: Edges, box: Edges, room = FIELD_ROOM_PX): number {
  const above = field.top - room - box.top
  if (above < 0) return Math.round(above)
  const below = field.bottom + room - box.bottom
  return below > 0 ? Math.round(Math.min(below, above)) : 0
}

/** Follows `scroller` as above, from now: a field in it focused already is kept in sight at once. Returns the cleanup. */
export function keepFieldInSight(scroller: HTMLElement): () => void {
  const doc = scroller.ownerDocument
  const win = doc.defaultView
  // Read first in the observer's own first call, after layout: a read here, as a sheet mounts, forced one.
  let height = -1
  let frame = 0
  const reveal = () => {
    frame = 0
    // The frame is fitted only while a field that brings the keyboard up has focus (followKeyboard). Asking
    // bringsUpKeyboard here too made the shell's visualViewport export it: every /app route moved (11 Nov).
    const field = doc.activeElement
    if (!field || !scroller.contains(field) || !frameFitted(doc)) return
    const top = scroller.getBoundingClientRect().top + scroller.clientTop
    const by = revealBy(field.getBoundingClientRect(), { top, bottom: top + scroller.clientHeight })
    if (by) scroller.scrollTop += by
  }
  // After layout, before the frame is drawn: the field never shows hidden first.
  const resized = () => {
    const was = height
    height = scroller.clientHeight
    if (was >= 0 && height < was) reveal()
  }
  // A field taking focus is brought in by the browser first, as it sees the screen; then here, over the keyboard.
  // The frame's fit as the keyboard comes up, too: a page the keyboard resizes (Android) may shrink the scroller
  // a frame before the fit is written.
  const soon = () => {
    if (!frame && win) frame = win.requestAnimationFrame(reveal)
  }
  const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(resized) : null
  ro?.observe(scroller)
  scroller.addEventListener("focusin", soon)
  // followKeyboard writes its mark in a frame of its own, after the viewport's events: each fit and each let-go.
  const fit = new MutationObserver(soon)
  fit.observe(doc.documentElement, { attributes: true, attributeFilter: [KEYBOARD_MARK] })
  // Started with a field focused already (one autofocused as its surface mounts, the keyboard up), it acts at once.
  if (scroller.contains(doc.activeElement)) soon()
  return () => {
    ro?.disconnect()
    fit.disconnect()
    scroller.removeEventListener("focusin", soon)
    if (frame && win) win.cancelAnimationFrame(frame)
  }
}

/** The scrollers a field is kept in sight in: an overlay's body (components/ui/overlay) and a sheet's (components/ui/drawer). */
const SCROLLER = "[data-overlay-body], [data-sheet-body]"

/**
 * A surface's ref, on its own box in a sheet's or a dialog's body: keeps the field being typed in there in sight over
 * the keyboard. Out of the signed-in shell (app/firstLoad.test SHELL_LAZY): the surface's own lazy chunk brings it, not
 * the Drawer nor OverlayBody, which ninety-odd chunks carry (11 Nov): the record sheet (components/table/RecordPanel),
 * Colour rules and Add column (components/table). Not the responsive dialog's sheet (components/ui/responsive-sheet):
 * its ref made Turbopack regroup unchanged modules into new chunks, ~38 KB gz in all (the phone pair, 11 Nov).
 */
export function fieldInSightRef(el: HTMLElement | null): (() => void) | undefined {
  const scroller = el?.closest<HTMLElement>(SCROLLER)
  return scroller ? keepFieldInSight(scroller) : undefined
}
