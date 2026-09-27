/**
 * ttlStorage — TTL-bounded localStorage with periodic sweep of stale
 * keys.
 *
 * Why this exists:
 *   The "Catch me up" banner stores a per-channel `catchmeup_dismissed_*`
 *   key on dismissal. Without bookkeeping, the localStorage grows
 *   linearly with the number of channels the user has ever dismissed
 *   the banner in. After heavy use the localStorage approaches the
 *   browser quota and fails silently for everything else (SWR cache
 *   persistence, theme, recent items).
 *
 *   Generic helper so any future "remember this for N hours" feature
 *   uses the same single-source-of-truth implementation.
 *
 * Storage shape:
 *   localStorage[<prefix><id>] = JSON.stringify({ at: <unix ms>, ttl: <ms> })
 *
 *   Old plain-string entries written before this helper landed are
 *   tolerated: the read path treats them as ISO timestamps with the
 *   default TTL.
 */

interface TTLEntry {
    at: number
    ttl: number
}

function readEntry(rawValue: string | null, defaultTTL: number): TTLEntry | null {
    if (!rawValue) return null
    // New JSON shape.
    if (rawValue.startsWith("{")) {
        try {
            const parsed = JSON.parse(rawValue) as TTLEntry
            if (typeof parsed.at === "number" && typeof parsed.ttl === "number") {
                return parsed
            }
        } catch {
            return null
        }
    }
    // Legacy ISO-string shape — we wrote `new Date().toISOString()`.
    const ms = Date.parse(rawValue)
    if (Number.isNaN(ms)) return null
    return { at: ms, ttl: defaultTTL }
}

/**
 * sweepTTLKeys — global cleaner. Iterates every localStorage key under
 * the given prefix and removes the expired ones. Cheap (O(N) on the
 * keys, only on app boot or rare focus events) and bounded by the
 * total number of keys, which itself is bounded after the first sweep.
 */
export function sweepTTLKeys(prefix: string, defaultTTL: number): number {
    if (typeof window === "undefined") return 0
    let removed = 0
    try {
        const stale: string[] = []
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i)
            if (!key || !key.startsWith(prefix)) continue
            const entry = readEntry(localStorage.getItem(key), defaultTTL)
            if (!entry || Date.now() - entry.at > entry.ttl) {
                stale.push(key)
            }
        }
        for (const key of stale) {
            localStorage.removeItem(key)
            removed++
        }
    } catch {
        // Likely a SecurityError on a privacy-mode browser. Ignore.
    }
    return removed
}
