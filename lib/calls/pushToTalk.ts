// Push to talk (calls meet-18): while you're muted, holding Space unmutes you
// and letting go mutes you again, as Zoom's does. Never while typing, never
// with a modifier, and never when a control has the focus: Space presses a
// button, a menu item, a link or a switch. Pure: the call's dock runs it.

import { isTyping } from "@/lib/goKeys"

/** Whether Space is held, and whether holding it is what unmuted you. */
export interface Hold {
  held: boolean
  byHold: boolean
}

export const RELEASED: Hold = { held: false, byHold: false }

type KeyLike = Pick<KeyboardEvent, "key" | "code" | "repeat" | "shiftKey" | "metaKey" | "ctrlKey" | "altKey"> & { target?: EventTarget | null }

/** The controls Space presses, which keep it. */
const SPACE_PRESSES =
  'button, a[href], summary, select, [role="button"], [role="link"], [role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"], [role="checkbox"], [role="switch"], [role="radio"], [role="tab"], [role="option"], [role="slider"], [role="combobox"]'

/** Whether this key press is push to talk's: Space alone, on nothing that types or that Space presses. Pure. */
export function isTalkKey(e: KeyLike): boolean {
  if (e.code !== "Space" && e.key !== " ") return false
  if (e.shiftKey || e.metaKey || e.ctrlKey || e.altKey) return false
  const t = e.target as Element | null | undefined
  if (t && typeof t.tagName === "string") {
    if (isTyping(t)) return false
    if (t.closest?.(SPACE_PRESSES)) return false
  }
  return true
}

/**
 * Space pressed: a muted microphone opens for as long as it's held. A held
 * key's repeats change nothing, but they are kept from scrolling the page.
 * An open microphone is left alone. Pure.
 */
export function onTalkDown(h: Hold, e: Pick<KeyLike, "repeat">, micOn: boolean): { hold: Hold; unmute: boolean; prevent: boolean } {
  if (h.held || e.repeat) return { hold: { ...h, held: true }, unmute: false, prevent: true }
  if (micOn) return { hold: { held: true, byHold: false }, unmute: false, prevent: true }
  return { hold: { held: true, byHold: true }, unmute: true, prevent: true }
}

/** Space let go, or the page lost the key while it was held: mutes again only what holding it opened. Pure. */
export function onTalkUp(h: Hold): { hold: Hold; mute: boolean } {
  return { hold: RELEASED, mute: h.byHold }
}
