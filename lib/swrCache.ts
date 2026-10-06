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
 *   - Bounded memory: the cache keeps the responses read most recently,
 *     up to MAX_ENTRIES, and forgets the oldest. SWR's own cache never
 *     forgets, so a day of opening channels, tasks and docs kept every
 *     response in memory until the tab was closed.
 *   - Bounded localStorage: the most recently read responses that fit in
 *     MAX_CACHE_BYTES are written down, each serialised once.
 *   - Cross-version safe: if the cache was serialised by an older
 *     schema, we drop it instead of crashing.
 *   - Avoid persisting transient/error states: SWR stores errors and
 *     in-flight states in the same Map; we strip them so an offline
 *     tick doesn't poison the next reload.
 */

import type { Cache } from "swr"

import { onSessionEnd } from "@/lib/sessionEnd"

const CACHE_KEY = "onecamp-app-cache"
const CACHE_VERSION = 2 // bump when the serialised shape changes
// Written down for the next load: parsing it blocks the first paint, so it
// stays small; the newest responses are what that paint needs.
export const MAX_CACHE_BYTES = 2 * 1024 * 1024
// Responses kept in memory. A screen reads a few dozen; this is many screens.
export const MAX_ENTRIES = 300

/**
 * A Map that remembers the order entries were last read or written, and
 * forgets the least recent beyond its limit. What is on screen is read on
 * every render, so it stays; a response read again after being forgotten is
 * fetched again, as on a first visit.
 */
export class RecentCache<V> extends Map<string, V> {
  constructor(entries: Iterable<readonly [string, V]> = [], private readonly limit = MAX_ENTRIES) {
    super()
    for (const [k, v] of entries) this.set(k, v)
  }

  get(key: string): V | undefined {
    if (!super.has(key)) return undefined
    const v = super.get(key) as V
    super.delete(key)
    super.set(key, v)
    return v
  }

  set(key: string, value: V): this {
    super.delete(key)
    super.set(key, value)
    // During construction (Map calls set before fields exist) limit is unset.
    if (this.limit) {
      for (const oldest of super.keys()) {
        if (this.size <= this.limit) break
        super.delete(oldest)
      }
    }
    return this
  }
}

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

/**
 * The cache as written down: the most recently read entries that fit in
 * budget, oldest first so a reload restores their order. Each entry is
 * serialised once (this used to re-serialise the whole cache once per entry
 * it dropped when over budget). Pure, for its test.
 */
export function serialise(map: Map<string, unknown>, budget = MAX_CACHE_BYTES): string {
  const recentFirst = [...map.entries()].reverse()
  const parts: string[] = []
  let used = 0
  for (const [key, value] of recentFirst) {
    if (typeof key !== "string" || key.startsWith("$req$") || !isPersistable(value)) continue
    let part: string
    try {
      part = JSON.stringify([key, value] satisfies SerialisedEntry)
    } catch {
      continue
    }
    // An entry bigger than what is left is skipped; a smaller, older one may still fit.
    if (used + part.length + 1 > budget) continue
    parts.push(part)
    used += part.length + 1
  }
  return `{"v":${CACHE_VERSION},"entries":[${parts.reverse().join(",")}]}`
}

function persist(map: Map<string, unknown>): void {
  try {
    localStorage.setItem(CACHE_KEY, serialise(map))
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
    if (!raw) return new RecentCache()
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
      return new RecentCache()
    }
    // Defensive: filter out any non-string keys that might exist in a
    // tampered payload. SWR keys are always strings in this codebase.
    const safeEntries = (parsed as SerialisedCache).entries.filter(
      (e): e is SerialisedEntry => Array.isArray(e) && typeof e[0] === "string"
    )
    return new RecentCache(safeEntries)
  } catch {
    // Corrupt JSON. Drop and start fresh.
    try {
      localStorage.removeItem(CACHE_KEY)
    } catch {
      /* ignore */
    }
    return new RecentCache()
  }
}

// The map SWR is using now, which is the one written down. Null once the
// session has ended, so a response that lands while the page is on its way out
// is never kept for whoever signs in next.
let current: Map<string, unknown> | null = null
let registered = false

function flush(): void {
  if (current) persist(current)
}

/**
 * SWR cache provider. Returns a Map that mirrors localStorage.
 *
 * Wired at the root via <SWRConfig provider={localStorageProvider}>.
 * This function runs once per page-mount; the listeners it registers
 * deliberately leak for the document lifetime.
 *
 * The public return type is SWR's `Cache<unknown>` (what SWRConfig's
 * `provider` prop expects). The concrete runtime value is a `Map`; SWR's
 * `Cache.get` is typed to return `State<T>` rather than the raw stored
 * value, so a `Map` is structurally wider than `Cache` and needs a cast
 * here. Tests that need Map-only members (`.size`) narrow the result
 * themselves since they exercise the concrete implementation.
 */
export function localStorageProvider(): Cache<unknown> {
  if (typeof window === "undefined") return new Map() as unknown as Cache<unknown>

  const map = rehydrate()
  current = map

  if (!registered) {
    registered = true
    // pagehide covers mobile Safari and the bfcache eviction case.
    // beforeunload covers desktop reload / close.
    // visibilitychange "hidden" gives us a flush on tab-switch so the
    // most recent data survives even if the tab is later killed by the
    // OS without firing the unload events.
    window.addEventListener("pagehide", flush)
    window.addEventListener("beforeunload", flush)
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") flush()
    })
  }

  return map as unknown as Cache<unknown>
}

/** Drop the member's cached responses, in memory and in storage, and stop
 *  writing them down until the next session's provider starts. */
function forgetCache(): void {
  current?.clear()
  current = null
  try {
    localStorage.removeItem(CACHE_KEY)
  } catch {
    /* storage unavailable: nothing was written either */
  }
}

onSessionEnd(forgetCache)
