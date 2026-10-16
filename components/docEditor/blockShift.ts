"use client"

import type { Editor } from "@tiptap/core"

/**
 * Indent or outdent on the phone (M2), which has no Tab key: a list item or
 * to-do sinks or lifts, code lines take or lose an indent.
 */
export function shiftBlock(editor: Editor, direction: 1 | -1): boolean {
  if (editor.isActive("codeBlock")) {
    // The doc keymap's own indent: loaded with any doc editor, and fetched
    // here rather than carried by every editor that reads the registry.
    void import("@/components/minimal-tiptap/extensions/doc-keymap/docKeymap").then((m) => m.indentCode(editor, direction))
    return true
  }
  // Any other block nests as Tab nests it (B1's indent; a list's first item: the whole list).
  if (editor.can().nestBlocks?.(direction)) return editor.chain().focus().nestBlocks(direction).run()
  for (const item of ["taskItem", "listItem"]) {
    if (editor.isActive(item)) return direction > 0 ? editor.chain().focus().sinkListItem(item).run() : editor.chain().focus().liftListItem(item).run()
  }
  return false
}

/** Whether the caret is where indenting means something: a list item, a to-do, code. */
export const nests = (editor: Editor) => !!editor.can().nestBlocks?.(1) || editor.isActive("listItem") || editor.isActive("taskItem") || editor.isActive("codeBlock")

/**
 * Whether undo or redo has anything to do (an editor with no history has
 * neither). Asked dry: a refused command still dispatches an empty
 * transaction, which reaches Yjs and drops its redo stack.
 */
export function canRun(editor: Editor, command: "undo" | "redo"): boolean {
  const dry = editor.can() as unknown as Record<string, (() => boolean) | undefined>
  return typeof dry[command] === "function" ? !!dry[command]!() : false
}
