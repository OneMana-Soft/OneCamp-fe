// A room's passcode unlock, kept for this tab only (sessionStorage) until it
// runs out, so a reload doesn't ask again; never in the address, so copying
// the address never passes the passcode on. Storage that can't be reached is
// the same as nothing kept.

const key = (slug: string) => `onecamp.room-unlock.${slug}`

/** The unlock kept for a room, while it lasts. */
export function keptUnlock(slug: string, now = Date.now()): string | undefined {
  try {
    const raw = window.sessionStorage.getItem(key(slug))
    if (!raw) return undefined
    const kept = JSON.parse(raw) as { k?: unknown; until?: unknown }
    if (typeof kept.k === "string" && typeof kept.until === "number" && kept.until > now) return kept.k
  } catch {
    // Nothing kept.
  }
  return undefined
}

/** Keeps a room's unlock for as long as the server says it lasts. */
export function keepUnlock(slug: string, k: string, seconds: number, now = Date.now()) {
  try {
    window.sessionStorage.setItem(key(slug), JSON.stringify({ k, until: now + seconds * 1000 }))
  } catch {
    // Asked again after a reload.
  }
}

/** Forgets a room's unlock, as its passcode changed. */
export function dropUnlock(slug: string) {
  try {
    window.sessionStorage.removeItem(key(slug))
  } catch {
    // Nothing to forget.
  }
}
