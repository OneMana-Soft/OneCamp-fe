/**
 * Something started while signed out, carried on after any sign-in: kept in
 * sessionStorage (this tab), taken once by the app shell, at most half an
 * hour old. Only ids are kept, checked again when taken; the path is always
 * built here, so a stored value can't become a redirect. Kinds: connect (an
 * agent's sign-in) and copyPage (a published page's copy, docs C6). Loaded
 * only when something is kept or taken (lib/afterSignInWaits).
 */

import { AFTER_SIGN_IN_KEY as KEY, isConnectRequestId } from "@/lib/afterSignInWaits"

export const AFTER_SIGN_IN_MAX_MS = 30 * 60 * 1000
// As the server keeps a page's address (business/Guest normaliseSlug): lower case, dashes between, at most 64.
const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/
// A password page's short-lived unlock: url-safe characters only.
const UNLOCK = /^[A-Za-z0-9._~-]{1,512}$/

export type AfterSignIn = { kind: "connect"; id: string } | { kind: "copyPage"; slug: string; k?: string | null }

/** Where to carry on, or null for anything that isn't well formed. Pure. */
export function resumePath(want: unknown): string | null {
  if (!want || typeof want !== "object") return null
  const w = want as Record<string, unknown>
  if (w.kind === "connect") {
    return typeof w.id === "string" && isConnectRequestId(w.id) ? `/connect/authorize?request=${encodeURIComponent(w.id)}` : null
  }
  if (w.kind === "copyPage") {
    if (typeof w.slug !== "string" || !SLUG.test(w.slug)) return null
    if (w.k != null && (typeof w.k !== "string" || !UNLOCK.test(w.k))) return null
    const k = typeof w.k === "string" && w.k ? `&k=${encodeURIComponent(w.k)}` : ""
    return `/p/${encodeURIComponent(w.slug)}?copy=1${k}`
  }
  return null
}

/** Keeps what to carry on with after sign-in, replacing anything kept before. Nothing for a malformed one. */
export function rememberAfterSignIn(want: AfterSignIn, now: number = Date.now()): void {
  if (!resumePath(want)) return
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ ...want, at: now }))
  } catch {
    /* private mode: the person starts it again after signing in */
  }
}

/** The page to carry on at, once, or null. */
export function takeAfterSignIn(now: number = Date.now()): string | null {
  let raw: string | null = null
  try {
    raw = sessionStorage.getItem(KEY)
    sessionStorage.removeItem(KEY)
  } catch {
    return null
  }
  if (!raw) return null
  try {
    const want = JSON.parse(raw) as { at?: unknown }
    if (typeof want?.at !== "number" || now - want.at > AFTER_SIGN_IN_MAX_MS || want.at > now + 60_000) return null
    return resumePath(want)
  } catch {
    return null
  }
}
