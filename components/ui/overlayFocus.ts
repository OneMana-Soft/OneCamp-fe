/**
 * Focus the dialog itself when it opens, for a dialog whose first control is
 * a button or a picker: opened from a menu, that control lit up with a focus
 * ring before the person had done anything. Tab still starts at the first
 * control. Pass as onOpenAutoFocus. The shared sheet (components/ui/drawer)
 * does it on every open: its first field would throw up a phone's keyboard.
 */
export function focusDialogItself(event: Event) {
  event.preventDefault()
  if (event.target instanceof HTMLElement) event.target.focus({ preventScroll: true })
}

/**
 * For an overlay's onInteractOutside: a press or focus inside a confirm it
 * asked (an alertdialog, drawn in its own portal) isn't outside it, so the
 * overlay stays behind the confirm and shows what the confirmed step did
 * (the event card's Remove call: its Add a call comes back).
 */
export function stayBehindConfirm(event: Event) {
  if (event.target instanceof Element && event.target.closest('[role="alertdialog"]')) event.preventDefault()
}
