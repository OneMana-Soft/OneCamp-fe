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
 *   - Only what the first screens show is written down (KEPT), and nothing
 *     that carries a credential. Every response used to be: the realtime
 *     connection's token and topics among them, which the next load used
 *     without asking again, so whoever signed in next on that browser was
 *     connected as the member before them.
 *   - It's one member's. It's written down with their id, and held back on
 *     the next load until the profile, asked for afresh, says who is signed
 *     in: their own cache is used, anyone else's is dropped unseen
 *     (MemberCache). It ends with the session, in every tab (lib/sessionEnd).
 */

import type { Cache } from "swr"

import { onSessionEnd } from "@/lib/sessionEnd"
import { GetEndpointUrl } from "@/services/endPoints"

const CACHE_KEY = "onecamp-app-cache"
const CACHE_VERSION = 3 // bump when the serialised shape changes
// Written down for the next load: parsing it blocks the first paint, so it
// stays small; the newest responses are what that paint needs.
export const MAX_CACHE_BYTES = 2 * 1024 * 1024
// Responses kept in memory. A screen reads a few dozen; this is many screens.
export const MAX_ENTRIES = 300

/**
 * The responses written down for the next load: what the first screens show
 * (the sidebar, the lists, a conversation's latest messages), so they paint
 * from the last visit while they're asked for again. Each is read with
 * useFetch, which asks again on mount. Everything else lives for the page
 * only: above all the realtime connection's token and topics, the profile
 * (whose session this is, so it's always asked for), signed file links,
 * guest and share links, tokens and admin settings.
 */
const KEPT: readonly string[] = [
  GetEndpointUrl.SelfProfileSideNav,
  GetEndpointUrl.GetUserActiveChannelList,
  GetEndpointUrl.ChannelBasicInfo,
  GetEndpointUrl.GetChannelLatestPost,
  GetEndpointUrl.GetUserLatestChatList,
  GetEndpointUrl.GetChatLatestMessage,
  GetEndpointUrl.GetGroupChatLatestMessage,
  GetEndpointUrl.GetUnifiedActivity,
  GetEndpointUrl.GetMentionActivity,
  GetEndpointUrl.GetUserTaskList,
  GetEndpointUrl.GetUserTaskListForKanban,
  GetEndpointUrl.GetUserProjectList,
  GetEndpointUrl.GetUserTeamList,
  GetEndpointUrl.GetUserPrivateDocList,
  GetEndpointUrl.GetUserPublicDocList,
  GetEndpointUrl.GetAllUser,
  GetEndpointUrl.BotKinds,
]

/** Whether a response is written down for the next load (KEPT). Pure. */
export function isKept(key: unknown): key is string {
  return typeof key === "string" && KEPT.some((path) => key === path || key.startsWith(`${path}/`) || key.startsWith(`${path}?`))
}

/** The response that says who is signed in. */
const PROFILE_KEY: string = GetEndpointUrl.SelfProfile

/** The member a cached profile response is for, or null. */
function memberOf(value: unknown): string | null {
  const uuid = (value as { data?: { data?: { user_uuid?: unknown } } } | null | undefined)?.data?.data?.user_uuid
  return typeof uuid === "string" && uuid !== "" ? uuid : null
}

/**
 * A Map that forgets the entries read or written least recently beyond its
 * limit. What is on screen is read on every render, so it stays; a response
 * read again after being forgotten is fetched again, as on a first visit.
 *
 * Reading never reorders the Map: SWR walks the cache's keys while it reads
 * entries (a global mutate does), and a Map walk visits a key that is moved to
 * the end again, so moving on read made that walk endless and froze the page.
 * Recency is kept beside the Map instead.
 */
export class RecentCache<V> extends Map<string, V> {
  private readonly used = new Map<string, number>()
  private clock = 0

  constructor(entries: Iterable<readonly [string, V]> = [], private readonly limit = MAX_ENTRIES) {
    super()
    for (const [k, v] of entries) this.set(k, v)
  }

  get(key: string): V | undefined {
    if (super.has(key)) this.used.set(key, ++this.clock)
    return super.get(key)
  }

  set(key: string, value: V): this {
    super.set(key, value)
    this.used.set(key, ++this.clock)
    if (this.limit) {
      while (this.size > this.limit) {
        let oldest: string | undefined
        let at = Infinity
        for (const [k, t] of this.used) if (t < at && k !== key) (at = t), (oldest = k)
        if (oldest === undefined) break
        this.delete(oldest)
      }
    }
    return this
  }

  delete(key: string): boolean {
    this.used.delete(key)
    return super.delete(key)
  }

  clear(): void {
    this.used.clear()
    super.clear()
  }

  /** Keys, most recently read or written first. */
  recentFirst(): string[] {
    return [...this.used.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k)
  }
}

type SerialisedEntry = [string, unknown]
type SerialisedCache = { v: number; member: string; entries: SerialisedEntry[] }

function dropStored(): void {
  try {
    localStorage.removeItem(CACHE_KEY)
  } catch {
    /* storage unavailable: nothing was written either */
  }
}

