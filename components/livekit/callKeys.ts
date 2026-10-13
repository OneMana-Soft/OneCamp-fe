// The call's keys, in one table (CALL-BUG-13). The dock's tooltips taught ⇧S,
// C, J and L, and the green room taught M and V, while only M and V worked,
// and only inside the call. Now the table drives the handlers and the
// tooltips both, so a key can't be taught without being answered.

import { isTyping } from "@/lib/goKeys"

export type CallAction = "mic" | "camera" | "share" | "captions" | "ai" | "layout"

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
]

/** Each action's key as the tooltips show it. */
export const CONTROL_KEYS = Object.fromEntries(CALL_KEYS.map((k) => [k.action, k.label])) as Record<CallAction, string>

type KeyLike = Pick<KeyboardEvent, "key" | "shiftKey" | "metaKey" | "ctrlKey" | "altKey" | "repeat"> & {
  target?: EventTarget | null
  isComposing?: boolean
}

/**
 * The action a key press asks for, or null: never with ⌘, Ctrl or Alt held,
 * never on a held key's repeats, never while typing. Shift must match the
 * table, so S alone does nothing and ⇧M isn't M. Pure.
 */
export function callKeyAction(e: KeyLike, allowed?: readonly CallAction[]): CallAction | null {
  if (e.metaKey || e.ctrlKey || e.altKey || e.repeat || e.isComposing) return null
  // Typing, or a surface with its own letters (a whiteboard beside the call):
  // the app's one rule for that (lib/goKeys).
  if (e.target && typeof (e.target as Element).tagName === "string" && isTyping(e.target as Element)) return null
  const key = (e.key || "").toLowerCase()
  const row = CALL_KEYS.find((k) => k.key === key && !!k.shift === !!e.shiftKey)
  if (!row) return null
  if (allowed && !allowed.includes(row.action)) return null
  return row.action
}
