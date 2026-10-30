import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { resetWarmAhead, warmAhead } from "./warmAhead"

// V-100: what a surface promises offline comes to the device while online, at the page's first idle moment, with no
// press first; the page is told once all of it is in.
const ready = () => document.documentElement.dataset.offlineReady
let online = true

beforeEach(() => {
  vi.useFakeTimers()
  online = true
  vi.spyOn(navigator, "onLine", "get").mockImplementation(() => online)
  vi.stubGlobal("requestIdleCallback", (fn: () => void) => setTimeout(fn, 50))
})
afterEach(() => {
  resetWarmAhead()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe("the offline layer's warm list", () => {
  it("fetches a surface's code at the first idle moment, with no press, and says when all of it is in", async () => {
    let done!: () => void
    const job = vi.fn(() => new Promise<void>((r) => (done = r)))
    warmAhead(job)
    expect(ready()).toBe("warming")
    expect(job).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(50)
    expect(job).toHaveBeenCalledTimes(1)
    expect(ready()).toBe("warming")
    done()
    await vi.advanceTimersByTimeAsync(0)
    expect(ready()).toBe("warm")
  })

  it("runs a job once however often its surface joins, and is warm only once every job is in", async () => {
    const a = vi.fn(() => Promise.resolve())
    let doneB!: () => void
    const b = vi.fn(() => new Promise<void>((r) => (doneB = r)))
    warmAhead(a)
    warmAhead(a)
    warmAhead(b)
    await vi.advanceTimersByTimeAsync(50)
    expect(a).toHaveBeenCalledTimes(1)
    expect(ready()).toBe("warming")
    doneB()
    await vi.advanceTimersByTimeAsync(0)
    expect(ready()).toBe("warm")
  })

  it("fetches again what failed while online, on a growing wait, with no online event (a weak signal stays online)", async () => {
    let fails = 2
    const job = vi.fn(() => (fails-- > 0 ? Promise.reject(new Error("weak signal")) : Promise.resolve()))
    warmAhead(job)
    await vi.advanceTimersByTimeAsync(50)
    expect(job).toHaveBeenCalledTimes(1)
    expect(ready()).toBe("warming")
    await vi.advanceTimersByTimeAsync(5_000 + 50)
    expect(job).toHaveBeenCalledTimes(2)
    expect(ready()).toBe("warming")
    await vi.advanceTimersByTimeAsync(5_000 + 50)
    expect(job, "the second wait is longer than the first").toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(25_000)
    expect(job).toHaveBeenCalledTimes(3)
    expect(ready()).toBe("warm")
  })

  it("waits while offline, and fetches again what failed once the browser is back online", async () => {
    online = false
    let fail = true
    const job = vi.fn(() => (fail ? Promise.reject(new Error("no network")) : Promise.resolve()))
    warmAhead(job)
    await vi.advanceTimersByTimeAsync(50)
    expect(job).not.toHaveBeenCalled()
    online = true
    window.dispatchEvent(new Event("online"))
    await vi.advanceTimersByTimeAsync(50)
    expect(job).toHaveBeenCalledTimes(1)
    expect(ready()).toBe("warming")
    fail = false
    window.dispatchEvent(new Event("online"))
    await vi.advanceTimersByTimeAsync(50)
    expect(job).toHaveBeenCalledTimes(2)
    expect(ready()).toBe("warm")
  })
})
