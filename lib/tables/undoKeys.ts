/**
 * A table page's undo and redo keys (tables A2): ⌘Z (Ctrl+Z off a Mac) undoes
 * the reader's latest change on the table, ⌘⇧Z (Ctrl+Shift+Z, or Ctrl+Y)
 * redoes it. Never while they type into a field, whose own text the
 * browser's undo takes back, nor in an open menu or picker. Pure.
 */

type Key = Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey" | "shiftKey" | "altKey" | "target">

/** Whether the key was pressed where text is typed, or in a menu or picker. */
function typing(target: EventTarget | null): boolean {
  const t = target as HTMLElement | null
  if (!t || typeof t.closest !== "function") return false
  return t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || !!t.closest("[data-radix-popper-content-wrapper]")
}

/** What a key asks of the table's history: "undo", "redo", or nothing. */
export function undoKey(e: Key, mac: boolean): "undo" | "redo" | null {
  const mod = mac ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey
  if (!mod || e.altKey || typing(e.target)) return null
  const key = e.key.toLowerCase()
  if (key === "z") return e.shiftKey ? "redo" : "undo"
  if (key === "y" && !mac && !e.shiftKey) return "redo"
  return null
}

/** Whether the reader is on a Mac, where ⌘ is the key that undoes. */
export function onMac(): boolean {
  return typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)
}
