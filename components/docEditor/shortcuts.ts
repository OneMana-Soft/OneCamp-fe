import "@/components/docEditor/registry"
import { shortcutDialogGroups, shortcutRowsFor } from "@/components/docEditor/registry/shortcuts"

/**
 * The doc's shortcuts, as its "?" dialog lists them (content.md D29), and as
 * Notion's own page lists them where they overlap (notion.com/help/
 * keyboard-shortcuts, read 11 Oct 2026). Made from the registry's one table
 * (registry/shortcuts.ts: each block's keys and each action's), so a key can't
 * be listed in one place and bound in another. Every row is bound:
 * shortcuts.test.tsx fires each one on a real doc editor, so a row the editor
 * doesn't honour fails a test (the dialog used to list ⌘⇧X and ⌘K, which did
 * nothing).
 *
 * Keys are written for a Mac (⌘ ⌥ ⇧); the dialog shows Ctrl, Alt and Shift
 * elsewhere (keyLabel).
 */
export interface ShortcutRow {
  label: string
  /** Each way to do it: a chord (["⌘", "B"]), or text typed at a line's start (["#"]). */
  ways: string[][]
  /** The ways are one after the other ("Esc, then ⇥"), not alternatives. */
  sequence?: boolean
}

export interface ShortcutGroup {
  title: string
  rows: ShortcutRow[]
}

/** The table in every edition (the AI edition's own keys, when there are any, show only there). */
export const SHORTCUT_GROUPS: ShortcutGroup[] = shortcutDialogGroups(shortcutRowsFor("doc", { ai: false }))

/** A key as this platform's keyboard says it: ⌘ ⌥ ⇧ on a Mac, Ctrl Alt Shift elsewhere. Pure. */
export function keyLabel(key: string, mac: boolean): string {
  if (mac) return key
  return ({ "⌘": "Ctrl", "⌥": "Alt", "⇧": "Shift", "⏎": "Enter", "⇥": "Tab" } as Record<string, string>)[key] ?? key
}
