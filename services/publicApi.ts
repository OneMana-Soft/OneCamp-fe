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
