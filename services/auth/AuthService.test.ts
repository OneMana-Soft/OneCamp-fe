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

  // And says it got no answer, so the setup page can say so and check again
  // instead of reading silence as "an admin already exists".
  it("stops asking whether an admin is needed, and says nothing answered", async () => {
    vi.stubGlobal("fetch", vi.fn(never))
    const answer = AuthService.getAdminSetupStatus()
    await vi.advanceTimersByTimeAsync(PROBE_TIMEOUT_MS)
    await expect(answer).resolves.toEqual({ required: false, pinned: false, unreachable: true })
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

// What a sign-in page says when the request itself fails. "Network error.
// Please try again." and "Directory server unreachable." said what the browser
// saw; the person's question is what happened and what to do.
describe("a request that can't reach the workspace", () => {
  const UNREACHABLE = "Couldn't reach this workspace. Check your connection and try again."
  const offline = () => vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch") }))

  it("says so in the same words wherever it happens", async () => {
    offline()
    expect(await AuthService.loginWithEmail("sam@example.com", "a-password")).toEqual({ status: "failed", msg: UNREACHABLE })
    expect(await AuthService.loginWithLDAP("sam", "a-password")).toEqual({ status: "failed", msg: UNREACHABLE })
    expect((await AuthService.signup("t", "Sam", "a-password")).msg).toBe(UNREACHABLE)
    expect((await AuthService.forgotPassword("sam@example.com")).msg).toBe(UNREACHABLE)
    expect(await AuthService.resetPassword("t", "a-password")).toEqual({ status: "failed", msg: UNREACHABLE })
    expect((await AuthService.adminSetup("sam@example.com", "a-password", "")).msg).toBe(UNREACHABLE)
    expect(await AuthService.completeTOTPLogin("c", "123456")).toMatchObject({ status: "failed", msg: UNREACHABLE })
  })

  it("says the demo couldn't be reached, not that the network erred", async () => {
    offline()
    expect(await AuthService.loginAsDemo()).toEqual({ ok: false, msg: "Couldn't reach the demo. Check your connection and try again." })
  })

  it("says what the demo's own refusals mean", async () => {
    const answer = (status: number) => vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status, json: async () => ({}) }) as unknown as Response))
    answer(404)
    expect((await AuthService.loginAsDemo()).msg).toBe("There's no demo on this server.")
    answer(403)
    expect((await AuthService.loginAsDemo()).msg).toBe("The demo is turned off right now.")
    answer(503)
    expect((await AuthService.loginAsDemo()).msg).toBe("The demo isn't available right now. Try again in a few minutes.")
  })

  it("says a refused code didn't work, and to check it, when the server gives no words", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 401, json: async () => ({}) }) as unknown as Response))
    expect(await AuthService.completeTOTPLogin("c", "123456")).toEqual({
      status: "failed",
      msg: "That code didn't work. Check it and try again.",
      reason: "code_invalid",
    })
  })
})

