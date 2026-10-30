import { PHONE_QUERY } from "@/context/MediaQueryContext"
import { isTypedInto } from "@/lib/ui/typedInto"

/** A phone pill's height (app/phone.css C9): the foot slot is at least this tall. */
const PILL = 44

/**
 * Whether a box meets the toasts' foot slot: from the list's foot up by its
 * tallest card, or a pill where none shows. Read before the list moves.
 */
export function meetsFootSlot(box: Pick<DOMRect, "top" | "bottom">, list: Element): boolean {
  const foot = list.getBoundingClientRect().bottom
  const cards = [...list.querySelectorAll(".toast-card")].map((c) => c.getBoundingClientRect().height)
  const top = foot - Math.max(PILL, ...cards)
  return box.bottom > top && box.top < foot
}

/**
 * Keeps the toasts' list off the field in use on a phone: a field the foot
 * slot meets gives the list data-slot="top", which app/phone.css C9 moves
 * under the top bar, as it does for the keyboard and a sheet. With no
 * keyboard reported (calls-7, a room form at 390) an Undo sat over the
 * Address field and its error. Returns the stop.
 */
export function keepOffTheField(list: HTMLElement): () => void {
  const place = (focused: Element | null) => {
    delete list.dataset.slot
    if (focused && window.matchMedia?.(PHONE_QUERY).matches && meetsFootSlot(focused.getBoundingClientRect(), list)) list.dataset.slot = "top"
  }
  const typed = (t: EventTarget | null) => (isTypedInto(t) ? t : null)
  const onIn = (e: FocusEvent) => place(typed(e.target))
  const onOut = (e: FocusEvent) => place(typed(e.relatedTarget))
  const onResize = () => place(typed(document.activeElement))
  document.addEventListener("focusin", onIn)
  document.addEventListener("focusout", onOut)
  window.addEventListener("resize", onResize)
  onResize()
  return () => {
    document.removeEventListener("focusin", onIn)
    document.removeEventListener("focusout", onOut)
    window.removeEventListener("resize", onResize)
    delete list.dataset.slot
  }
}

/**
 * ⌥T's turn in a modal (toastTurn.tsx) comes with this chunk too: it holds
 * Radix's FocusScope, which no page's first load then carries for the toasts.
 */
export { takeTurn } from "./toastTurn"
