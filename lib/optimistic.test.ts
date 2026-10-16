import { describe, expect, it, vi } from "vitest"

import { optimistic } from "./optimistic"

/** A request answered by hand: resolve or reject it when the test says. */
function request<T>() {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

/** A value on screen with a history, written the way a screen writes its copy. */
function screen<T>(first: T) {
  const shown = { value: first }
  const write = (next: T, commit: () => Promise<unknown>, key?: string) => {
    const before = shown.value
    return optimistic({ key, apply: () => (shown.value = next), revert: () => (shown.value = before), commit })
  }
  return { shown, write }
}

describe("optimistic", () => {
  it("shows the change at once, and keeps it when the server takes it", async () => {
    const s = screen("todo")
    const r = request<{ task_uuid: string }>()
    const done = s.write("done", () => r.promise)
    expect(s.shown.value).toBe("done")
    r.resolve({ task_uuid: "t1" })
    await expect(done).resolves.toEqual({ ok: true, value: { task_uuid: "t1" } })
    expect(s.shown.value).toBe("done")
  })

  it("puts back what was there when the write fails, and never throws (PTC-2)", async () => {
    const s = screen("in_progress")
    const error = Object.assign(new Error("Request failed with status code 500"), { response: { status: 500 } })
    const result = await s.write("done", () => Promise.reject(error))
    expect(result).toEqual({ ok: false, error })
    expect(s.shown.value).toBe("in_progress")
  })

  it("takes back a change whose request threw before it was sent", async () => {
    const s = screen(1)
    const result = await s.write(2, () => {
      throw new Error("offline")
    })
    expect(result.ok).toBe(false)
    expect(s.shown.value).toBe(1)
  })

  it("leaves a later write showing when an earlier one to the same thing fails", async () => {
    const s = screen("todo")
    const first = request<void>()
    const second = request<void>()
    const a = s.write("in_progress", () => first.promise, "task:t1:status")
    const b = s.write("done", () => second.promise, "task:t1:status")
    first.reject(new Error("500"))
    await a
    expect(s.shown.value).toBe("done")
    second.resolve()
    await b
    expect(s.shown.value).toBe("done")
  })

  it("goes back to what was shown before them all when every write to the thing fails", async () => {
    const s = screen("todo")
    const first = request<void>()
    const second = request<void>()
    const a = s.write("in_progress", () => first.promise, "task:t1:status")
    const b = s.write("done", () => second.promise, "task:t1:status")
    first.reject(new Error("500"))
    await a
    second.reject(new Error("500"))
    await b
    expect(s.shown.value).toBe("todo")
  })

  it("goes back to the last write that didn't fail, in whatever order they answer", async () => {
    const s = screen("todo")
    const first = request<void>()
    const second = request<void>()
    const a = s.write("in_progress", () => first.promise, "task:t1:status")
    const b = s.write("done", () => second.promise, "task:t1:status")
    second.reject(new Error("500"))
    await b
    // The first is still going: what it showed is the best guess.
    expect(s.shown.value).toBe("in_progress")
    first.resolve()
    await a
    expect(s.shown.value).toBe("in_progress")
  })

  it("goes back to the start when the earlier write fails after the later one did", async () => {
    const s = screen("todo")
    const first = request<void>()
    const second = request<void>()
    const a = s.write("in_progress", () => first.promise, "task:t1:status")
    const b = s.write("done", () => second.promise, "task:t1:status")
    second.reject(new Error("500"))
    await b
    first.reject(new Error("500"))
    await a
    expect(s.shown.value).toBe("todo")
  })

  it("keeps writes to different things apart", async () => {
    const status = screen("todo")
    const priority = screen("low")
    const r = request<void>()
    const a = status.write("done", () => r.promise, "task:t1:status")
    await priority.write("high", () => Promise.reject(new Error("500")), "task:t1:priority")
    expect(priority.shown.value).toBe("low")
    expect(status.shown.value).toBe("done")
    r.resolve()
    await a
  })

  it("starts afresh once every write to a thing has been answered", async () => {
    const s = screen("todo")
    await s.write("in_progress", () => Promise.resolve(), "task:t1:status")
    const revert = vi.fn()
    await optimistic({ key: "task:t1:status", apply: () => {}, revert, commit: () => Promise.reject(new Error("500")) })
    expect(revert).toHaveBeenCalledTimes(1)
  })
})
