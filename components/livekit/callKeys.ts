// The call's keys, in one table (CALL-BUG-13). The dock's tooltips taught ⇧S,
// C, J and L, and the green room taught M and V, while only M and V worked,
// and only inside the call. Now the table drives the handlers and the
// tooltips both, so a key can't be taught without being answered.

import { isTyping } from "@/lib/goKeys"
import { chordMatches, isMacLike } from "@/lib/keys/chord"

export type CallAction = "mic" | "camera" | "share" | "captions" | "ai" | "layout" | "hand"

export interface CallKey {
  action: CallAction
  /** KeyboardEvent.key, lower case. */
  key: string
  shift?: boolean
  /** What the tooltip shows. */
  label: string
}

export const CALL_KEYS: readonly CallKey[] = [
  { action: "mic", key: "m", label: "M" },
  { action: "camera", key: "v", label: "V" },
  { action: "share", key: "s", shift: true, label: "⇧S" },
  { action: "captions", key: "c", label: "C" },
  { action: "ai", key: "j", label: "J" },
  { action: "layout", key: "l", label: "L" },
  { action: "hand", key: "h", label: "H" },
]

/**
 * Meet's and Zoom's keys for the same things (calls meet-18, D-CL-11), as each
 * app has them on a Mac and elsewhere, so a hand that knows them works here.
 * In lib/keys/chord's notation, where Mod is ⌘ on a Mac and Ctrl elsewhere.
 * The tooltips keep teaching our letters; the keys list shows these too.
 */
export const CALL_KEY_ALIASES: readonly { action: CallAction; mac: string; pc: string }[] = [
  // Meet
  { action: "mic", mac: "Mod-d", pc: "Mod-d" },
  { action: "camera", mac: "Mod-e", pc: "Mod-e" },
  { action: "hand", mac: "Ctrl-Mod-h", pc: "Ctrl-Alt-h" },
  // Zoom
  { action: "mic", mac: "Mod-Shift-a", pc: "Alt-a" },
  { action: "camera", mac: "Mod-Shift-v", pc: "Alt-v" },
  { action: "share", mac: "Mod-Shift-s", pc: "Alt-s" },
  { action: "hand", mac: "Alt-y", pc: "Alt-y" },
]

/** One of our keys as a chord: "m", or "Shift-s". Pure. */
export const chordOf = (k: CallKey) => (k.shift ? `Shift-${k.key}` : k.key)

/** Each action's key as the tooltips show it. */
export const CONTROL_KEYS = Object.fromEntries(CALL_KEYS.map((k) => [k.action, k.label])) as Record<CallAction, string>

type KeyLike = Parameters<typeof chordMatches>[0] & Pick<KeyboardEvent, "repeat"> & { target?: EventTarget | null; isComposing?: boolean }

/**
 * The action a key press asks for, or null: never on a held key's repeats,
 * never while typing. Our letters take no ⌘, Ctrl or Alt, and Shift must
 * match the table, so S alone does nothing and ⇧M isn't M; Meet's and Zoom's
 * keys are this computer's own (mac). Pure.
 */
export function callKeyAction(e: KeyLike, allowed?: readonly CallAction[], mac = isMacLike()): CallAction | null {
  if (e.repeat || e.isComposing) return null
  // Typing, or a surface with its own letters (a whiteboard beside the call):
  // the app's one rule for that (lib/goKeys).
  if (e.target && typeof (e.target as Element).tagName === "string" && isTyping(e.target as Element)) return null
  const action =
    CALL_KEYS.find((k) => chordMatches(e, chordOf(k), mac))?.action ?? CALL_KEY_ALIASES.find((a) => chordMatches(e, mac ? a.mac : a.pc, mac))?.action
  return action && (!allowed || allowed.includes(action)) ? action : null
}
