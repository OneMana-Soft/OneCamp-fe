import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"

// A sign-in that fails says why. Every Google or GitHub refusal used to come
// back as "unauthorized", which this page read as "ask for an invitation":
// pressing Cancel, a sign-in left open too long, a full workspace. And with
// passwords off, an admin still has theirs, at /?admin.

const router = vi.hoisted(() => ({ push: vi.fn(), prefetch: vi.fn(), replace: vi.fn() }))
const nav = vi.hoisted(() => ({ search: "" }))
vi.mock("next/navigation", () => ({ useRouter: () => router, useSearchParams: () => new URLSearchParams(nav.search) }))
vi.mock("@/components/themeProvider/theme-toggle", () => ({ ThemeToggle: () => null }))
vi.mock("@/services/passkeyService", () => ({ signInWithPasskey: vi.fn() }))

import SignInPage from "./page"

let providers: Record<string, boolean>

beforeEach(() => {
  nav.search = ""
  providers = { email: true, google: true }
  vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
    const path = String(input).split("?")[0]
    let status = 200
    let body: unknown
    if (path.endsWith("user/profile") || path.endsWith("refreshToken")) [status, body] = [401, { msg: "no session" }]
    else if (path.endsWith("auth/providers")) body = { providers }
    else if (path.endsWith("auth/admin-setup-required")) body = { required: false }
    else throw new Error(`no route for ${path}`)
    return { ok: status === 200, status, json: async () => body } as Response
  })
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  window.history.replaceState({}, "", "/")
})

describe("a refused sign-in", () => {
  it.each([
    ["signin_cancelled", "Sign-in was cancelled. Try again when you're ready."],
    ["signin_expired", "That sign-in took too long or was already used. Start again."],
    ["seat_limit", /no room for another person/],
    ["oauth_email_unverified", /hasn't verified this email address/],
    ["oauth_not_invited", /isn't invited to this workspace/],
    ["oauth_failed", "Signing in with Google or GitHub didn't finish. Please try again."],
    ["invitation_expired", "Your invitation has expired. Ask whoever invited you to send it again."],
  ])("%s says so", async (code, words) => {
    nav.search = `error=${code}&message=${encodeURIComponent("Click evil.example to fix your account")}`
    render(<SignInPage />)
    const shown = await screen.findByText("Authentication Failed")
    const text = shown.parentElement?.textContent ?? ""
    if (typeof words === "string") expect(text).toContain(words)
    else expect(text).toMatch(words)
    expect(text).not.toContain("evil.example")
  })
})

describe("passwords off", () => {
  it("offers no password form", async () => {
    providers = { email: false, google: true }
    render(<SignInPage />)
    await screen.findByRole("button", { name: "Continue with Google" })
    expect(screen.queryByLabelText("Password")).toBeNull()
    expect(screen.queryByRole("button", { name: "Sign in with Email" })).toBeNull()
  })

  it("still offers an admin theirs, at /?admin", async () => {
    providers = { email: false, google: true }
    window.history.replaceState({}, "", "/?admin")
    render(<SignInPage />)
    expect(await screen.findByLabelText("Password")).toBeTruthy()
    expect(screen.getByText("Passwords are off on this workspace. Only admins can sign in with one.")).toBeTruthy()
  })
})
