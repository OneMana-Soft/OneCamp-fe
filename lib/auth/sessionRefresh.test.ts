import axios from "axios"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// The session's one refresh (lib/auth/sessionRefresh). QA SH-16 (14 Oct
// 2026): a tab opened after the access cookie ran out sent its first requests
// on it, and they all answered 401. Refresh tokens rotate, and one used twice
// signs the device out, so a browser sends one refresh at a time: one per tab
// however many requests ask, and one across tabs.

vi.mock("@/hooks/use-toast", () => ({ toast: () => ({ id: "1", dismiss: () => {}, update: () => {} }), useToast: () => ({ toast: () => {} }) }))
// Each tab loads the modules afresh; the store the API client reports to is not under test.
vi.mock("@/store/store", () => ({ default: { dispatch: () => {} } }))
vi.mock("@/lib/sessionEnd", () => ({ endSession: async () => {} }))

const KEY = "onecamp:token-issued-at"
const STALE = () => String(Date.now() - 10 * 60 * 1000)

/** A tab: the module loaded afresh, as a new tab loads it. */
async function tab() {
  vi.resetModules()
  return import("@/lib/auth/sessionRefresh")
}

/** Web Locks as a browser has them: one holder of a name at a time, every tab. */
function installLocks() {
  const tails = new Map<string, Promise<unknown>>()
  const locks = {
    request: (name: string, run: () => Promise<unknown>) => {
      const next = (tails.get(name) ?? Promise.resolve()).then(run, run)
      tails.set(name, next.catch(() => {}))
      return next
    },
  }
  Object.defineProperty(navigator, "locks", { value: locks, configurable: true })
}

/** The refresh request, answered when the test says. */
function refreshEndpoint() {
  let release = () => {}
  const answered = new Promise<void>((r) => (release = r))
  const get = vi.spyOn(axios, "get").mockImplementation(async () => {
    await answered
    return { data: {}, status: 200 }
  })
  return { get, release }
}

beforeEach(() => {
  window.history.replaceState(null, "", "/app/home")
})
afterEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
  // @ts-expect-error -- jsdom has no Web Locks; a test installs its own
  delete navigator.locks
  window.history.replaceState(null, "", "/")
})

describe("the issue time every tab shares", () => {
  it("is stale in a new tab when the last refresh any tab made is over four minutes old", async () => {
    localStorage.setItem(KEY, STALE())
    expect((await tab()).sessionIsStale()).toBe(true)
  })

  it("is fresh when a tab refreshed a minute ago", async () => {
    localStorage.setItem(KEY, String(Date.now() - 60 * 1000))
    expect((await tab()).sessionIsStale()).toBe(false)
  })

  it("starts at the load when no tab has kept one (just signed in), and is kept", async () => {
    const t = await tab()
    expect(t.sessionIsStale()).toBe(false)
    expect(Number(localStorage.getItem(KEY))).toBeGreaterThan(Date.now() - 5000)
  })
})

describe("one refresh at a time", () => {
  it("sends one refresh for every caller in a tab, and they all share its answer", async () => {
    localStorage.setItem(KEY, STALE())
    const t = await tab()
    const { get, release } = refreshEndpoint()
    const all = Promise.all([t.refreshSession(), t.refreshSession(), t.refreshSession()])
    release()
    await all
    expect(get).toHaveBeenCalledTimes(1)
    expect(t.sessionIsStale()).toBe(false)
  })

  it("sends one refresh across two tabs: the tab that waited takes the other's", async () => {
    installLocks()
    localStorage.setItem(KEY, STALE())
    const a = await tab()
    const b = await tab()
    const { get, release } = refreshEndpoint()
    const both = Promise.all([a.refreshSession(), b.refreshSession()])
    release()
    await both
    expect(get).toHaveBeenCalledTimes(1)
    expect(a.sessionIsStale()).toBe(false)
    expect(b.sessionIsStale()).toBe(false)
  })

  it("refreshes again in a tab whose own cookie was refused, even just after a refresh", async () => {
    installLocks()
    const t = await tab()
    const { get, release } = refreshEndpoint()
    release()
    await t.refreshSession()
    await t.refreshSession()
    expect(get).toHaveBeenCalledTimes(2)
  })

  it("fails everyone waiting when the refresh fails, and the next ask tries again", async () => {
    localStorage.setItem(KEY, STALE())
    const t = await tab()
    const get = vi.spyOn(axios, "get").mockRejectedValueOnce(Object.assign(new Error("401"), { response: { status: 401 } }))
    const results = await Promise.allSettled([t.refreshSession(), t.refreshSession()])
    expect(results.map((r) => r.status)).toEqual(["rejected", "rejected"])
    expect(get).toHaveBeenCalledTimes(1)
    get.mockResolvedValueOnce({ data: {}, status: 200 })
    await t.refreshSession()
    expect(get).toHaveBeenCalledTimes(2)
  })
})

