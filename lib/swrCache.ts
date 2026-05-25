"use client"

/**
 * SWR persistent cache provider backed by localStorage.
 *
 * Goals:
 *   - Instant first paint after page reload (the cached value is shown
 *     while SWR revalidates in the background).
 *   - Survive browser quirks: persist on `pagehide` (mobile Safari /
 *     browser-killed tabs) AND on `beforeunload` AND on `visibilitychange`
 *     "hidden" so we don't lose the most recent data when the user
 *     simply switches tabs.
 *   - Bounded localStorage usage with a hard byte cap (default 5 MB,
 *     well under the 5–10 MB browser quota). On overflow we drop the
 *     largest entries first.
 *   - Cross-version safe: if the cache was serialised by an older
 *     schema, we drop it instead of crashing.
 *   - Avoid persisting transient/error states: SWR stores errors and
 *     in-flight states in the same Map; we strip them so an offline
 *     tick doesn't poison the next reload.
 */

import type { Cache } from "swr"

const CACHE_KEY = "onecamp-app-cache"
const CACHE_VERSION = 2 // bump when the serialised shape changes
const MAX_CACHE_BYTES = 5 * 1024 * 1024 // 5 MB

type SerialisedEntry = [string, unknown]
type SerialisedCache = { v: number; entries: SerialisedEntry[] }

/**
 * Returns true if the value is "interesting" enough to persist.
 * SWR stores keys for in-flight requests (`$req$...`) and for error
 * states (entries with `.error`). We persist only data values.
 */
function isPersistable(value: unknown): boolean {
  if (value == null) return false
  if (typeof value !== "object") return true
  const v = value as Record<string, unknown>
  // SWR's internal shape is { data, error, isValidating, isLoading, ... }.
  // Persist only when there's data and no error.
  if ("data" in v || "error" in v) {
    return v.data !== undefined && v.error === undefined
  }
  return true
}

function persist(map: Map<string, unknown>): void {
  try {
    const persistableEntries: SerialisedEntry[] = []
    for (const [key, value] of map) {
      if (typeof key !== "string") continue
      if (key.startsWith("$req$")) continue
      if (!isPersistable(value)) continue
      persistableEntries.push([key, value])
    }

    let payload: SerialisedCache = { v: CACHE_VERSION, entries: persistableEntries }
    let serialised = JSON.stringify(payload)

    // If we exceed the cap, drop the largest entries until we fit.
    // Sorting once is O(n log n) and only runs on the slow-path.
    if (serialised.length > MAX_CACHE_BYTES) {
      const sized = persistableEntries
        .map((e) => ({ entry: e, size: JSON.stringify(e).length }))
        .sort((a, b) => b.size - a.size)
      while (serialised.length > MAX_CACHE_BYTES && sized.length > 0) {
        sized.shift()
        payload = { v: CACHE_VERSION, entries: sized.map((s) => s.entry) }
        serialised = JSON.stringify(payload)
      }
    }

    localStorage.setItem(CACHE_KEY, serialised)
  } catch {
    // QuotaExceeded, JSON cyclic refs, etc. Cache is best-effort —
    // a failure here means the next reload won't have hydrated state,
    // which is annoying but never broken behaviour.
  }
}

function rehydrate(): Map<string, unknown> {
  if (typeof window === "undefined") return new Map()
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return new Map()
    const parsed = JSON.parse(raw) as SerialisedCache | unknown
    // Migration safety: if the stored shape doesn't match the current
    // version, discard it instead of mounting partially-broken values.
    if (
      !parsed ||
      typeof parsed !== "object" ||
      (parsed as SerialisedCache).v !== CACHE_VERSION ||
      !Array.isArray((parsed as SerialisedCache).entries)
    ) {
      localStorage.removeItem(CACHE_KEY)
      return new Map()
    }
    // Defensive: filter out any non-string keys that might exist in a
    // tampered payload. SWR keys are always strings in this codebase.
    const safeEntries = (parsed as SerialisedCache).entries.filter(
      (e): e is SerialisedEntry => Array.isArray(e) && typeof e[0] === "string"
    )
    return new Map(safeEntries)
  } catch {
    // Corrupt JSON. Drop and start fresh.
    try {
      localStorage.removeItem(CACHE_KEY)
    } catch {
      /* ignore */
    }
    return new Map()
  }
}

let registered = false

/**
 * SWR cache provider. Returns a Map that mirrors localStorage.
 *
 * Wired at the root via <SWRConfig provider={localStorageProvider}>.
 * This function runs once per page-mount; the listeners it registers
 * deliberately leak for the document lifetime.
 */
export function localStorageProvider(): Cache<unknown> {
  if (typeof window === "undefined") return new Map() as Cache<unknown>

  const map = rehydrate()

  if (!registered) {
    registered = true
    // pagehide covers mobile Safari and the bfcache eviction case.
    // beforeunload covers desktop reload / close.
    // visibilitychange "hidden" gives us a flush on tab-switch so the
    // most recent data survives even if the tab is later killed by the
    // OS without firing the unload events.
    const flush = () => persist(map)
    window.addEventListener("pagehide", flush)
    window.addEventListener("beforeunload", flush)
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") flush()
    })
  }

  // SWR's Cache<T> is a Map-like with state values; the actual
  // concrete shape we hand back is a Map, which satisfies the
  // structural interface SWR expects.
  return map as unknown as Cache<unknown>
}
