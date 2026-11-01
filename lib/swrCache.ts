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
import { rememberedMember } from "@/lib/memberMark"
import { unanswered } from "@/lib/http/answered"
import { CLIENT_CONFIG_KEY } from "@/lib/clientConfigKey"
import { GetEndpointUrl } from "@/services/endPoints"
import { MAX_ENTRIES, RecentCache } from "@/lib/recentCache"

const CACHE_KEY = "onecamp-app-cache"
const CACHE_VERSION = 3 // bump when the serialised shape changes
// Written down for the next load: parsing it blocks the first paint, so it
// stays small; the newest responses are what that paint needs.
export const MAX_CACHE_BYTES = 2 * 1024 * 1024
// Responses kept in memory: MAX_ENTRIES, in lib/recentCache with the Map that keeps them.
export { MAX_ENTRIES, RecentCache }

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
  // What this server has (AI, calls…), so a read that fails on the next load
  // keeps the features it last had (hooks/useClientConfig).
  CLIENT_CONFIG_KEY,
]

/**
 * A project's board, per project id: what a cold start needs to open the board
 * the member left (asana-12), its statuses included (lib/projectStatusesKey:
 * the board draws its columns once they're read). Over budget, a board gives
 * way first, the least recently opened first, and never makes room by leaving
 * out a first screen.
 */
const BOARDS: readonly (string | RegExp)[] = [GetEndpointUrl.GetProjectInfo, GetEndpointUrl.GetProjectTaskListForKanban, /^\/project\/[^/?]+\/statuses$/]

const under = (paths: readonly (string | RegExp)[], key: string) =>
  paths.some((path) => (typeof path === "string" ? key === path || key.startsWith(`${path}/`) || key.startsWith(`${path}?`) : path.test(key)))

/** Whether a response is written down for the next load (KEPT or BOARDS). Pure. */
export function isKept(key: unknown): key is string {
  return typeof key === "string" && (under(KEPT, key) || under(BOARDS, key))
}

/** The response that says who is signed in. */
const PROFILE_KEY: string = GetEndpointUrl.SelfProfile

/** The member a cached profile response is for, or null. */
function memberOf(value: unknown): string | null {
  const uuid = (value as { data?: { data?: { user_uuid?: unknown } } } | null | undefined)?.data?.data?.user_uuid
  return typeof uuid === "string" && uuid !== "" ? uuid : null
}

type SerialisedEntry = [string, unknown]
type SerialisedCache = { v: number; member: string; profile?: unknown; entries: SerialisedEntry[] }

function dropStored(): void {
  try {
    localStorage.removeItem(CACHE_KEY)
  } catch {
    /* storage unavailable: nothing was written either */
  }
}

// The server's word that a key isn't the member's to read: signed out (401), refused (403), or gone (404).
const refused = (error: unknown) => [401, 403, 404].includes(Number((error as { response?: { status?: unknown } })?.response?.status))

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
  // The profile written down with the held answers, for a start the server never answers (keptProfile).
  private keptProfile: unknown
  // Each answer let in from the device, by key, until this page has its own (serverSaid).
  private fromDevice = new Map<string, unknown>()

  constructor(held: SerialisedEntry[] = [], heldFor: string | null = null, keptProfile?: unknown) {
    super()
    this.held = held
    this.heldFor = heldFor
    this.keptProfile = keptProfile
  }

  /** The profile kept for the member the held answers are for, while no profile has been set here. */
  offlineProfile(): unknown {
    if (this.member || this.retired || !this.heldFor) return undefined
    return (this.keptProfile as { data?: unknown } | undefined)?.data
  }

  set(key: string, value: unknown): this {
    super.set(key, this.fromDevice.has(key) ? this.serverSaid(key, value) : value)
    if (key === PROFILE_KEY) this.signedIn(memberOf(value))
    return this
  }

  clear(): void {
    this.held = []
    this.heldFor = null
    this.keptProfile = undefined
    this.fromDevice.clear()
    super.clear()
  }

  // An answer the device kept shows until the server's word on its key. A refusal takes it back, so the screen
  // shows the refusal (a member since removed, a thing since deleted), never what the device kept; no answer, or a
  // failing server, isn't its word, and it stays (offline). Once this page has its own answer, SWR's rules hold.
  private serverSaid(key: string, value: unknown): unknown {
    const v = (value ?? {}) as { data?: unknown; error?: unknown }
    const kept = v.data === this.fromDevice.get(key)
    if (kept && !refused(v.error)) return value
    this.fromDevice.delete(key)
    return kept ? { ...v, data: undefined } : value
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
    this.keptProfile = undefined
    const held = this.held
    const heldFor = this.heldFor
    this.held = []
    this.heldFor = null
    if (heldFor !== member) {
      if (heldFor !== null) dropStored()
      return
    }
    for (const [key, value] of held) {
      if (this.has(key)) continue
      super.set(key, value)
      this.fromDevice.set(key, (value as { data?: unknown } | null)?.data)
    }
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
  // Persist the data unless the server refused the key. No answer, or a failing server, isn't its word, so the last
  // answer stays (offline, every kept key's refresh fails beside its data). A refused answer is never written back,
  // even one this page fetched itself: serverSaid takes back only what the device kept.
  if ("data" in v || "error" in v) {
    return v.data !== undefined && !refused(v.error)
  }
  return true
}

