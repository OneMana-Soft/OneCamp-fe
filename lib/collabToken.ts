import axiosInstance from "@/lib/axiosInstance"

// The member's collaboration token, fetched once and reused until it is about
// to expire.
//
// WHY. Opening a doc waited for the page, then the doc's details, then the
// websocket, and only then asked for this token, one round trip after another.
// The token does not depend on the doc, so the page asks for it as it opens
// (warm) and the websocket finds it ready. It is a short-lived JWT, so it is
// reused only while its own expiry says it is good.

type TokenResponse = { data?: { token?: string }; token?: string }

// A token this close to expiry is fetched again rather than reused, so a
// connection made with it cannot be refused for expiring on the way.
const MARGIN_SEC = 60

let cached = ""
let inflight: Promise<string> | null = null

/** Seconds since the epoch at which a JWT expires, or 0 when it cannot be read. */
export function jwtExpiry(token: string): number {
  const part = token.split(".")[1]
  if (!part) return 0
  try {
    const json = atob(part.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(part.length / 4) * 4, "="))
    const exp = Number(JSON.parse(json)?.exp)
    return Number.isFinite(exp) ? exp : 0
  } catch {
    return 0
  }
}

/** Whether a token can still be used for a new connection. Pure. */
export function tokenStillFresh(token: string, nowSec: number): boolean {
  const exp = token ? jwtExpiry(token) : 0
  return exp > 0 && exp - MARGIN_SEC > nowSec
}

async function fetchToken(): Promise<string> {
  const url = `${(process.env.NEXT_PUBLIC_BACKEND_URL || "").replace(/\/+$/, "")}/auth/token`
  const res = await axiosInstance.get<TokenResponse>(url)
  const raw = res.data?.data?.token || res.data?.token || ""
  return raw.startsWith("Bearer ") ? raw.slice(7) : raw
}

/** The member's collaboration token: the cached one while fresh, else a new one.
 *  Concurrent callers share one request. */
export function memberCollabToken(): Promise<string> {
  if (tokenStillFresh(cached, Date.now() / 1000)) return Promise.resolve(cached)
  if (!inflight) {
    inflight = fetchToken()
      .then((t) => {
        cached = t
        return t
      })
      .finally(() => {
        inflight = null
      })
  }
  return inflight
}

/** Fetch the token ahead of need. Errors are left for the real caller to meet. */
export function warmCollabToken(): void {
  memberCollabToken().catch(() => {})
}

/** Drop the cached token, after the server refused it. */
export function forgetCollabToken(): void {
  cached = ""
}
