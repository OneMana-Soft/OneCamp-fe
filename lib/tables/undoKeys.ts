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
  // A read-only box (a grid's cell at rest, selected) has no text of its own to undo: the table's change is undone.
  const box = /^(INPUT|TEXTAREA)$/.test(t.tagName) && !(t as HTMLInputElement | HTMLTextAreaElement).readOnly
  return t.isContentEditable || box || t.tagName === "SELECT" || !!t.closest("[data-radix-popper-content-wrapper]")
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

/**
 * What a key asks of the table's find (G2b): "find" (⌘F; Ctrl+F off a Mac),
 * "replace" (Ctrl+H; ⌘⇧H on a Mac, where ⌘H hides the app), or nothing.
 * In a cell's box too: the page's find over every row, not the browser's.
 */
export function findKey(e: Key, mac: boolean): "find" | "replace" | null {
  const mod = mac ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey
  if (!mod || e.altKey) return null
  const key = e.key.toLowerCase()
  if (key === "f") return e.shiftKey ? null : "find"
  return key === "h" && e.shiftKey === mac ? "replace" : null
}

/** Whether the reader is on a Mac, where ⌘ is the key that undoes. */
export function onMac(): boolean {
  return typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)
}
