import { describe, expect, it, vi } from "vitest"
import { isAbort, wait } from "./abort"

describe("wait", () => {
  it("resolves after the time", async () => {
    vi.useFakeTimers()
    const done = vi.fn()
    void wait(1000).then(done)
    await vi.advanceTimersByTimeAsync(999)
    expect(done).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(done).toHaveBeenCalled()
    vi.useRealTimers()
  })

  it("stops as soon as it is called off, and at once if it already was", async () => {
    const c = new AbortController()
    const p = wait(60_000, c.signal)
    c.abort()
    await expect(p).rejects.toSatisfy(isAbort)
    await expect(wait(10, c.signal)).rejects.toSatisfy(isAbort)
  })
})

describe("isAbort", () => {
  it("knows an abort from a failure", () => {
    expect(isAbort(new DOMException("x", "AbortError"))).toBe(true)
    expect(isAbort({ name: "CanceledError", message: "canceled" })).toBe(true)
    expect(isAbort(new Error("Network Error"))).toBe(false)
    expect(isAbort(undefined)).toBe(false)
  })
})
