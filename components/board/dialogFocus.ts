import * as React from "react"

/**
 * Keeps the keyboard's focus inside Excalidraw's dialogs (V-362).
 *
 * Excalidraw's own buttons (a picture's PNG, SVG and copy) disable themselves
 * while what they started takes more than 50 ms, and a browser drops a
 * disabled control's focus to the page. Escape then no longer reached the
 * dialog, which hears keys on itself, and Tab left it: on a big board or a
 * busy laptop, after every picture.
 *
 * So when a control in a dialog is disabled while it has focus, the dialog's
 * content takes focus (Excalidraw makes it focusable, without a ring), and
 * the control gets it back once it's enabled again, unless the person moved
 * focus meanwhile: then it stays where they put it, even when that is back
 * on the dialog's content, which is a tab stop.
 */
const DIALOG = ".Modal__content"

/** Installs the keeper on doc; returns its uninstall. */
export function keepDialogFocus(doc: Document = document): () => void {
  // The dialog content holding a disabled control's focus, while the keeper means to give it back.
  let held: HTMLElement | null = null
  let release = () => {}
  const onFocusOut = (e: FocusEvent) => {
    const control = e.target
    // Focus that went somewhere was moved on purpose; only a disabled control's drop to nothing is caught.
    if (e.relatedTarget || !(control instanceof HTMLElement) || !control.matches(":disabled")) return
    const holder = control.closest<HTMLElement>(DIALOG)
    if (!holder) return
    release()
    held = holder
    holder.focus({ preventScroll: true })
    // Back to the control once it's enabled again, if focus is still where the keeper put it (a control that went
    // away takes none: focusing a removed element does nothing).
    const back = new MutationObserver(() => {
      if (control.matches(":disabled")) return
      release()
      if (doc.activeElement === holder) control.focus({ preventScroll: true })
    })
    back.observe(control, { attributes: true, attributeFilter: ["disabled"] })
    release = () => {
      back.disconnect()
      held = null
      release = () => {}
    }
  }
  // Focus that lands anywhere but the holder was moved by the person, so the keeper lets go at once: coming back to
  // the content later (Tab off it, Shift+Tab back) gives the control nothing, and a closed dialog's nodes aren't kept.
  const onFocusIn = (e: FocusEvent) => {
    if (held && e.target !== held) release()
  }
  doc.addEventListener("focusout", onFocusOut, true)
  doc.addEventListener("focusin", onFocusIn, true)
  return () => {
    doc.removeEventListener("focusout", onFocusOut, true)
    doc.removeEventListener("focusin", onFocusIn, true)
    release()
  }
}

let mounted = 0
let uninstall = () => {}

/** The keeper, once per page, while any board's canvas is mounted. */
export function useKeptDialogFocus(): void {
  React.useEffect(() => {
    if (mounted++ === 0) uninstall = keepDialogFocus()
    return () => {
      if (--mounted === 0) uninstall()
    }
  }, [])
}
