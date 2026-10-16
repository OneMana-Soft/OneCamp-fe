"use client"

import type { Editor } from "@tiptap/react"
import { isComposingKey } from "@/lib/keys/ime"

/**
 * The title's own keys (small-details T5, T6, A4):
 * - ↩ splits the title at the caret: what follows becomes the body's first
 *   line, and the caret goes to the body's start;
 * - ↓ on the title's last line goes to the body's start;
 * - nothing while an input method is composing (Japanese, Chinese): its ↩
 *   picks a candidate, and used to leave the title half typed.
 * Returns whether the key was handled.
 */
export function titleKey(
  e: Pick<KeyboardEvent, "key" | "isComposing" | "keyCode" | "shiftKey" | "metaKey" | "ctrlKey" | "altKey"> & { preventDefault: () => void },
  field: { value: string; selectionStart: number | null; selectionEnd: number | null; singleLine: boolean },
  editor: Editor | null,
  onTitle: (title: string) => void,
): boolean {
  if (isComposingKey(e) || !editor) return false
  if (e.key === "Enter" && !e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey) {
    e.preventDefault()
    const at = field.selectionStart ?? field.value.length
    const tail = field.value.slice(field.selectionEnd ?? at)
    if (tail.trim() && editor.isEditable) {
      onTitle(field.value.slice(0, at).trimEnd())
      editor.chain().insertContentAt(0, { type: "paragraph", content: [{ type: "text", text: tail.trim() }] }).focus("start").run()
    } else {
      onTitle(field.value)
      editor.commands.focus("start")
    }
    return true
  }
  if (e.key === "ArrowDown" && !e.shiftKey && (field.singleLine || field.selectionStart === field.value.length)) {
    e.preventDefault()
    editor.commands.focus("start")
    return true
  }
  return false
}