/**
 * The cache SWR uses: a RecentCache that knows whose responses it holds.
 *
 * What the last load wrote down is held back, out of SWR's sight, until the
 * profile is set: SWR sets it from the server's answer, since the profile is
 * never written down. If that answer is the member the cache was written for,
 * their responses are let in; if it's anyone else, they're dropped, from
 * storage too. The app shows nothing until the profile has answered
 * (AppProtectedRoute), so the screens never show the last member's.
 */
export class MemberCache extends RecentCache<unknown> {
  /** Whose responses these are, once the profile has said; null until then. */
  member: string | null = null
  // Someone else's profile was set after the member's: the page's responses
  // are no one's to write down.
  private retired = false
  private held: SerialisedEntry[]
  private heldFor: string | null

  constructor(held: SerialisedEntry[] = [], heldFor: string | null = null) {
    super()
    this.held = held
    this.heldFor = heldFor
  }

  set(key: string, value: unknown): this {
    super.set(key, value)
    if (key === PROFILE_KEY) this.signedIn(memberOf(value))
    return this
  }

  clear(): void {
    this.held = []
    this.heldFor = null
    super.clear()
  }

  private signedIn(member: string | null): void {
    if (!member || member === this.member || this.retired) return
    if (this.member) {
      // The session changed under this page (someone signed in in another
      // tab). What it has is the last member's.
      this.retired = true
      this.member = null
      dropStored()
      return
    }
    this.member = member
    const held = this.held
    const heldFor = this.heldFor
    this.held = []
    this.heldFor = null
    if (heldFor !== member) {
      if (heldFor !== null) dropStored()
      return
    }
    for (const [key, value] of held) if (!this.has(key)) super.set(key, value)
    // Recent again, so letting the others in never pushes it out.
    this.get(PROFILE_KEY)
  }
}

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
 * An entry as the next load should find it: at rest. SWR's in-flight flags
 * describe a request of this page, which the next load doesn't have; restored,
 * they said a response was on its way when none was (lib/swrMutate
 * patchCached reads them). They're written false rather than left out: SWR
 * takes a missing flag as loading, and screens that wait on it showed a
 * skeleton over the cached data.
 */
function atRest(value: unknown): unknown {
  if (value === null || typeof value !== "object" || !("isValidating" in value || "isLoading" in value)) return value
  return { ...(value as Record<string, unknown>), isValidating: false, isLoading: false }
}

/**
 * The cache as written down for `member`: the most recently read entries that
 * are kept (isKept) and fit in budget, oldest first so a reload restores their
 * order. Each entry is serialised once (this used to re-serialise the whole
 * cache once per entry it dropped when over budget). Pure, for its test.
 */
export function serialise(map: Map<string, unknown>, member: string, budget = MAX_CACHE_BYTES): string {
  const recentFirst: [string, unknown][] =
    map instanceof RecentCache ? map.recentFirst().map((k) => [k, Map.prototype.get.call(map, k)]) : [...map.entries()].reverse()
  const parts: string[] = []
  let used = 0
  for (const [key, value] of recentFirst) {
    if (!isKept(key) || !isPersistable(value)) continue
    let part: string
    try {
      part = JSON.stringify([key, atRest(value)] satisfies SerialisedEntry)
    } catch {
      continue
    }
    // An entry bigger than what is left is skipped; a smaller, older one may still fit.
    if (used + part.length + 1 > budget) continue
    parts.push(part)
    used += part.length + 1
  }
  return `{"v":${CACHE_VERSION},"member":${JSON.stringify(member)},"entries":[${parts.reverse().join(",")}]}`
}

function persist(map: MemberCache): void {
  // Until the profile has said whose page this is, what's written down stays
  // as it was: the next load holds it back and checks it again.
  if (!map.member) return
  try {
    localStorage.setItem(CACHE_KEY, serialise(map, map.member))
  } catch {
    // QuotaExceeded, JSON cyclic refs, etc. Cache is best-effort —
    // a failure here means the next reload won't have hydrated state,
    // which is annoying but never broken behaviour.
  }
}

function rehydrate(): MemberCache {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return new MemberCache()
    const parsed = JSON.parse(raw) as Partial<SerialisedCache> | null
    // Migration safety: if the stored shape doesn't match the current
    // version, or doesn't say whose it is, discard it instead of mounting
    // partially-broken values.
    if (
      !parsed ||
      typeof parsed !== "object" ||
      parsed.v !== CACHE_VERSION ||
      typeof parsed.member !== "string" ||
      parsed.member === "" ||
      !Array.isArray(parsed.entries)
    ) {
      dropStored()
      return new MemberCache()
    }
    // Defensive: only what this build keeps, under string keys, from a
    // tampered or older payload.
    const kept = parsed.entries.filter((e): e is SerialisedEntry => Array.isArray(e) && isKept(e[0]))
    return new MemberCache(kept, parsed.member)
  } catch {
    // Corrupt JSON. Drop and start fresh.
    dropStored()
    return new MemberCache()
  }
}

// The map SWR is using now, which is the one written down. Null once the
// session has ended, so a response that lands while the page is on its way out
// is never kept for whoever signs in next.
let current: MemberCache | null = null
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
  dropStored()
}

onSessionEnd(forgetCache)
