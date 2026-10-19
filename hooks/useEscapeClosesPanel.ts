"use client"

import { useEffect, useRef } from "react"
import { onEscape } from "@/lib/keys/onEscape"

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
 * Escape closes the right panel (a thread, a task, comments, an event): the
 * panel layer of the one Escape (lib/keys/escape), after a drag, Radix's
 * layers and what is drawn over the page, before the page itself and a toast.
 *
 * Not from a field with the cursor in it: that Escape leaves the field, and
 * the next one closes the panel. A task's title and description save half a
 * second after the last key and closing the panel unmounts them, so an Escape
 * that went straight from the field to closing the panel lost the last words
 * typed. Either way the press is used, so one press does one thing: a toast
 * showing waits for the next Escape.
 */
export function useEscapeClosesPanel(enabled: boolean, onClose: () => void) {
  const close = useRef(onClose)
  useEffect(() => {
    close.current = onClose
  })
  useEffect(() => {
    if (!enabled) return
    return onEscape("panel", (event) => {
      const field = editableTargetOf(event)
      if (field) {
        field.blur()
        return
      }
      close.current()
    })
  }, [enabled])
}
