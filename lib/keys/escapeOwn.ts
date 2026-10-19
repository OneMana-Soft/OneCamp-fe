import type { HandedOn, LeftToOwner } from "@/lib/keys/escape"

type Marked = KeyboardEvent & LeftToOwner & HandedOn

/**
 * For what answers Escape itself and skips a press already used (a popup in
 * it closed): whether something before it used this one. A press left to it
 * (lib/keys/escape) isn't used, nor one a layer handed on unused (HandedOn).
 */
export const escapeTaken = (e: Marked) => e.defaultPrevented && !e.escapeLeftToOwner && !e.escapeHandedOn

/** It answered the press: used, for every handler after it, the page's one Escape too. */
export function takeEscape(e: Marked) {
  e.escapeLeftToOwner = e.escapeHandedOn = false
  e.preventDefault()
}
