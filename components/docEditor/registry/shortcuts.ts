/**
 * The shortcut table (PROGRAM.md §4 #2): one list, from the block specs'
 * shortcuts and the actions' keys, that makes both the keymap and the "?"
 * dialog. A row with run is bound here (shortcutKeymapFor); a row without one
 * names a key its extension binds (Bold's ⌘B). Either way the table test
 * fires every row on a real doc editor, so the dialog can't list a key that
 * does nothing.
 */

import { Extension, type Editor } from '@tiptap/core'
import { allActions, blocksFor, type EditionGate } from './registry'
import type { EditorKind, ShortcutRow, SurfaceAction } from './types'

/** The dialog's groups, in this order; any other after them. */
export const SHORTCUT_GROUP_ORDER = ['Text', 'Blocks', 'Doc']

/** A row with where it came from. */
export type TableRow = ShortcutRow & { source: string }

/** The actions with a key, in the edition that reads them: what the page binds (useActionKeys) and the dialog lists. */
export function actionsWithKeys(gate: EditionGate): SurfaceAction[] {
  return allActions().filter((a) => a.shortcut && (a.edition === 'both' || gate.ai))
}

/**
 * Every row for an editor kind: its blocks' rows, then the actions' keys (in
 * the Doc group, under their dialog wording). An action whose key a block's
 * row already lists adds no second row.
 */
export function shortcutRowsFor(kind: EditorKind, gate: EditionGate): TableRow[] {
  const rows: Array<TableRow & { at: number }> = []
  for (const spec of blocksFor(kind, gate)) for (const r of spec.shortcuts ?? []) rows.push({ ...r, source: `block:${spec.id}`, at: rows.length })
  const listed = new Set(rows.flatMap((r) => (r.keys ? [r.keys, ...(r.alt ?? [])] : [])))
  for (const a of actionsWithKeys(gate)) {
    if (listed.has(a.shortcut!)) continue
    listed.add(a.shortcut!)
    rows.push({ keys: a.shortcut, label: a.shortcutLabel ?? a.label, group: 'Doc', order: a.shortcutOrder ?? a.order, source: `action:${a.id}`, at: rows.length })
  }
  const g = (name: string) => {
    const i = SHORTCUT_GROUP_ORDER.indexOf(name)
    return i < 0 ? SHORTCUT_GROUP_ORDER.length : i
  }
  return rows.sort((a, b) => g(a.group) - g(b.group) || (a.order ?? 1000) - (b.order ?? 1000) || a.at - b.at).map(({ at: _at, ...r }) => r)
}

const GLYPH: Record<string, string> = {
  Mod: '⌘',
  Alt: '⌥',
  Shift: '⇧',
  Ctrl: '⌃',
  Enter: '⏎',
  Tab: '⇥',
  Escape: 'Esc',
  Backspace: '⌫',
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
}

/** A chord in Tiptap's notation as the dialog's keys: 'Mod-Alt-1' → ['⌘', '⌥', '1']. Pure. */
export function chordGlyphs(chord: string): string[] {
  const parts = chord.split(/-(?!$)/)
  return parts.map((p) => GLYPH[p] ?? (p.length === 1 ? p.toUpperCase() : p))
}

/** The dialog's shape: groups of rows, each row its ways (chords as keys, or text typed). */
export interface DialogGroup {
  title: string
  rows: Array<{ label: string; ways: string[][]; sequence?: boolean }>
}

/**
 * The table as the "?" dialog shows it. A thing has one row in its group:
 * another source's keys for it (Slack's ⌘⇧X beside our ⌘⇧S for
 * Strikethrough) are more ways on that row, never a second row of the same
 * name. Keys first, then what can be typed, each way once. Pure.
 */
export function shortcutDialogGroups(rows: TableRow[]): DialogGroup[] {
  const groups: Array<{ title: string; rows: Array<{ label: string; sequence?: true; chords: string[]; typed: string[] }> }> = []
  for (const r of rows) {
    let group = groups.find((x) => x.title === r.group)
    if (!group) groups.push((group = { title: r.group, rows: [] }))
    let row = group.rows.find((x) => x.label === r.label && !!x.sequence === !!r.sequence)
    if (!row) group.rows.push((row = { label: r.label, ...(r.sequence ? { sequence: true as const } : {}), chords: [], typed: [] }))
    for (const c of r.keys ? [r.keys, ...(r.alt ?? [])] : []) if (!row.chords.includes(c)) row.chords.push(c)
    for (const t of r.typed ?? []) if (!row.typed.includes(t)) row.typed.push(t)
  }
  return groups.map((g) => ({
    title: g.title,
    rows: g.rows.map(({ label, sequence, chords, typed }) => ({ label, ways: [...chords.map(chordGlyphs), ...typed.map((t) => [t])], ...(sequence ? { sequence } : {}) })),
  }))
}

/** The keys the table itself binds: each row with run, by its chords. */
export function shortcutKeymapFor(rows: ShortcutRow[]): Record<string, (editor: Editor) => boolean> {
  const map: Record<string, (editor: Editor) => boolean> = {}
  for (const r of rows) {
    if (!r.run || !r.keys) continue
    for (const k of [r.keys, ...(r.sequence ? [] : r.alt ?? [])]) {
      if (map[k]) throw new Error(`Two shortcut rows bind ${k}`)
      map[k] = r.run
    }
  }
  return map
}

/**
 * The table's keymap as an extension, for the editors of a kind: none when no
 * row of theirs binds a key itself (the extensions bind all of today's).
 */
export function shortcutTableExtensions(kind: EditorKind, gate: EditionGate) {
  const bound = shortcutKeymapFor(shortcutRowsFor(kind, gate))
  if (!Object.keys(bound).length) return []
  return [
    Extension.create({
      name: 'shortcutTable',
      addKeyboardShortcuts() {
        return Object.fromEntries(Object.entries(bound).map(([k, run]) => [k, () => run(this.editor)]))
      },
    }),
  ]
}
