import { lastInputWasPointer, returnFocusOnlyForKeys } from "@/lib/ui/inputModality"

/**
 * A menu's hand-off of the focus as it closes, one per menu. A pick that opens
 * a dialog or a panel (`to`) leaves the focus to it: the menu took it back to
 * its trigger as it went, after the dialog had put it in its field, so a sheet
 * lost its field and a phone its keyboard. Every other pick gives it back only
 * when a key made it (returnFocusOnlyForKeys).
 *
 * `target` is for a menu whose close hides its own trigger, as a tree row's
 * "⋯" shows only while its row has the menu (F8, 26 Oct): Radix gave the focus
 * back to a button no longer there, and it fell to <body>. A key's close gives
 * it to the target instead, and only when nothing has it, or only a dialog that
 * holds it (a trap behind took it, V-426), so a pick that put it somewhere (a
 * dialog's field, a page it opened) keeps it.
 */
export function focusHandOff(target?: () => HTMLElement | null | undefined) {
  let handing = false
  return {
    to: (open: () => void) => () => {
      handing = true
      open()
    },
    onCloseAutoFocus: (e: Event) => {
      if (handing) {
        handing = false
        e.preventDefault()
        return
      }
      if (!target) return returnFocusOnlyForKeys(e)
      e.preventDefault()
      const to = target(), at = document.activeElement
      if (to && !lastInputWasPointer() && (at === document.body || (at?.matches("[role$=dialog]") && at.contains(to)))) to.focus()
    },
  }
}
