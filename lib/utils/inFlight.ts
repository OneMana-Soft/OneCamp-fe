/**
 * dedupeInFlight — share one promise between identical concurrent requests.
 *
 * WHY. The admin AI panel issued the SAME provider-models GET twice, 62ms apart, on every open.
 * Beta's log shows the pair:
 *
 *   18:10:21.980  controllers/ListProviderModels failed: ... groq
 *   18:10:22.042  controllers/ListProviderModels failed: ... groq
 *
 * That is not a cosmetic duplicate. listProviderModels makes the backend call the PROVIDER's
 * /models endpoint, so every doubled fetch is a doubled upstream call — real rate limit, and real
 * money on a paid provider — for a result that is byte-identical.
 *
 * WHY HERE RATHER THAN IN THE COMPONENT. The immediate cause is a mount effect running twice, and
 * that has several possible sources: React's development double-invoke, a remount from a parent
 * re-render, a fast double click on refresh. Fixing the component fixes one of them. Sharing the
 * in-flight promise at the request layer fixes all of them, and keeps working for callers not yet
 * written — which is the same reason error redaction lives at the WriteJSON chokepoint on the
 * server rather than at 790 call sites.
 *
 * IN-FLIGHT ONLY. NOTHING IS CACHED. The entry is removed as soon as the promise settles, so the
 * next call after completion really does hit the network. A result cache would silently change
 * what callers see — a `refresh=true` that returns a stale list is a worse bug than the duplicate
 * request it saves, and staleness questions belong to the caller, not to a transport helper.
 *
 * Rejections are shared too, then dropped. Both callers see the same failure, which is what they
 * would have seen anyway, and the next attempt is a fresh request rather than a memoised error.
 */
const inFlight = new Map<string, Promise<unknown>>()

export function dedupeInFlight<T>(key: string, run: () => Promise<T>): Promise<T> {
  const existing = inFlight.get(key)
  if (existing) return existing as Promise<T>

  // finally, not then+catch: the entry must be cleared on rejection as well, or one failure would
  // pin a rejected promise under this key and every later caller would get the stale error.
  const started = run().finally(() => {
    inFlight.delete(key)
  })

  inFlight.set(key, started)
  return started
}

/** Number of requests currently sharing a promise. Exported for tests only. */
export function inFlightCount(): number {
  return inFlight.size
}
