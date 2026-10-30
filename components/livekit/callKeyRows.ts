// The call's rows in the app's keys list (? anywhere), first while a call is
// up (calls meet-18). Only the call itself shows them, so they stay out of the
// green room's first load.

import { chordWords } from "@/lib/keys/chord"
import { CALL_KEYS, CALL_KEY_ALIASES, chordOf, type CallAction } from "./callKeys"

/** What each key does, as the app's keys list says it. */
const DOES: Record<CallAction, string> = {
  mic: "Turn your microphone on or off",
  camera: "Turn your camera on or off",
  share: "Share your screen",
  hand: "Raise or lower your hand",
  captions: "Captions on or off",
  ai: "Ask the call's assistant",
  layout: "Grid or speaker",
}

/**
 * Read from the one table so they can't drift: our key, then Meet's and
 * Zoom's as this computer has them, and holding Space after the microphone.
 * Pure.
 */
export function callShortcutRows(mac: boolean): { keys: string; does: string }[] {
  const rows: { keys: string; does: string }[] = []
  for (const k of CALL_KEYS) {
    const theirs = CALL_KEY_ALIASES.filter((a) => a.action === k.action).map((a) => chordWords(mac ? a.mac : a.pc))
    rows.push({ keys: [chordWords(chordOf(k)), ...theirs].join(" or "), does: DOES[k.action] })
    if (k.action === "mic") rows.push({ keys: "Space", does: "Hold to talk while you're muted" })
  }
  return rows
}
