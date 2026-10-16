/**
 * Who this person mentions most (small-details D2): the "@" list offers them
 * first among equally good matches, after the doc's own people. Counted in
 * this browser only (localStorage, which signing out clears), for the 50
 * people mentioned most recently, so someone new always gets a place; a store
 * that can't be read or written counts nothing.
 */

const KEY = "onecamp-mentioned-often"
const KEEP = 50

type Entry = [userUUID: string, count: number]

/** The people mentioned, most recently first, with their counts. */
function entries(): Entry[] {
  try {
    const kept: unknown = JSON.parse(localStorage.getItem(KEY) || "[]")
    return Array.isArray(kept) ? kept.filter((e): e is Entry => Array.isArray(e) && typeof e[0] === "string" && typeof e[1] === "number") : []
  } catch {
    return []
  }
}

/** How often each person (by uuid) was mentioned from this browser. */
export function mentionCounts(): Map<string, number> {
  return new Map(entries())
}

/** Counts a mention of someone, as the most recent. */
export function countMention(userUUID: string): void {
  const rest = entries().filter(([id]) => id !== userUUID)
  const count = (mentionCounts().get(userUUID) ?? 0) + 1
  try {
    localStorage.setItem(KEY, JSON.stringify([[userUUID, count], ...rest].slice(0, KEEP)))
  } catch {
    // Storage full or blocked: this mention just isn't counted.
  }
}
