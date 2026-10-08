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
 * conversation read, say), without asking for them again.
 *
 * SWR drops a response if its entry changed while it was being fetched, so a
 * plain mutate has two traps, and both were live:
 *   - An entry with nothing in it yet. Its first response was dropped, and the
 *     screen stayed empty until the next refresh, minutes later: the DM list
 *     on a link straight into a chat. There's nothing to correct; it's left
 *     alone.
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
    if (entry?.data === undefined) continue
    void appMutate<T>(k, (data) => (data === undefined ? data : update(data)), {
      revalidate: entry.isValidating === true,
    })
  }
}
