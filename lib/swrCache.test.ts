import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { RecentCache, localStorageProvider, serialise } from "./swrCache"
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

describe("RecentCache", () => {
  it("forgets the least recently used beyond its limit", () => {
    const c = new RecentCache<number>([], 3)
    c.set("a", 1).set("b", 2).set("c", 3)
    c.get("a") // read: now the most recent
    c.set("d", 4)
    expect(c.has("b")).toBe(false)
    expect(c.recentFirst()).toEqual(["d", "a", "c"])
  })

  it("never reorders on a read, so a walk over its keys ends", () => {
    // SWR reads entries while walking the keys (a global mutate); a cache
    // that moved read keys to the end made that walk endless.
    const c = new RecentCache<number>([["a", 1], ["b", 2], ["c", 3]], 10)
    const seen: string[] = []
    for (const k of c.keys()) {
      c.get(k)
      seen.push(k)
      if (seen.length > 10) break
    }
    expect(seen).toEqual(["a", "b", "c"])
  })

  it("keeps the order it was given when restored", () => {
    const c = new RecentCache<number>([["x", 1], ["y", 2]], 5)
    expect([...c.keys()]).toEqual(["x", "y"])
  })
})

describe("serialise", () => {
  it("writes down the most recent entries that fit, oldest first", () => {
    const m = new Map<string, unknown>([
      ["old", { data: "o".repeat(50) }],
      ["big", { data: "b".repeat(500) }],
      ["new", { data: "n".repeat(50) }],
      ["$req$x", { data: 1 }],
      ["failed", { error: new Error("x") }],
    ])
    const out = JSON.parse(serialise(m, 200))
    expect(out.v).toBe(2)
    expect(out.entries.map((e: [string]) => e[0])).toEqual(["old", "new"])
  })

  it("round-trips through the provider", () => {
    localStorage.setItem("onecamp-app-cache", serialise(new Map([["/a", { data: 1 }]])))
    expect((localStorageProvider() as unknown as Map<string, unknown>).get("/a")).toEqual({ data: 1 })
  })

  // A page left while a request was on its way: the next load has no such
  // request, so the entry mustn't say it does. Nor that it's loading: SWR
  // takes a missing flag as loading, and screens showed a skeleton over the
  // cached data.
  it("writes an entry down at rest, neither on its way nor loading", () => {
    const out = JSON.parse(serialise(new Map([["/a", { data: 1, isValidating: true, isLoading: false, _k: "/a" }]])))
    expect(out.entries).toEqual([["/a", { data: 1, isValidating: false, isLoading: false, _k: "/a" }]])
  })
})
