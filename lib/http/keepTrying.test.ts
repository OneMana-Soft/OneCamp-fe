import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { keepTrying } from "./keepTrying"

// keepTrying waits out a server that is away (a deploy's restart): the demo's
// sign-in (app/page.tsx) asks again on the shared backoff, and gives up only
// once its time is out or the server has said no.

type Answer = { ok: boolean; status?: number; retryAfter?: number }
const away: Answer = { ok: false, status: 0 }
const fine: Answer = { ok: true }

/** attempt answering in turn, the last one for good; calls are what it was asked, as again or not. */
function server(...replies: Answer[]) {
  const calls: Array<{ again: boolean; at: number }> = []
  const attempt = vi.fn(async (again: boolean) => {
    calls.push({ again, at: Date.now() })
    return replies[Math.min(calls.length - 1, replies.length - 1)]
  })
  return { attempt, calls }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(0)
  // The backoff's spread at its middle: 5 s, then 10, 20, 40 and 60.
  vi.spyOn(Math, "random").mockReturnValue(0.5)
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe("keepTrying", () => {
  it("asks again on the shared backoff while nothing answers, and gives the answer that comes", async () => {
    const { attempt, calls } = server(away, { ok: false, status: 502 }, fine)
    const onWait = vi.fn()
    const done = keepTrying(attempt, 90_000, { onWait })
    await vi.advanceTimersByTimeAsync(4_999)
    expect(calls).toEqual([{ again: false, at: 0 }])
    expect(onWait).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(calls.map((c) => c.at)).toEqual([0, 5_000])
    await vi.advanceTimersByTimeAsync(10_000)
    expect(await done).toBe(fine)
    expect(calls).toEqual([{ again: false, at: 0 }, { again: true, at: 5_000 }, { again: true, at: 15_000 }])
    expect(onWait).toHaveBeenCalledTimes(2)
  })

  it("waits when the server is busy too (429)", async () => {
    const { attempt, calls } = server({ ok: false, status: 429 }, fine)
    const done = keepTrying(attempt, 90_000)
    await vi.advanceTimersByTimeAsync(5_000)
    expect(await done).toBe(fine)
    expect(calls).toHaveLength(2)
  })

  it("gives up at once when the server said no", async () => {
    for (const status of [400, 401, 403, 404]) {
      const refused = { ok: false, status }
      const { attempt, calls } = server(refused, fine)
      const onWait = vi.fn()
      expect(await keepTrying(attempt, 90_000, { onWait })).toBe(refused)
      expect(calls).toHaveLength(1)
      expect(onWait).not.toHaveBeenCalled()
    }
  })

  it("tries a last time as its time runs out, then gives that answer", async () => {
    const down = { ok: false, status: 503 }
    const { attempt, calls } = server(down)
    let answer: Answer | undefined
    void keepTrying(attempt, 90_000).then((a) => (answer = a))
    await vi.advanceTimersByTimeAsync(89_999)
    expect(answer).toBeUndefined()
    await vi.advanceTimersByTimeAsync(1)
    // 5, 10, 20 and 40 s apart, and the last wait cut to the 90 s.
    expect(calls.map((c) => c.at)).toEqual([0, 5_000, 15_000, 35_000, 75_000, 90_000])
    expect(answer).toBe(down)
  })

  it("never asks sooner than the server's Retry-After, and gives up when that is past its time", async () => {
    const { attempt, calls } = server({ ok: false, status: 503, retryAfter: 30 }, fine)
    const done = keepTrying(attempt, 90_000)
    await vi.advanceTimersByTimeAsync(29_999)
    expect(calls).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(await done).toBe(fine)

    const later = { ok: false, status: 503, retryAfter: 120 }
    const second = server(later, fine)
    expect(await keepTrying(second.attempt, 90_000)).toBe(later)
    expect(second.calls).toHaveLength(1)
  })

  it("stops waiting when the person leaves", async () => {
    const { attempt, calls } = server(away, fine)
    const leaving = new AbortController()
    const done = keepTrying(attempt, 90_000, { signal: leaving.signal })
    const left = expect(done).rejects.toMatchObject({ name: "AbortError" })
    await vi.advanceTimersByTimeAsync(1_000)
    leaving.abort()
    await left
    await vi.advanceTimersByTimeAsync(60_000)
    expect(calls).toHaveLength(1)
  })

  it("gives no answer to a person who left while a try was on its way, even a good one", async () => {
    const leaving = new AbortController()
    const attempt = vi.fn(async (again: boolean) => {
      if (again) leaving.abort()
      return again ? fine : away
    })
    const done = keepTrying(attempt, 90_000, { signal: leaving.signal })
    const left = expect(done).rejects.toMatchObject({ name: "AbortError" })
    await vi.advanceTimersByTimeAsync(5_000)
    await left
    expect(attempt).toHaveBeenCalledTimes(2)
  })
})
