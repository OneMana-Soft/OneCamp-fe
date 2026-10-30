/**
 * Who knows' addresses, and the key its strip and panel read with: apart
 * from the rest of lib/whoKnows so the search page's eager slot can tell
 * whether some words are worth asking about without carrying the module that
 * words the answers (app/firstLoad.test.ts).
 */

export const WHO_KNOWS_PATHS = { ask: "/people/who-knows", me: "/people/who-knows/me" } as const

/** The shortest words worth asking about (the server's MinQuery). */
const WHO_KNOWS_MIN = 2

/** The address of who knows about words, or "" when they're too short to ask. */
export function whoKnowsKey(words: string, limit?: number): string {
  const q = words.trim().replace(/\s+/g, " ")
  if (q.length < WHO_KNOWS_MIN) return ""
  const params = new URLSearchParams({ q })
  if (limit) params.set("limit", String(limit))
  return `${WHO_KNOWS_PATHS.ask}?${params}`
}
