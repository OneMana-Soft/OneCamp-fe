import { hexOf } from "@/lib/color/ownColour"

/**
 * "Your colours" (calendar head B, More colours): the reader's own colours,
 * newest first, each once, the oldest past twelve dropped, kept in one
 * preference the server checks and dedupes too
 * (business/Calendar/preferences.go, calendar.recent_colours). Pure.
 */
export const RECENT_COLOURS_KEY = "calendar.recent_colours"
export const MAX_RECENT_COLOURS = 12

/** The reader's colours as their preferences hold them; what isn't a colour is left out. */
export function recentColoursOf(prefs: Record<string, unknown> | undefined): string[] {
  const kept = prefs?.[RECENT_COLOURS_KEY]
  if (!Array.isArray(kept)) return []
  return kept.filter((c): c is string => typeof c === "string" && hexOf(c) === c).slice(0, MAX_RECENT_COLOURS)
}

/** The list with a colour put first, once. */
export function withRecentColour(list: string[], hex: string): string[] {
  const c = hexOf(hex)
  if (!c) return list
  return [c, ...list.filter((x) => x !== c)].slice(0, MAX_RECENT_COLOURS)
}
