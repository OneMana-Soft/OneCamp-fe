/**
 * The calendar's keys (calendar programme A0; VD-28 … 34): one table, which
 * the calendar binds, its toolbar names in its hints, and the app's shortcut
 * list shows as its Calendar group, so the list can't name a key that does
 * nothing. Its rows are the registry's shortcut rows (registry/types.ts:
 * Tiptap's chord notation, other keys that do the same, the dialog's words),
 * each with the calendar command it runs. A7 moves them onto the calendar's
 * registered actions.
 *
 * Google Calendar's keys: J or N and K or P, T, G, D W M A with 1 2 3 5, C,
 * E, ⌘D, Delete or Backspace, Z or ⌘Z, R and "/", and ⌘⏎ in the event you're
 * editing, which the event's forms bind themselves (submitOnModEnter), so it
 * works wherever they open; Alt and the arrows move the event whose block has
 * the focus (INTERACTION_SPEC §4), which the blocks bind. "?" is the app's
 * own: it opens the list, with this group first.
 */

import type { ShortcutRow } from '@/components/docEditor/registry/types'
import { chordMatches, chordWords } from '@/lib/keys/chord'

export type CalendarCommand =
  | 'next'
  | 'previous'
  | 'today'
  | 'goTo'
  | 'day'
  | 'week'
  | 'month'
  | 'agenda'
  | 'newEvent'
  | 'open'
  | 'duplicate'
  | 'delete'
  | 'undo'
  | 'refresh'
  | 'search'

export type CalendarKeyRow = Pick<ShortcutRow, 'alt' | 'label'> & {
  keys: string
  /**
   * What the calendar runs for it. A row without one names a key that what
   * it acts on binds itself, as the registry's rows without run do (⌘⏎: the
   * event's forms; Alt and the arrows: the event's block).
   */
  command?: CalendarCommand
}

export const CALENDAR_KEYS: readonly CalendarKeyRow[] = [
  { keys: 'j', alt: ['n'], label: 'Next day, week or month', command: 'next' },
  { keys: 'k', alt: ['p'], label: 'Previous day, week or month', command: 'previous' },
  { keys: 't', label: 'Today', command: 'today' },
  { keys: 'g', label: 'Go to a date', command: 'goTo' },
  { keys: 'd', alt: ['1'], label: 'Day view', command: 'day' },
  { keys: 'w', alt: ['2'], label: 'Week view', command: 'week' },
  { keys: 'm', alt: ['3'], label: 'Month view', command: 'month' },
  { keys: 'a', alt: ['5'], label: 'Agenda', command: 'agenda' },
  { keys: 'c', label: 'New event', command: 'newEvent' },
  { keys: 'e', label: 'Open the selected event', command: 'open' },
  { keys: 'Mod-d', label: 'Duplicate the selected event', command: 'duplicate' },
  { keys: 'Delete', alt: ['Backspace'], label: 'Delete the selected event', command: 'delete' },
  { keys: 'z', alt: ['Mod-z'], label: 'Undo the last move', command: 'undo' },
  { keys: 'r', label: 'Refresh', command: 'refresh' },
  { keys: '/', label: 'Search events', command: 'search' },
  { keys: 'Mod-Enter', label: "Save the event you're editing" },
  { keys: 'Alt-ArrowUp', alt: ['Alt-ArrowDown'], label: 'Move the focused event 15 minutes' },
  { keys: 'Alt-ArrowLeft', alt: ['Alt-ArrowRight'], label: 'Move the focused event a day' },
  { keys: 'Alt-Shift-ArrowUp', alt: ['Alt-Shift-ArrowDown'], label: 'Make the focused event shorter or longer' },
]

const chordsOf = (row: CalendarKeyRow) => [row.keys, ...(row.alt ?? [])]

/** The row a key press is, if any. Pure. */
export function calendarKeyRow(e: Parameters<typeof chordMatches>[0], mac: boolean): CalendarKeyRow | null {
  return CALENDAR_KEYS.find((row) => chordsOf(row).some((chord) => chordMatches(e, chord, mac))) ?? null
}

/** A command's first key, as a hint beside its button ("Next week · J"). Pure. */
export function calendarKeyHint(command: CalendarCommand): string {
  const row = CALENDAR_KEYS.find((r) => r.command === command)
  return row ? chordWords(row.keys) : ''
}

/** The table as the app's shortcut list shows it: its Calendar group. Pure. */
export function calendarShortcutRows(): Array<{ keys: string; does: string }> {
  return CALENDAR_KEYS.map((row) => ({ keys: chordsOf(row).map(chordWords).join(' or '), does: row.label }))
}
