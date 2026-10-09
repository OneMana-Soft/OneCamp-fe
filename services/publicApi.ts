// Calls the server makes public (booking pages, intake forms): plain fetch,
// so the signed-in axios instance (refresh, CSRF, logout) is never involved,
// as with guest links. Failures carry the server's message, written for people.

const backendBase = (process.env.NEXT_PUBLIC_BACKEND_URL || "").replace(/\/$/, "")

export type PublicResult<T> = { ok: true; data: T } | { ok: false; status: number; msg: string }

export async function publicCall<T>(path: string, init?: RequestInit): Promise<PublicResult<T>> {
  try {
    const res = await fetch(backendBase + path, {
      ...init,
      headers: { Accept: "application/json", ...(init?.body ? { "Content-Type": "application/json" } : {}) },
    })
    const body = await res.json().catch(() => ({}))
    if (res.ok) return { ok: true, data: (body as { data: T }).data }
    return { ok: false, status: res.status, msg: (body as { msg?: string }).msg || "Something went wrong. Try again." }
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
