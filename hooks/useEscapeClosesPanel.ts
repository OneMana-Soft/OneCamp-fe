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

// Inputs that take a click or a pick, not typing: Escape on one of these is
// not leaving a field.
const UNTYPED_INPUTS = new Set(["button", "checkbox", "color", "file", "hidden", "image", "radio", "range", "reset", "submit"])
// An editing host, for a DOM without isContentEditable (jsdom has none).
const EDITING_HOST = '[contenteditable=""], [contenteditable="true"], [contenteditable="plaintext-only"]'

/**
 * The field a key press was typed in: a text input, a textarea, a select or
 * an editor (its contenteditable host). Null for a press from anywhere else.
 */
export function editableTargetOf(event: Event): HTMLElement | null {
  const target = event.target
  if (!(target instanceof HTMLElement)) return null
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return target
  if (target instanceof HTMLInputElement) return UNTYPED_INPUTS.has(target.type) ? null : target
  if (typeof target.isContentEditable === "boolean") {
    return target.isContentEditable ? (target.closest<HTMLElement>(EDITING_HOST) ?? target) : null
  }
  return target.closest<HTMLElement>(EDITING_HOST)
}

/**
 * Escape closes the right panel (a thread, a task, comments, an event) when
 * nothing layered over the page wants the key.
 *
 * Not from a field with the cursor in it: that Escape leaves the field, and
 * the next one closes the panel. A task's title and description save half a
 * second after the last key and closing the panel unmounts them, so an Escape
 * that went straight from the field to closing the panel lost the last words
 * typed.
 *
 * Listens on the window in the bubble phase, after the document: every layer,
 * and anything else listening on the document (a doc's focus mode), has had
 * its turn first, and one that handled the key has marked it defaultPrevented.
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
      const field = editableTargetOf(event)
      if (field) {
        field.blur()
        return
      }
      close.current()
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [enabled])
}
