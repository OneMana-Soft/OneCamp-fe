// Calls the server makes public (booking pages, intake forms): plain fetch,
// so the signed-in axios instance (refresh, CSRF, logout) is never involved,
// as with guest links. Failures carry the server's message, written for people.

const backendBase = (process.env.NEXT_PUBLIC_BACKEND_URL || "").replace(/\/$/, "")

export type PublicResult<T> = { ok: true; data: T } | { ok: false; status: number; msg: string; retryAfter?: number }

export async function publicCall<T>(path: string, init?: RequestInit): Promise<PublicResult<T>> {
  try {
    const res = await fetch(backendBase + path, {
      ...init,
      headers: { Accept: "application/json", ...(init?.body ? { "Content-Type": "application/json" } : {}) },
    })
    const body = await res.json().catch(() => ({}))
    if (res.ok) return { ok: true, data: (body as { data: T }).data }
    return {
      ok: false,
      status: res.status,
      msg: (body as { msg?: string }).msg || "Something went wrong. Try again.",
      retryAfter: retryAfterSeconds(res.headers?.get?.("Retry-After") ?? null),
    }
  } catch {
    return { ok: false, status: 0, msg: "Couldn't reach the server. Check your connection and try again." }
  }
}

/**
 * What a failed public call means to a page that keeps itself up to date:
 * "gone" when the server answered that the thing isn't there (or isn't for
 * this person), "busy" when too many requests came from here (429), and
 * "unreachable" when nothing answered or the server failed (5xx). The last two
 * pass, so the page waits and tries again instead of saying the link is dead.
 */
export type PublicTrouble = "gone" | "busy" | "unreachable"

export function publicTrouble(status: number): PublicTrouble {
  if (status === 429) return "busy"
  if (status === 0 || status >= 500) return "unreachable"
  return "gone"
}

/** What a page says while it waits out a trouble that passes. */
export const retryingText: Record<Exclude<PublicTrouble, "gone">, string> = {
  busy: "Too many requests, wait a minute.",
  unreachable: "Couldn't reach the server, retrying…",
}

/** What to tell someone whose send failed: why to wait and try again, or the server's own words. */
export function sendFailedText(res: { status: number; msg: string }): string {
  switch (publicTrouble(res.status)) {
    case "busy":
      return "Too many requests, wait a minute and try again."
    case "unreachable":
      return "Couldn't reach the server. Try again in a moment."
    default:
      return res.msg
  }
}

/** A Retry-After header in seconds (it is either a number of seconds or a date), or undefined. Pure. */
export function retryAfterSeconds(header: string | null, now = Date.now()): number | undefined {
  if (!header) return undefined
  const h = header.trim()
  if (/^\d+$/.test(h)) return Number(h)
  const at = Date.parse(h)
  return Number.isNaN(at) ? undefined : Math.max(0, Math.ceil((at - now) / 1000))
}

const RETRY_MIN_MS = 5_000
const RETRY_MAX_MS = 60_000

/**
 * How long a page waits before asking again after its attempt-th failure in a
 * row (0 for the first): 5 seconds, doubling up to a minute, spread a quarter
 * either way so a page full of guests whose server restarted doesn't come back
 * all at once, and never sooner than the server's Retry-After. Pure given random.
 */
export function retryDelayMs(attempt: number, retryAfter?: number, random: () => number = Math.random): number {
  const base = Math.min(RETRY_MAX_MS, RETRY_MIN_MS * 2 ** Math.max(0, attempt))
  const spread = Math.min(RETRY_MAX_MS, Math.max(RETRY_MIN_MS, base * (0.75 + 0.5 * random())))
  return retryAfter && retryAfter > 0 ? Math.max(spread, retryAfter * 1000) : spread
}
