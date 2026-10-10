/**
 * Keeps the app on the part of the screen the on-screen keyboard leaves.
 *
 * A phone's keyboard shrinks only the VISUAL viewport. iOS has always done
 * that, and Chrome on Android does it too since version 108: the layout
 * viewport, and with it 100dvh, stay full height, so anything on the bottom
 * edge (a channel's composer, a task's comment box) ends up behind the
 * keyboard, and iOS pans the whole page up to reveal the caret, taking the top
 * bar off the screen with it.
 *
 * Android is put back the way it was in layout.tsx (interactive-widget=
 * resizes-content: the keyboard resizes the page, so 100dvh is the room left).
 * iOS ignores that, so while the keyboard is up this fits the app's frame,
 * marked data-app-viewport, to the visible area: its height is the visual
 * viewport's and it follows iOS's pan. globals.css does the fitting from two
 * variables written here, on <html>, outside React, so a keyboard opening
 * re-renders nothing.
 *
 * With the keyboard down nothing is written at all, and the frame is the plain
 * 100dvh it always was: the address bar showing and hiding, a desktop window
 * being resized, a pinch-zoom, none of them changes the layout.
 */

/** A drop in the visible height smaller than this is a toolbar, not a keyboard.
 *  Safari's toolbars and Android's address bar move it by 50 to 100px; a phone
 *  keyboard takes 260px or more. */
export const KEYBOARD_MIN_PX = 150

export interface ViewportSample {
  /** visualViewport.height */
  height: number
  /** visualViewport.offsetTop: how far iOS has panned the page to show the caret. */
  offsetTop: number
  /** visualViewport.scale: above 1 the person has pinch-zoomed. */
  scale: number
  /** Whether something that brings up a keyboard has focus. */
  editing: boolean
}

export interface KeyboardFit {
  open: boolean
  /** The visible height, in px, while open. */
  height: number
  /** How far down the visible area starts, in px, while open. */
  top: number
}

const CLOSED: KeyboardFit = { open: false, height: 0, top: 0 }

/**
 * Whether the keyboard is up and, if it is, the box the app should fit.
 * `tallest` is the tallest visible height seen at this width: the screen with
 * no keyboard. Pure.
 */
export function keyboardFit(sample: ViewportSample, tallest: number): KeyboardFit {
  // Zoomed in, the visual viewport is small because the person made it so.
  if (!sample.editing || sample.scale > 1.01) return CLOSED
  if (tallest - sample.height < KEYBOARD_MIN_PX) return CLOSED
  return { open: true, height: Math.round(sample.height), top: Math.max(0, Math.round(sample.offsetTop)) }
}

/** True when this element brings up an on-screen keyboard when focused. */
export function bringsUpKeyboard(el: Element | null): boolean {
  if (!el) return false
  if ((el as HTMLElement).isContentEditable) return true
  if (el.tagName === "TEXTAREA") return !(el as HTMLTextAreaElement).readOnly
  if (el.tagName !== "INPUT") return false
  const input = el as HTMLInputElement
  if (input.readOnly || input.disabled) return false
  return !/^(button|checkbox|color|file|hidden|image|radio|range|reset|submit)$/i.test(input.type)
}

type Win = Pick<Window, "visualViewport" | "innerWidth" | "document" | "requestAnimationFrame" | "cancelAnimationFrame">

/**
 * Follows the visual viewport and writes --app-vvh, --app-vv-top and
 * data-keyboard="open" on <html> while the keyboard is up. Returns the
 * cleanup. Does nothing where there is no visualViewport.
 */
export function followKeyboard(win: Win = window): () => void {
  const vv = win.visualViewport
  if (!vv) return () => {}
  const doc = win.document
  const root = doc.documentElement
  let tallest = 0
  let width = -1
  let frame = 0
  let written = "closed"

  const write = (fit: KeyboardFit) => {
    const key = fit.open ? `${fit.height}:${fit.top}` : "closed"
    if (key === written) return
    written = key
    if (fit.open) {
      root.style.setProperty("--app-vvh", `${fit.height}px`)
      root.style.setProperty("--app-vv-top", `${fit.top}px`)
      root.setAttribute("data-keyboard", "open")
    } else {
      root.style.removeProperty("--app-vvh")
      root.style.removeProperty("--app-vv-top")
      root.removeAttribute("data-keyboard")
    }
  }

  const measure = () => {
    frame = 0
    // A new width is a rotation: the tallest height starts over.
    if (win.innerWidth !== width) {
      width = win.innerWidth
      tallest = 0
    }
    if (vv.scale <= 1.01) tallest = Math.max(tallest, vv.height)
    write(keyboardFit({ height: vv.height, offsetTop: vv.offsetTop, scale: vv.scale, editing: bringsUpKeyboard(doc.activeElement) }, tallest))
  }
  // One write a frame, however many events the keyboard's animation sends.
  const schedule = () => {
    if (!frame) frame = win.requestAnimationFrame(measure)
  }

  vv.addEventListener("resize", schedule)
  vv.addEventListener("scroll", schedule)
  doc.addEventListener("focusin", schedule)
  doc.addEventListener("focusout", schedule)
  measure()

  return () => {
    vv.removeEventListener("resize", schedule)
    vv.removeEventListener("scroll", schedule)
    doc.removeEventListener("focusin", schedule)
    doc.removeEventListener("focusout", schedule)
    if (frame) win.cancelAnimationFrame(frame)
    write(CLOSED)
  }
}
