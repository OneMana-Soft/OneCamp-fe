import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// backendFetch is how a raw fetch reaches the API (a stream, the sign-in page's
// own checks): with the session's cookies, saying it is the web app that reads
// the CSRF token from answers, with the token on a write, keeping the token each
// answer names, and once more with a new token when the API refused a write for
// one that ran out. The API keeps a readable cookie on the zone only for a
// client that doesn't say so (a web build from before 21 Oct 2026).

type Call = { url: string; init: RequestInit }
let calls: Call[] = []
let answer: (c: Call) => Response

function headersOf(c: Call): Record<string, string> {
  return Object.fromEntries(new Headers(c.init.headers).entries())
}

beforeEach(() => {
  vi.resetModules()
  calls = []
  process.env.NEXT_PUBLIC_BACKEND_URL = "https://acme-api.onemana.dev/"
  document.cookie = "X-CSRF-Token=; Max-Age=0; path=/"
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const c = { url: String(url), init }
      calls.push(c)
      return answer(c)
    }),
  )
})
afterEach(() => vi.unstubAllGlobals())

const ok = (headers: Record<string, string> = {}) => new Response("{}", { status: 200, headers })

describe("backendFetch", () => {
  it("sends the session's cookies and says it is the web app", async () => {
    answer = () => ok()
    const { backendFetch } = await import("@/lib/http/backendFetch")
    await backendFetch("user/profile")
    expect(calls[0].url).toBe("https://acme-api.onemana.dev/user/profile")
    expect(calls[0].init.credentials).toBe("include")
    expect(headersOf(calls[0])["x-requested-with"]).toBe("XMLHttpRequest")
    expect(headersOf(calls[0])["x-csrf-token"]).toBeUndefined()
  })

  it("sends a first write with no token known once more, with the token its refusal named", async () => {
    answer = (c) =>
      headersOf(c)["x-csrf-token"] === "tok-1"
        ? ok({ "X-CSRF-Token": "tok-1" })
        : new Response("csrf token missing or invalid", { status: 403, headers: { "X-CSRF-Token": "tok-1" } })
    const { backendFetch } = await import("@/lib/http/backendFetch")
    const res = await backendFetch("auth/change-password", { method: "POST", body: "{}" })
    expect(res.status).toBe(200)
    expect(calls.map((c) => headersOf(c)["x-csrf-token"])).toEqual([undefined, "tok-1"])
  })

  it("keeps the token an answer names", async () => {
    answer = (c) => (c.init.method === "POST" ? ok() : ok({ "X-CSRF-Token": "from-a-read" }))
    const { backendFetch } = await import("@/lib/http/backendFetch")
    await backendFetch("user/profile")
    await backendFetch("auth/change-password", { method: "POST", body: "{}" })
    expect(calls).toHaveLength(2)
    expect(headersOf(calls[1])["x-csrf-token"]).toBe("from-a-read")
  })

  it("sends a refused write once more with the token its refusal named", async () => {
    let refused = false
    answer = (c) => {
      if (c.init.method !== "POST") return ok({ "X-CSRF-Token": "old" })
      if (!refused) {
        refused = true
        return new Response("csrf token missing or invalid", { status: 403, headers: { "X-CSRF-Token": "new" } })
      }
      return ok()
    }
    const { backendFetch } = await import("@/lib/http/backendFetch")
    await backendFetch("user/profile")
    const res = await backendFetch("auth/change-password", { method: "POST", body: "{}" })
    expect(res.status).toBe(200)
    expect(calls.filter((c) => c.init.method === "POST").map((c) => headersOf(c)["x-csrf-token"])).toEqual(["old", "new"])
  })

  it("keeps the caller's headers", async () => {
    answer = () => ok({ "X-CSRF-Token": "t" })
    const { backendFetch } = await import("@/lib/http/backendFetch")
    await backendFetch("user/profile")
    await backendFetch("ai/stream", { method: "POST", headers: { Accept: "text/event-stream", "Content-Type": "application/json" }, body: "{}" })
    const h = headersOf(calls[1])
    expect(h.accept).toBe("text/event-stream")
    expect(h["content-type"]).toBe("application/json")
    expect(h["x-csrf-token"]).toBe("t")
  })
})
