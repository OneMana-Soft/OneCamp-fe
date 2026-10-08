import { mutate as globalMutate, type Cache, type ScopedMutator } from "swr"

/**
 * The app's SWR mutate, bound to its cache.
 *
 * The app's data lives in a custom cache (the localStorage provider in
 * ClientProviders). SWR's global `mutate`, imported from "swr", only knows the
 * DEFAULT cache, so every call to it from outside a component revalidated a
 * cache nothing reads: live channel updates, GitHub sync status, unread counts
 * and poll results all arrived over MQTT and changed nothing on screen. SWR's
 * docs say as much: with a custom provider, use the mutate from useSWRConfig.
 *
 * Non-component code (MQTT handlers, services) cannot call that hook, so
 * SWRMutateBridge stores it here once, inside the provider, with the cache it
 * belongs to. Before the bridge has mounted there is no app cache to revalidate
 * yet, and the global one is the harmless fallback.
 */
let bound: ScopedMutator | null = null
let boundCache: Cache | null = null

export function bindAppMutate(m: ScopedMutator | null, cache: Cache | null = null) {
  bound = m
  boundCache = m ? cache : null
}

export const appMutate: ScopedMutator = ((...args: Parameters<ScopedMutator>) =>
  (bound ?? globalMutate)(...args)) as ScopedMutator

/**
 * Corrects what cached responses say, for a change the server already has (a
 * conversation read, say), without asking for them again. update must return
 * its argument when there's nothing to correct, and then nothing is done.
 *
 * SWR drops a response if its entry changed while it was being fetched, so a
 * plain mutate has two traps, and both were live:
 *   - An entry with nothing in it yet. Its first response was dropped, and the
 *     screen stayed empty until the next refresh, minutes later: the DM list
 *     on a link straight into a chat. The correction waits for that response
 *     instead, which may predate the change, and is made as it's seeded
 *     (dataToSeed).
 *   - An entry being fetched again. The fresher response was dropped, and the
 *     screen kept the older one for minutes. It's corrected and fetched again;
 *     the new answer comes after the change, so it has it too.
 *
 * key is one key, or a test over keys, for an endpoint cached page by page.
 */
export function patchCached<T>(key: string | ((key: string) => boolean), update: (data: T) => T): void {
  const cache = boundCache
  if (!cache) return
  const keys = typeof key === "string" ? [key] : [...cache.keys()].filter(key)
  for (const k of keys) {
    const entry = cache.get(k)
    if (entry?.data === undefined) {
      if (entry?.isValidating) waitFor(k, update as (data: unknown) => unknown)
      continue
    }
    if (update(entry.data) === entry.data) continue
    void appMutate<T>(
      k,
      (data) => {
        if (data === undefined) return data
        const next = update(data)
        // A store seeded from this answer already has the change (the callers
        // make it there), so the corrected answer isn't news to it.
        if (seededFrom.get(k) === data) seededFrom.set(k, next)
        return next
      },
      { revalidate: entry.isValidating === true },
    )
  }
}

/** How long a correction waits for a response before it's dropped. */
const WAIT_MS = 30_000
const waiting = new Map<string, { update: (data: unknown) => unknown; until: number }[]>()

function waitFor(key: string, update: (data: unknown) => unknown) {
  const now = Date.now()
  // A key nothing seeds never takes its corrections; they lapse here.
  const still = (waiting.get(key) ?? []).filter((w) => w.until > now)
  waiting.set(key, [...still, { update, until: now + WAIT_MS }])
}

/** The answer each Redux store was last seeded from, by key. */
const seededFrom = new Map<string, unknown>()

/**
 * A response to seed a Redux store from (the sidebar, the chat list), or null
 * when the store has it already.
 *
 * The store is the live copy: seeded from the server's answer, then kept
 * current by live updates that the cached answer never sees. So it's seeded
 * once per answer. Handing it the same answer again (on a remount, or a
 * render) or a correction it already has would bring back every count that
 * changed since; it did, on each "seen" mark. Corrections that waited for
 * this answer (patchCached) are made first, and the cache is given them too.
 */
export function dataToSeed<T>(key: string, data: T | undefined): T | null {
  if (data === undefined || seededFrom.get(key) === data) return null
  const now = Date.now()
  let next: unknown = data
  for (const w of waiting.get(key) ?? []) if (w.until > now) next = w.update(next)
  waiting.delete(key)
  seededFrom.set(key, next)
  if (next !== data) void appMutate(key, next, { revalidate: false })
  return next as T
}
