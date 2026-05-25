import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { localStorageProvider } from "./swrCache"

// Tests for the SWR cache provider's persistence + safety logic.
// We don't try to test the listener wiring (jsdom doesn't reliably
// fire pagehide / beforeunload from synthetic events); instead we
// drive the rehydration path which is the read side of the cache.

describe("localStorageProvider", () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it("returns an empty Map when nothing is stored", () => {
    const map = localStorageProvider()
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

    const map = localStorageProvider()
    expect(map.size).toBe(2)
    expect((map.get("/api/foo") as { data: { hello: string } }).data.hello).toBe("world")
  })

  it("drops a cache from an older schema version safely", () => {
    const stale = { v: 1, entries: [["/api/foo", { data: 42 }]] }
    localStorage.setItem("onecamp-app-cache", JSON.stringify(stale))

    const map = localStorageProvider()
    expect(map.size).toBe(0)
    // Stale entry must be removed so future hydrations don't hit it.
    expect(localStorage.getItem("onecamp-app-cache")).toBeNull()
  })

  it("recovers from corrupt JSON without throwing", () => {
    localStorage.setItem("onecamp-app-cache", "{not-json")
    const map = localStorageProvider()
    expect(map.size).toBe(0)
    expect(localStorage.getItem("onecamp-app-cache")).toBeNull()
  })

  it("returns an empty Map when payload shape is malformed", () => {
    localStorage.setItem("onecamp-app-cache", JSON.stringify({ random: "junk" }))
    const map = localStorageProvider()
    expect(map.size).toBe(0)
  })
})
