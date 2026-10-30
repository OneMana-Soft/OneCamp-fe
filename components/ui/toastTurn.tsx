import * as React from "react"
import { FocusScope } from "@radix-ui/react-focus-scope"

/**
 * ⌥T's turn in a modal (V-99). A modal's focus trap is Radix's FocusScope, and
 * every FocusScope is on one stack, where only the top one traps: the app pins
 * @radix-ui/react-focus-scope to the copy its dialogs, sheets and menus use, so
 * this scope, mounted beside the toasts, pauses the trap below it until it
 * goes. While it holds, Tab is Radix's among the toasts; Esc, Tab past the
 * first or the last, or a press on a toast's button (its Undo, say) goes back
 * to where ⌥T came from (or to its dialog, if that's gone), and the modal
 * stays open. Focus going anywhere else ends the turn as well.
 */
function ToastTurn({ list, from, onEnd }: { list: HTMLElement; from: HTMLElement; onEnd: () => void }) {
  React.useEffect(() => {
    const home = from.closest<HTMLElement>('[role="dialog"], [role="alertdialog"]')
    const back = () => {
      const to = [from, home].find((at) => at?.isConnected)
      if (to) to.focus()
      else list.blur()
    }
    // Esc in the toasts is theirs (data-escape-own: lib/keys/escape), not the modal's.
    list.setAttribute("data-escape-own", "")
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") back()
    }
    // Past the first or the last toast, Radix hands focus to a proxy and the
    // page behind the modal is next: back instead. Heard after Radix's own Tab
    // on the list, as the press reaches the document.
    const onTab = (e: KeyboardEvent) => {
      if (e.key !== "Tab" || !list.contains(e.target as Node) || list.contains(document.activeElement)) return
      e.preventDefault()
      back()
    }
    // Heard as the press comes down through the list, before React's own
    // handlers there (the toasts are portaled into it): the toast the press
    // closes then holds no focus for Radix to hand to the list.
    const onPress = (e: MouseEvent) => {
      if ((e.target as Element).closest("button, a[href]")) back()
    }
    const onOut = (e: FocusEvent) => {
      if (!list.contains(e.relatedTarget as Node | null)) onEnd()
    }
    list.addEventListener("keydown", onEsc)
    document.addEventListener("keydown", onTab)
    list.addEventListener("click", onPress, true)
    list.addEventListener("focusout", onOut)
    return () => {
      list.removeAttribute("data-escape-own")
      list.removeEventListener("keydown", onEsc)
      document.removeEventListener("keydown", onTab)
      list.removeEventListener("click", onPress, true)
      list.removeEventListener("focusout", onOut)
    }
  }, [list, from, onEnd])
  return (
    <FocusScope
      hidden
      // Mounted, it holds the turn: focus can come in now.
      onMountAutoFocus={(e) => {
        e.preventDefault()
        list.focus()
      }}
      // Focus is already where Esc, Tab or the pointer put it.
      onUnmountAutoFocus={(e) => e.preventDefault()}
    />
  )
}

/** The turn, for the toasts' viewport to hold until onEnd (components/ui/toast.tsx). */
export const takeTurn = (list: HTMLElement, from: HTMLElement, onEnd: () => void) => <ToastTurn list={list} from={from} onEnd={onEnd} />
