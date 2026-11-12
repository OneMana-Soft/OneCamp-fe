/**
 * One request for everyone who asks the same thing at once, and the answer
 * kept briefly for whoever asks next.
 *
 * Home asked for the AI briefing, "what needs me" and the nudges twice on
 * every visit: the nudge bell lives in both navigation bars, and a card can
 * mount twice while the layout settles. That doubled the server's work on its
 * most expensive endpoints, and coming back to Home always showed a loading
 * placeholder even when the answer was seconds old.
 *
 * Keyed by the caller. A failed request is never kept, so the next ask
 * retries. Anything that changes the answer should call forgetShared.
 */

const DEFAULT_TTL_MS = 30_000

const inflight = new Map<string, Promise<unknown>>()
// n: the request's order, so an older one answered last never puts its answer back.
const kept = new Map<string, { at: number; n: number; value: unknown }>()
let sent = 0

/** The kept answer for key, if it is younger than ttlMs. */
export function peekShared<T>(key: string, ttlMs = DEFAULT_TTL_MS, now = Date.now()): T | undefined {
    const hit = kept.get(key)
    if (!hit || now - hit.at >= ttlMs) return undefined
    return hit.value as T
}

/**
 * Runs fn once for concurrent callers of the same key, and answers from the
 * kept value while it is fresh. fresh: true asks again, past the kept value
 * and a request in flight, which may predate a change (V-577).
 */
export function sharedRequest<T>(
    key: string,
    fn: () => Promise<T>,
    opts: { ttlMs?: number; fresh?: boolean } = {},
): Promise<T> {
    if (!opts.fresh) {
        const hit = peekShared<T>(key, opts.ttlMs)
        if (hit !== undefined) return Promise.resolve(hit)
        const running = inflight.get(key)
        if (running) return running as Promise<T>
    }
    const n = ++sent
    const p: Promise<T> = fn()
        .then((value) => {
            const last = kept.get(key)
            if (last && last.n > n) return last.value as T
            kept.set(key, { at: Date.now(), n, value })
            return value
        })
        .finally(() => {
            if (inflight.get(key) === p) inflight.delete(key)
        })
    inflight.set(key, p)
    return p
}

/** Drops the kept answer, after something changed it (its order stays). */
export function forgetShared(key: string): void {
    const hit = kept.get(key)
    if (hit) hit.at = -Infinity
}
