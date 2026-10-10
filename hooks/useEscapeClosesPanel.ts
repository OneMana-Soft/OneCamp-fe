"use client"

import { useEffect, useRef } from "react"

/**
 * Whether an Escape press belongs to something layered over the page rather
 * than to the page itself: a dialog, a menu, a popover or select list, or an
 * editor's suggestion popup (mentions, emoji, slash commands). Those close on
 * Escape themselves, and the press must stop there.
 *
 * Two signals, because the layers are built two ways. A ProseMirror
 * suggestion handles the key and marks it handled (defaultPrevented). Radix
 * layers close themselves on the same press but are still in the document
 * when it reaches us, so their open content is looked for directly. A
 * tooltip does not count: hovering a button must not make Escape do nothing.
 */
export function escapeBelongsToLayer(event: KeyboardEvent, doc: Document = document): boolean {
  if (event.defaultPrevented) return true
  if (doc.querySelector('[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]')) return true
  if (doc.querySelector('.tippy-box[data-state="visible"]')) return true
  for (const layer of Array.from(doc.querySelectorAll("[data-radix-popper-content-wrapper]"))) {
    if (!layer.querySelector('[role="tooltip"]')) return true
  }
  return false
}

/**
 * Escape closes the right panel (a thread, a task, comments, an event) when
 * nothing layered over the page wants the key. Listens on the document in the
 * bubble phase, so every layer has had its turn first.
 */
export function useEscapeClosesPanel(enabled: boolean, onClose: () => void) {
  const close = useRef(onClose)
  useEffect(() => {
    close.current = onClose
  })
  useEffect(() => {
    if (!enabled) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.isComposing) return
      if (escapeBelongsToLayer(event)) return
      close.current()
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [enabled])
}
