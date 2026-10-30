import axios, { AxiosError } from "axios"
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
/** The server's answer to a refresh with no session behind it. */
const refused = () => new AxiosError("Unauthorized", "ERR_BAD_REQUEST", undefined, undefined, { status: 401 } as never)

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

  // A load kept its own time when no tab had kept one, so a sign-in page with
  // no session went stale four minutes in, and from then on refreshed, was
  // refused and signed out once a minute (regression audit S3, 23 Oct).
  it("knows of no session in a tab where none is kept, so it never goes stale", async () => {
    const t = await tab()
    expect(t.sessionIsStale(Date.now() + 60 * 60 * 1000)).toBe(false)
    expect(localStorage.getItem(KEY)).toBeNull()
  })

  it("starts when the app's gate sees the member (signed in without a reload), and is kept for every tab", async () => {
    const t = await tab()
    t.sessionHeld()
    expect(t.sessionIsStale()).toBe(false)
    expect(t.sessionIsStale(Date.now() + 5 * 60 * 1000)).toBe(true)
    expect(Number(localStorage.getItem(KEY))).toBeGreaterThan(Date.now() - 5000)
  })

  it("keeps its own when the gate sees the member again", async () => {
    const kept = Date.now() - 60 * 1000
    localStorage.setItem(KEY, String(kept))
    const t = await tab()
    t.sessionHeld()
    expect(Number(localStorage.getItem(KEY))).toBe(kept)
  })
})

describe("a session that has ended", () => {
  it("stops the clock when the server refuses a refresh", async () => {
    localStorage.setItem(KEY, STALE())
    const t = await tab()
    vi.spyOn(axios, "get").mockRejectedValue(refused())
    await expect(t.refreshSession()).rejects.toThrow("Unauthorized")
    expect(t.sessionIsStale()).toBe(false)
  })

  it("keeps the clock when a refresh fails for any other reason, so the next one tries again", async () => {
    localStorage.setItem(KEY, STALE())
    const t = await tab()
    vi.spyOn(axios, "get").mockRejectedValue(new AxiosError("Network Error", "ERR_NETWORK"))
    await expect(t.refreshSession()).rejects.toThrow("Network Error")
    expect(t.sessionIsStale()).toBe(true)
  })

  // A sign-out in this tab leaves by a full load, which finds nothing kept.
  it("stops the clock when another tab signs out, which clears storage", async () => {
    localStorage.setItem(KEY, STALE())
    const t = await tab()
    localStorage.clear()
    window.dispatchEvent(new StorageEvent("storage", { key: null }))
    expect(t.sessionIsStale()).toBe(false)
  })
})

describe("a sign-in page with no session", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/")
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true })
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  /** The API client loaded on the page, every refresh refused, through ten minutes of its timer. */
  async function tenMinutes() {
    const refresh = vi.spyOn(axios, "get").mockRejectedValue(refused())
    const signOut = vi.spyOn(axios, "post").mockResolvedValue({ data: {}, status: 200 })
    vi.resetModules()
    await import("@/lib/axiosInstance")
    for (let minute = 0; minute < 10; minute++) {
      await vi.advanceTimersByTimeAsync(60 * 1000)
      await vi.dynamicImportSettled()
      await vi.advanceTimersByTimeAsync(0)
    }
    return { refresh, signOut }
  }

  it("never refreshes, signs out or clears the origin's storage", async () => {
    localStorage.setItem("onecamp-theme", "dark")
    const { refresh, signOut } = await tenMinutes()
    expect(refresh).not.toHaveBeenCalled()
    expect(signOut).not.toHaveBeenCalled()
    expect(localStorage.getItem("onecamp-theme")).toBe("dark")
  })

  it("signs out once when the session it kept is refused, then stays quiet", async () => {
    localStorage.setItem(KEY, STALE())
    const { refresh, signOut } = await tenMinutes()
    expect(refresh).toHaveBeenCalledTimes(1)
    expect(signOut).toHaveBeenCalledTimes(1)
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
