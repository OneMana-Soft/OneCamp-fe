import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { localStorageProvider } from "./swrCache"
import { endSession } from "./sessionEnd"

// Tests for the SWR cache provider's persistence + safety logic.
// We don't try to test the listener wiring (jsdom doesn't reliably
// fire pagehide / beforeunload from synthetic events); instead we
// drive the rehydration path which is the read side of the cache.
//
// localStorageProvider's public type is SWR's `Cache<unknown>`, but the
// concrete runtime value is a Map. These tests exercise the concrete
// implementation, so we narrow to Map to assert on `.size`.
const provider = () => localStorageProvider() as unknown as Map<string, unknown>

describe("localStorageProvider", () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it("returns an empty Map when nothing is stored", () => {
    const map = provider()
    expect(map.size).toBe(0)
  })

  it("rehydrates entries from the current schema version", () => {
    const payload = {
      v: 2,
      entries: [
        ["/api/foo", { data: { hello: "world" } }],
        ["/api/bar", { data: [1, 2, 3] }],
      ],
    }
    localStorage.setItem("onecamp-app-cache", JSON.stringify(payload))

    const map = provider()
    expect(map.size).toBe(2)
    expect((map.get("/api/foo") as { data: { hello: string } }).data.hello).toBe("world")
  })

  it("drops a cache from an older schema version safely", () => {
    const stale = { v: 1, entries: [["/api/foo", { data: 42 }]] }
    localStorage.setItem("onecamp-app-cache", JSON.stringify(stale))

    const map = provider()
    expect(map.size).toBe(0)
    // Stale entry must be removed so future hydrations don't hit it.
    expect(localStorage.getItem("onecamp-app-cache")).toBeNull()
  })

  it("recovers from corrupt JSON without throwing", () => {
    localStorage.setItem("onecamp-app-cache", "{not-json")
    const map = provider()
    expect(map.size).toBe(0)
    expect(localStorage.getItem("onecamp-app-cache")).toBeNull()
  })

  it("returns an empty Map when payload shape is malformed", () => {
    localStorage.setItem("onecamp-app-cache", JSON.stringify({ random: "junk" }))
    const map = provider()
    expect(map.size).toBe(0)
  })

  it("writes the cache down when the page is left", () => {
    const map = provider()
    map.set("/api/foo", { data: 1 })
    window.dispatchEvent(new Event("pagehide"))
    expect(JSON.parse(localStorage.getItem("onecamp-app-cache") || "{}").entries).toEqual([["/api/foo", { data: 1 }]])
  })

  it("keeps nothing for the next person once the session has ended", async () => {
    const map = provider()
    map.set("/user/profile", { data: { name: "Sam" } })
    window.dispatchEvent(new Event("pagehide"))
    await endSession()
    expect(localStorage.getItem("onecamp-app-cache")).toBeNull()
    // A response that lands on the way out, then the page is left.
    map.set("/user/sidebarNav", { data: [1] })
    window.dispatchEvent(new Event("pagehide"))
    window.dispatchEvent(new Event("beforeunload"))
    expect(localStorage.getItem("onecamp-app-cache")).toBeNull()
  })

  it("writes down the next session's cache, not the one before it", async () => {
    const first = provider()
    first.set("/old", { data: "first member" })
    await endSession()
    const second = provider()
    second.set("/new", { data: "second member" })
    window.dispatchEvent(new Event("pagehide"))
    expect(JSON.parse(localStorage.getItem("onecamp-app-cache") || "{}").entries).toEqual([["/new", { data: "second member" }]])
  })
})
