import { afterEach, describe, expect, it, vi } from "vitest"

// The session check (AuthService.hasActiveSession's, moved here so a public
// page can ask it without the auth service): the profile read with
// credentials, the session's one refresh on a 401, then once more. It now says
// who answered too, so a guest link can offer "Join as Kai Lin" (calls HU13).
const refreshSession = vi.fn<() => Promise<void>>()
vi.mock("@/lib/auth/sessionRefresh", () => ({ refreshSession: () => refreshSession() }))

import { activeMember, checkSession } from "./sessionMember"
import AuthService from "@/services/auth/AuthService"

const profile = { data: { user_uuid: "33333333-3333-4333-8333-333333333333", user_name: "Kai Lin", user_full_name: "Kai Lin", user_email_id: "kai@acme.test" } }
const answer = (status: number, body?: unknown) => new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe("the session check", () => {
  it("names who is signed in here, from their profile, read with credentials", async () => {
    const fetch = vi.fn(async () => answer(200, profile))
    vi.stubGlobal("fetch", fetch)
    await expect(checkSession()).resolves.toEqual({ signedIn: true, member: { uuid: profile.data.user_uuid, name: "Kai Lin" } })
    expect(fetch).toHaveBeenCalledTimes(1)
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toMatch(/user\/profile$/)
    expect(init.credentials).toBe("include")
    expect(refreshSession).not.toHaveBeenCalled()
  })

  it("is signed in on any success, even one that names nobody, as hasActiveSession always was", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => answer(200)))
    await expect(checkSession()).resolves.toEqual({ signedIn: true, member: null })
    await expect(activeMember()).resolves.toBeNull()
    await expect(AuthService.hasActiveSession()).resolves.toBe(true)
  })

  it("refreshes a stale session once, then asks again", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(answer(401)).mockResolvedValueOnce(answer(200, profile))
    vi.stubGlobal("fetch", fetch)
    refreshSession.mockResolvedValueOnce()
    await expect(activeMember()).resolves.toEqual({ uuid: profile.data.user_uuid, name: "Kai Lin" })
    expect(refreshSession).toHaveBeenCalledTimes(1)
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it("is nobody when the refresh is refused, the server is away, or it answers an error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => answer(401)))
    refreshSession.mockRejectedValueOnce(new Error("refused"))
    await expect(checkSession()).resolves.toEqual({ signedIn: false, member: null })
    await expect(AuthService.hasActiveSession()).resolves.toBe(false)

    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("offline") }))
    await expect(activeMember()).resolves.toBeNull()

    vi.stubGlobal("fetch", vi.fn(async () => answer(503, profile)))
    await expect(activeMember()).resolves.toBeNull()
  })
})
