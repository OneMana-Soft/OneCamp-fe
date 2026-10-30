/**
 * The session's one refresh. Every path that refreshes the access cookie (the
 * API client, the streaming fetch, the sign-in page's check) goes through
 * refreshSession: one refresh in flight per tab, every caller sharing its
 * answer, and one across tabs (lib/auth/sessionRefreshRun, loaded the first
 * time a refresh is needed, keeps it off every route's first load).
 *
 * The time the cookie was issued is kept in localStorage, which every tab
 * shares as they share the cookie: a tab whose cookie is near or past its end
 * refreshes before its next request leaves (sessionIsStale). A tab that knows
 * of no session has no clock, so it never refreshes. QA SH-16, audit S3.
 */

/** The access cookie lasts five minutes (server: authCookieExpiryTime). */
const ACCESS_TTL_MS = 5 * 60 * 1000
/** A cookie this close to its end is refreshed before the next request leaves. */
const REFRESH_SKEW_MS = 45 * 1000
export const PROACTIVE_AFTER_MS = ACCESS_TTL_MS - REFRESH_SKEW_MS

const ISSUED_AT_KEY = "onecamp:token-issued-at"

function readIssuedAt(now: number = Date.now()): number | null {
  try {
    const at = Number(localStorage.getItem(ISSUED_AT_KEY))
    return Number.isFinite(at) && at > 0 && at <= now ? at : null
  } catch {
    return null
  }
}

function keepIssuedAt(at: number): void {
  issuedAt = at
  try {
    localStorage.setItem(ISSUED_AT_KEY, String(at))
  } catch {
    // Storage refused: this tab keeps its own clock.
  }
}

let issuedAt: number | null = null
if (typeof window !== "undefined") {
  issuedAt = readIssuedAt()
  // Another tab's refresh is this tab's too; its sign-out clears storage.
  window.addEventListener("storage", (e) => {
    if (e.key === ISSUED_AT_KEY || e.key === null) issuedAt = readIssuedAt()
  })
}

/** Whether the access cookie is near or past its end, by the last refresh any tab made. */
export function sessionIsStale(now: number = Date.now()): boolean {
  return issuedAt !== null && now - issuedAt >= PROACTIVE_AFTER_MS
}

/** The app saw the member: a tab with no clock (signed in without a reload) starts it, for every tab. */
export function sessionHeld(): void {
  if (issuedAt === null) keepIssuedAt(Date.now())
}

let inflight: Promise<void> | null = null

// The refresh's own code is fetched once the page is idle, off its first
// load, so the first refresh needn't wait for it.
if (typeof window !== "undefined") {
  const warm = () => void import("./sessionRefreshRun").catch(() => {})
  const idle = (window as { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback
  if (idle) idle(warm)
  else setTimeout(warm, 0)
}

/**
 * Refreshes the session, once for everyone asking. Resolves once the cookie
 * is fresh; rejects with the refresh's own error (a 401 is a session that has
 * ended, which the caller decides what to do about).
 */
export function refreshSession(): Promise<void> {
  if (inflight) return inflight
  // What this tab knew when it asked: a newer refresh by another tab, still
  // fresh, is the one it needs.
  const knew = issuedAt ?? 0
  inflight = import("./sessionRefreshRun")
    .then(({ runRefresh }) =>
      runRefresh({
        knew,
        kept: () => readIssuedAt(),
        fresh: (at) => Date.now() - at < PROACTIVE_AFTER_MS,
        adopt: (at) => {
          issuedAt = at
        },
        keep: keepIssuedAt,
        forget: () => {
          issuedAt = null
        },
      }),
    )
    .finally(() => {
      inflight = null
    })
  return inflight
}
