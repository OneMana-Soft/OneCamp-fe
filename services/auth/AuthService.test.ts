import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import AuthService, { PROBE_TIMEOUT_MS } from "@/services/auth/AuthService"

// The questions the signed-out pages ask before they can draw anything: is
// somebody signed in, which ways in are on, does this server need an admin.
// A request that never answers (an API that accepted the connection and then
// hung) left the sign-in page blank for good. Each question now stops being
// waited for after a fixed time, and the page goes on as if the answer had
// been "no".

const never = () => new Promise<Response>(() => {})

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe("a server that never answers", () => {
  it("stops the session check and answers 'not signed in'", async () => {
    vi.stubGlobal("fetch", vi.fn(never))
    const answer = AuthService.hasActiveSession()
    await vi.advanceTimersByTimeAsync(PROBE_TIMEOUT_MS)
    await expect(answer).resolves.toBe(false)
  })

  it("stops asking for the ways in, and the page falls back to its own list", async () => {
    vi.stubGlobal("fetch", vi.fn(never))
    const answer = AuthService.getEnabledProviders()
    await vi.advanceTimersByTimeAsync(PROBE_TIMEOUT_MS)
    await expect(answer).resolves.toBeNull()
  })

  it("stops asking whether an admin is needed", async () => {
    vi.stubGlobal("fetch", vi.fn(never))
    const answer = AuthService.getAdminSetupStatus()
    await vi.advanceTimersByTimeAsync(PROBE_TIMEOUT_MS)
    await expect(answer).resolves.toEqual({ required: false, pinned: false })
  })

  it("lets go of the connection as it stops waiting", async () => {
    const signals: AbortSignal[] = []
    vi.stubGlobal(
      "fetch",
      vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.signal) signals.push(init.signal)
        return never()
      }),
    )
    const answer = AuthService.getEnabledProviders()
    await vi.advanceTimersByTimeAsync(PROBE_TIMEOUT_MS)
    await answer
    expect(signals.length).toBeGreaterThan(0)
    expect(signals.every((s) => s.aborted)).toBe(true)
  })

  it("still waits for an answer that is only slow", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>((resolve) =>
            setTimeout(
              () => resolve({ ok: true, status: 200, json: async () => ({ providers: { email: true } }) } as Response),
              PROBE_TIMEOUT_MS - 1000,
            ),
          ),
      ),
    )
    const answer = AuthService.getEnabledProviders()
    await vi.advanceTimersByTimeAsync(PROBE_TIMEOUT_MS - 1000)
    await expect(answer).resolves.toMatchObject({ email: true, google: false })
  })
})
