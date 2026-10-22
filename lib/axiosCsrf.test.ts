import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// The CSRF token comes from the API's answers, not from a cookie (COOKIE-SCOPE,
// 21 Oct 2026). It used to be read from document.cookie: a cookie the API wrote
// on the parent domain, which on Cloud is the zone (onemana.dev), where every
// workspace wrote its own under the same name and any page could read or write
// it. Now the API's CSRF cookie is its own and HttpOnly, every answer names the
// token in its X-CSRF-Token header, and the client sends that one back.
//
// The real client, through axios's fetch adapter, so axios's own XSRF logic
// (which reads document.cookie in a browser) runs as it does in the app. The
// API is a function: tests never reach the network (vitest.setup.ts).

vi.mock("@/store/store", () => ({ default: { dispatch: vi.fn() } }))
vi.mock("@/store/slice/refreshSlice", () => ({ updateRefreshTokenStatus: vi.fn() }))
vi.mock("@/hooks/use-toast", () => ({ toast: vi.fn() }))
vi.mock("@/lib/sessionEnd", () => ({ endSession: vi.fn() }))
vi.mock("@/lib/http/loadFailure", () => ({ tellReadFailure: vi.fn() }))

const BACKEND = "https://acme-api.onemana.dev"

type Seen = { method: string; path: string; client: string | null; token: string | null }

let seen: Seen[] = []
// The API: the token in force, which it names in every answer and holds writes
// to (as the real one does); refuse, to refuse a write anyway; older, an API
// from before 21 Oct 2026, which names no token and holds writes to nothing.
let api: { token?: string; refuse?: (s: Seen) => string | undefined; older?: boolean } = {}

async function fakeAPI(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const req = input instanceof Request ? input : new Request(String(input), init)
  const url = new URL(req.url)
  const s: Seen = {
    method: req.method,
    path: url.pathname,
    client: req.headers.get("X-Requested-With"),
    token: req.headers.get("X-CSRF-Token"),
  }
  seen.push(s)
  const headers: Record<string, string> = { "content-type": "application/json" }
  const refusal = api.refuse?.(s)
  if (refusal !== undefined) {
    if (refusal) headers["X-CSRF-Token"] = refusal
    return new Response(JSON.stringify({ msg: "csrf token missing or invalid" }), { status: 403, headers })
  }
  if (!api.older && api.token) {
    headers["X-CSRF-Token"] = api.token
    if (s.method !== "GET" && s.token !== api.token) {
      return new Response(JSON.stringify({ msg: "csrf token missing or invalid" }), { status: 403, headers })
    }
  }
  return new Response(JSON.stringify({ msg: "ok" }), { status: 200, headers })
}

async function client() {
  vi.resetModules()
  const { default: instance } = await import("@/lib/axiosInstance")
  instance.defaults.baseURL = BACKEND
  instance.defaults.adapter = "fetch"
  instance.defaults.env = { ...instance.defaults.env, fetch: fakeAPI }
  return instance
}

beforeEach(() => {
  seen = []
  api = {}
  process.env.NEXT_PUBLIC_BACKEND_URL = `${BACKEND}/`
  vi.stubGlobal("fetch", fakeAPI)
  document.cookie = "X-CSRF-Token=; Max-Age=0; path=/"
})
afterEach(() => vi.unstubAllGlobals())

const writes = () => seen.filter((s) => s.method !== "GET")

describe("the API client and the CSRF token", () => {
  it("says on every request that it is the web app that reads the token from answers", async () => {
    api.token = "server-token"
    const http = await client()
    await http.get("/user/profile")
    await http.post("/channel/create", { name: "x" })
    expect(seen.map((s) => s.client)).toEqual(["XMLHttpRequest", "XMLHttpRequest"])
  })

  it("sends back the token the last answer named, never a cookie on the zone", async () => {
    // Another workspace's server wrote this one on the zone.
    document.cookie = "X-CSRF-Token=zone-value; path=/"
    api.token = "server-token"
    const http = await client()
    await http.get("/user/profile")
    await http.post("/channel/create", { name: "x" })
    expect(writes().map((s) => s.token)).toEqual(["server-token"])
  })

  it("keeps the token out of reads", async () => {
    document.cookie = "X-CSRF-Token=zone-value; path=/"
    api.token = "server-token"
    const http = await client()
    await http.get("/user/profile")
    await http.get("/channel/list")
    expect(seen.map((s) => s.token)).toEqual([null, null])
  })

  it("sends a first write that no read came before once more, with the token its refusal named", async () => {
    // The zone cookie is all it has: another workspace's.
    document.cookie = "X-CSRF-Token=zone-value; path=/"
    api.token = "server-token"
    const http = await client()
    const res = await http.post("/channel/create", { name: "x" })
    expect(res.status).toBe(200)
    expect(writes().map((s) => s.token)).toEqual(["zone-value", "server-token"])
  })

  it("takes the cookie from an API that names no token (one from before 21 Oct 2026)", async () => {
    api.older = true
    document.cookie = "X-CSRF-Token=old-api-value; path=/"
    const http = await client()
    await http.get("/user/profile")
    await http.post("/channel/create", { name: "x" })
    await http.post("/channel/create", { name: "y" })
    expect(writes().map((s) => s.token)).toEqual(["old-api-value", "old-api-value"])
  })

  it("sends a refused write once more with the token its refusal named", async () => {
    api.token = "yesterdays-token"
    const http = await client()
    await http.get("/user/profile")
    let refused = false
    api.refuse = (s) => {
      if (s.method !== "POST" || refused) return undefined
      refused = true
      api.token = "todays-token"
      return "todays-token"
    }
    const res = await http.post("/channel/create", { name: "x" })
    expect(res.status).toBe(200)
    expect(writes().map((s) => s.token)).toEqual(["yesterdays-token", "todays-token"])
  })

  it("doesn't retry a refusal that names the token it sent", async () => {
    api.token = "the-token"
    const http = await client()
    await http.get("/user/profile")
    api.refuse = (s) => (s.method === "POST" ? "the-token" : undefined)
    const err = await http.post("/channel/create", { name: "x" }).catch((e) => e)
    expect(err?.response?.status).toBe(403)
    expect(writes()).toHaveLength(1)
  })
})
