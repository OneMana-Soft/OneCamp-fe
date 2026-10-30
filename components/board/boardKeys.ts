import { editableTargetOf } from "@/hooks/useEscapeClosesPanel"
import { chordMatches, chordWords } from "@/lib/keys/chord"
import { CAMP_NOTE_COLOURS, type NoteColourId } from "@/lib/board/notes"

/**
 * Keys and pastes meant for something other than the board: a field or an
 * editor (the app's one test, editableTargetOf), or a dialog, a menu or a list
 * open over it.
 */
export function notForTheBoard(event: Event): boolean {
  if (editableTargetOf(event)) return true
  const el = event.target
  return el instanceof Element && el.closest("[role='dialog'], [role='menu'], [role='listbox']") !== null
}

/**
 * The notes bar on keys (miro-07 6; Alt+G is miro-02's tidy key), as chords the
 * app's shortcut list writes (lib/keys/chord). Alt, so a board's own letters
 * (N, Tab, Excalidraw's tools) stay as they are; on a Mac ⌥ is read by the key's
 * place. Alt+1 to Alt+6 are the six camp colours, in the picker's order.
 * Tags is Alt+L (a label): Alt+T is the app's own key to its notifications
 * (components/ui/toast isToastHotkey), and no chord here is a key the app
 * already holds (boardKeys.test: the toasts' and the calls'). Vote is Alt+U
 * (up): Excalidraw holds Alt with H, R, S, V, Z and /, and a browser's menus
 * Alt with D, E, F and Firefox's B. Size is Alt+N, the next size (S is
 * Excalidraw's snapping, and the calls' share).
 */
export const NOTE_KEYS = { tidy: "Alt-g", tags: "Alt-l", colour: "Alt-c", tasks: "Alt-k", vote: "Alt-u", size: "Alt-n" } as const
export type NoteKey = keyof typeof NOTE_KEYS

/** The notes bar's action a key asks for, or null when it asks for none. Pure. */
export function noteKeyOf(e: Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey"> & { code?: string }, mac: boolean): NoteKey | NoteColourId | null {
  for (const [action, chord] of Object.entries(NOTE_KEYS) as [NoteKey, string][]) if (chordMatches(e, chord, mac)) return action
  const n = CAMP_NOTE_COLOURS.findIndex((_, i) => chordMatches(e, `Alt-${i + 1}`, mac))
  return n >= 0 ? CAMP_NOTE_COLOURS[n] : null
}

/** A control's name with its key, as the bar's tooltips say it: "Tidy up into a grid (Alt + G)". Pure. */
export const withKey = (label: string, chord: string): string => `${label} (${chordWords(chord)})`

/** A chord as aria-keyshortcuts writes it: "Alt+G". Pure. */
export const ariaKeys = (chord: string): string => chordWords(chord).replace(/ \+ /g, "+")