/**
 * An entry as the next load should find it: at rest. SWR's in-flight flags
 * describe a request of this page, which the next load doesn't have; restored,
 * they said a response was on its way when none was (lib/swrMutate
 * patchCached reads them). They're written false rather than left out: SWR
 * takes a missing flag as loading, and screens that wait on it showed a
 * skeleton over the cached data. A failed refresh's error is this page's too,
 * so it's left out (JSON drops the undefined), and the next load finds the data.
 */
function atRest(value: unknown): unknown {
  if (value === null || typeof value !== "object" || !("isValidating" in value || "isLoading" in value || "error" in value)) return value
  return { ...(value as Record<string, unknown>), isValidating: false, isLoading: false, error: undefined }
}

// The member's own profile, written down beside their answers for a start the server never answers
// (keptProfile). Never another member's; nothing when there is none.
function profilePart(map: Map<string, unknown>, member: string): string {
  const profile = Map.prototype.get.call(map, PROFILE_KEY)
  if (memberOf(profile) !== member || !isPersistable(profile)) return ""
  try {
    return `"profile":${JSON.stringify(atRest(profile))},`
  } catch {
    return ""
  }
}

/**
 * The cache as written down for `member`: the most recently read entries that
 * are kept (isKept) and fit in budget, first screens before boards, oldest first so a reload restores their
 * order. Each entry is serialised once (this used to re-serialise the whole
 * cache once per entry it dropped when over budget). Pure, for its test.
 */
export function serialise(map: Map<string, unknown>, member: string, budget = MAX_CACHE_BYTES): string {
  const recentFirst: [string, unknown][] =
    map instanceof RecentCache ? map.recentFirst().map((k) => [k, Map.prototype.get.call(map, k)]) : [...map.entries()].reverse()
  // First screens first, then boards (a stable sort keeps each one's recency), so a board gives way first.
  recentFirst.sort(([a], [b]) => Number(under(BOARDS, a)) - Number(under(BOARDS, b)))
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
  return `{"v":${CACHE_VERSION},"member":${JSON.stringify(member)},${profilePart(map, member)}"entries":[${parts.reverse().join(",")}]}`
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
    return new MemberCache(kept, parsed.member, memberOf(parsed.profile) === parsed.member ? parsed.profile : undefined)
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
// The Offline Store (lib/offline) is the member's too and goes with the
// session: its wipe loads only then, so no route's first load carries it.
onSessionEnd(() => import("@/lib/offline/wipe").then((m) => m.wipeOfflineStore()))

/**
 * The profile this device kept for the member it last confirmed, for a start
 * the server never answered: no network, or nothing getting through
 * (AppProtectedRoute, asana-12). Only while this browser's member mark is set
 * (every sign-out clears it, and this cache with it), only before a profile
 * has been set on this page, and only for the member the kept answers are
 * for. A refusal or any other answer is the server's word: nothing kept is used.
 */
export function keptProfile(error: unknown): unknown {
  if (!unanswered(error) || !rememberedMember() || !current) return undefined
  return current.offlineProfile()
}
