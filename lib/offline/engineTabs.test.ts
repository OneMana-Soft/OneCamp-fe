import "fake-indexeddb/auto"
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

const http = vi.hoisted(() => {
  const chain = () => ({ use: vi.fn(() => 0), eject: vi.fn() })
  return { get: vi.fn(), request: vi.fn(), interceptors: { request: chain(), response: chain() } }
})
vi.mock("@/lib/axiosInstance", async () => (await import("@/lib/testing/axiosInstance")).axiosInstanceModule({ default: http }))

const STATUS = "/task/updateTaskStatus"

// Loaded once before any test's clock runs (V-61, lib/testing/inTestImportsGuard): the fresh copy
// each test imports then only runs it again, without transforming its graph inside the test's 5 s.
beforeAll(async () => {
  await import("@/lib/offline/engine")
})

/** A tab: the engine loaded afresh, as a new tab loads it, over the browser's one database. */
async function tab() {
  vi.resetModules()
  return import("@/lib/offline/engine")
}

/** Web Locks as a browser has them: one holder of a name at a time, every tab. Counts who asked. */
function installLocks() {
  const tails = new Map<string, Promise<unknown>>()
  const asked = { count: 0 }
  const locks = {
    request: (name: string, run: () => Promise<unknown>) => {
      asked.count++
      const next = (tails.get(name) ?? Promise.resolve()).then(run, run)
      tails.set(name, next.catch(() => {}))
      return next
    },
  }
  Object.defineProperty(navigator, "locks", { value: locks, configurable: true })
  return asked
}

const online = (on: boolean) => Object.defineProperty(navigator, "onLine", { configurable: true, get: () => on })

let tabs: Awaited<ReturnType<typeof tab>>[] = []

beforeEach(() => {
  http.get.mockReset()
  http.request.mockReset()
  online(false)
})

afterEach(async () => {
  tabs.forEach((t) => t.stop())
  const { wipeOfflineStore } = await import("@/lib/offline/wipe")
  await wipeOfflineStore()
  tabs = []
  // @ts-expect-error -- jsdom has no Web Locks; a test installs its own
  delete navigator.locks
})

describe("the outbox in two tabs", () => {
  it("sends a change once when both tabs come back online at once", async () => {
    const asked = installLocks()
    const a = await tab()
    const b = await tab()
    tabs = [a, b]
    await a.start("ann")
    await b.start("ann")
    expect(await a.queue(STATUS, STATUS, "POST", { task_uuid: "t1", task_status: "done" })).toBe("kept")
    online(true)
    const answers: (() => void)[] = []
    http.request.mockImplementation(() => new Promise((r) => answers.push(() => r({ data: {} }))))
    // "online" reaches every tab: the first is sending when the second starts.
    const first = a.replayNow()
    await vi.waitFor(() => expect(http.request).toHaveBeenCalledTimes(1))
    const asks = asked.count
    const second = b.replayNow()
    // The first send is answered only once the second tab has either sent the change too, or waits for the lock.
    await vi.waitFor(() => expect(http.request.mock.calls.length > 1 || asked.count > asks).toBe(true))
    answers.forEach((answer) => answer())
    await first
    answers.forEach((answer) => answer())
    await second
    expect(http.request).toHaveBeenCalledTimes(1)
  })
})
