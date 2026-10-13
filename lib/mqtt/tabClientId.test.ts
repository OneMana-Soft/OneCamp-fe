import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// A duplicated tab copies the first one's sessionStorage, and with it the
// live connection's client id: with one id the two tabs took the session
// from each other in turn, each missing messages. Each page asks the other
// open tabs before it keeps the id it found. (Two loads of the module stand
// for two pages; they share this window's sessionStorage, as a duplicate's
// copy starts out the same. The channel between tabs is an in-memory one, so
// a page can be closed.)

const open = new Set<FakeChannel>()

class FakeChannel {
  onmessage: ((event: { data: unknown }) => void) | null = null
  constructor(readonly name: string) {
    open.add(this)
  }
  postMessage(data: unknown) {
    for (const other of open) {
      if (other !== this && other.name === this.name) queueMicrotask(() => other.onmessage?.({ data }))
    }
  }
  close() {
    open.delete(this)
  }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal("BroadcastChannel", FakeChannel)
})

afterEach(() => {
  open.clear()
  sessionStorage.clear()
  vi.unstubAllGlobals()
  vi.useRealTimers()
  vi.resetModules()
})

/** A page loading in a tab: its id, once settled. */
async function aPageLoads(): Promise<string> {
  vi.resetModules()
  const { tabClientId } = await import("@/lib/mqtt/tabClientId")
  const id = tabClientId()
  await vi.advanceTimersByTimeAsync(200)
  return id
}

describe("a tab's part of the client id", () => {
  it("is kept across a reload of the tab", async () => {
    const first = await aPageLoads()
    open.clear() // the page before the reload is gone
    expect(await aPageLoads()).toBe(first)
  })

  it("is a new one in a duplicated tab, while the first is still open", async () => {
    const original = await aPageLoads() // the first tab, still open
    const duplicate = await aPageLoads()
    expect(duplicate).not.toBe(original)
    expect(sessionStorage.getItem("mqtt_tab_id")).toBe(duplicate)
  })
})
