import * as React from "react"
import { MENU_OR_DIALOG, goneBox, lastInputWasPointer, watchInputModality } from "@/lib/ui/inputModality"
import { isTouchScreen } from "@/lib/ui/touchScreen"
import { focusDialogItself } from "@/components/ui/overlayFocus"

export type ReturnFocus = {
  onFocusCapture: React.FocusEventHandler<HTMLDivElement>
  onAnimationStartCapture: React.AnimationEventHandler<HTMLDivElement>
  onCloseAutoFocus: (event: Event) => void
}

/**
 * Every overlay's close focus (V-829), the caller's choice first: after a key, back to what opened it if nothing
 * took the focus. Read as it opens; a row stands for its menu's button, or its closing popover's. A tap that
 * starts its exit closed it, so a key before the exit ends (another dialog's Escape) gives nothing back.
 */
export function useReturnFocus({ onFocusCapture, onCloseAutoFocus }: Partial<ReturnFocus> = {}): ReturnFocus {
  const opener = React.useRef<Element | null>(null)
  React.useEffect(watchInputModality, [])
  return {
    onFocusCapture: (event) => {
      let from = event.relatedTarget ?? goneBox()
      if (!opener.current && from && !event.currentTarget.contains(from)) {
        let box: HTMLElement | null
        while ((box = from.closest<HTMLElement>(MENU_OR_DIALOG))) {
          const button: Element | null | "" =
            box.getAttribute("role") == "menu"
              ? document.getElementById(box.getAttribute("aria-labelledby") ?? "")
              : box.isConnected && box.dataset.state != "closed"
                ? null
                : box.id && document.querySelector(`[aria-controls="${CSS.escape(box.id)}"]`)
          if (!button || box.contains(button)) break
          from = button
        }
        opener.current = from
      }
      onFocusCapture?.(event)
    },
    onAnimationStartCapture: (event) => {
      if (event.currentTarget.dataset.state == "closed" && lastInputWasPointer()) opener.current = null
    },
    onCloseAutoFocus: (event) => {
      const to = opener.current
      opener.current = null
      onCloseAutoFocus?.(event)
      if (event.defaultPrevented) return
      event.preventDefault()
      if (to instanceof HTMLElement && to.isConnected && document.activeElement == document.body && !lastInputWasPointer()) to.focus({ preventScroll: true })
    },
  }
}

/**
 * Every overlay's open focus (V-835), the caller's choice first (pass its onOpenAutoFocus; one that prevents the
 * default decides). On a touch screen, the overlay itself, with no ring: its first tabbable was often a field, and a
 * tap that opened it put a phone's keyboard over it, the field's text selected for the next key to replace (a
 * project's Fields), or a button ringed (Tell guests?). With a mouse or the keys, `fine`, else Radix's first tabbable.
 */
export function openFocus(caller?: (event: Event) => void, fine?: (event: Event) => void): (event: Event) => void {
  return (event) => {
    caller?.(event)
    if (event.defaultPrevented) return
    if (isTouchScreen()) focusDialogItself(event)
    else fine?.(event)
  }
}