describe("where there are no Web Locks", () => {
  // An older Safari, some embedded webviews and the desktop app's webview have
  // no navigator.locks; a sandboxed page's request for one is refused. A tab
  // there still sends one refresh for all its callers, and never fails for
  // want of a lock.
  it("sends one refresh for every caller in the tab, with navigator.locks undefined", async () => {
    Object.defineProperty(navigator, "locks", { value: undefined, configurable: true })
    localStorage.setItem(KEY, STALE())
    const t = await tab()
    const { get, release } = refreshEndpoint()
    let asked: Promise<unknown> | undefined
    expect(() => {
      asked = Promise.all([t.refreshSession(), t.refreshSession(), t.refreshSession()])
    }).not.toThrow()
    release()
    await expect(asked).resolves.toBeDefined()
    expect(get).toHaveBeenCalledTimes(1)
    expect(t.sessionIsStale()).toBe(false)
  })

  it("refreshes in the tab alone when the lock is refused", async () => {
    Object.defineProperty(navigator, "locks", {
      value: { request: () => Promise.reject(new DOMException("The request is not allowed", "SecurityError")) },
      configurable: true,
    })
    localStorage.setItem(KEY, STALE())
    const t = await tab()
    const { get, release } = refreshEndpoint()
    const both = Promise.all([t.refreshSession(), t.refreshSession()])
    release()
    await both
    expect(get).toHaveBeenCalledTimes(1)
    expect(t.sessionIsStale()).toBe(false)
  })

  it("fails only for the refresh's own failure, once, when it fails under the lock", async () => {
    installLocks()
    localStorage.setItem(KEY, STALE())
    const t = await tab()
    const get = vi.spyOn(axios, "get").mockRejectedValue(Object.assign(new Error("401"), { response: { status: 401 } }))
    await expect(t.refreshSession()).rejects.toThrow("401")
    expect(get).toHaveBeenCalledTimes(1)
  })
})

describe("the API client", () => {
  async function client() {
    vi.resetModules()
    return (await import("@/lib/axiosInstance")).default
  }

  it("refreshes once before a burst of requests on a stale cookie, then sends them all", async () => {
    localStorage.setItem(KEY, STALE())
    const order: string[] = []
    vi.spyOn(axios, "get").mockImplementation(async () => {
      order.push("refresh")
      return { data: {}, status: 200 }
    })
    const api = await client()
    api.defaults.adapter = async (config) => {
      order.push(String(config.url))
      return { data: {}, status: 200, statusText: "OK", headers: {}, config }
    }
    await Promise.all(["/user/profile", "/user/notificationPreferences", "/mqttConfig", "/config/client"].map((u) => api.get(u)))
    expect(order[0]).toBe("refresh")
    expect(order.filter((o) => o === "refresh")).toHaveLength(1)
    expect(order.slice(1).sort()).toEqual(["/config/client", "/mqttConfig", "/user/notificationPreferences", "/user/profile"])
  })

  it("goes straight out on a fresh cookie", async () => {
    localStorage.setItem(KEY, String(Date.now() - 60 * 1000))
    const refresh = vi.spyOn(axios, "get")
    const api = await client()
    api.defaults.adapter = async (config) => ({ data: {}, status: 200, statusText: "OK", headers: {}, config })
    await api.get("/user/profile")
    expect(refresh).not.toHaveBeenCalled()
  })
})
