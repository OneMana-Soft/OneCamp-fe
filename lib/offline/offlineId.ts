/**
 * The ids the device gives what it makes with no network (P7-1c), until the
 * server makes it under its own. Its own small module, so a screen can tell
 * one apart without loading the Offline Store (lib/offline/engine) with it.
 * The one owner of those ids (CODE-REVIEWER-79 MF1): what makes them, and
 * what finds them, read one pattern.
 */

/** What starts the id the device gives what it makes offline, until the server makes it under its own. */
export const OFFLINE_ID = "offline-"

// After OFFLINE_ID: a UUID, or, where there is no crypto, two base-36 runs of at least 6 (randomKey).
const BODY = "(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9a-z]{6,}-[0-9a-z]{6,})"
const ONE = new RegExp(`^${OFFLINE_ID}${BODY}$`)
const ANY = new RegExp(`${OFFLINE_ID}${BODY}`, "g")

/** A random key: a UUID, or where there is no crypto (a page served without TLS) two base-36 runs of at least 6. */
export function randomKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID()
  const run = () => Math.random().toString(36).slice(2).padEnd(6, "0")
  return `${Date.now().toString(36).padStart(6, "0")}-${run()}${run()}`
}

/** A new id for something the device makes, until the server makes it under its own. */
export const newOfflineId = (): string => `${OFFLINE_ID}${randomKey()}`

/** An id the device gave: its create still waits, so it is never sent to the server as it is. */
export const madeOffline = (id: unknown): id is string => typeof id === "string" && ONE.test(id)

/** The ids the device gave that text names (a request's address, its body), each once. */
export const offlineIdsIn = (text: string): string[] => [...new Set(text.match(ANY) ?? [])]
