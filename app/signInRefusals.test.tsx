import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen, waitFor } from "@testing-library/react"

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

/** The box a refused sign-in shows, once the page has drawn it. */
async function refusalBox() {
  return waitFor(() => {
    const el = document.querySelector<HTMLElement>("[data-tone]")
    if (!el) throw new Error("no refusal shown")
    return el
  })
}

describe("a refused sign-in", () => {
  // Every refusal was titled "Authentication Failed", in red, cancelling
  // included. Each now has a title that fits it, and only a sign-in that broke
  // is red.
  it.each([
    ["signin_cancelled", "Sign-in cancelled", "neutral", "Sign-in was cancelled. Try again when you're ready."],
    ["signin_expired", "Sign-in expired", "neutral", "That sign-in took too long or was already used. Start again."],
    ["seat_limit", "No free seat", "warning", /no room for another person/],
    ["oauth_email_unverified", "Email not verified", "warning", /hasn't verified this email address/],
    ["oauth_not_invited", "Not invited yet", "warning", /isn't invited to this workspace/],
    ["oauth_failed", "Couldn't sign you in", "error", "Signing in with Google or GitHub didn't finish. Please try again."],
    ["invitation_expired", "Invitation expired", "warning", "Your invitation has expired. Ask whoever invited you to send it again."],
    ["address_unsupported", "Address not supported", "warning", /characters other than plain letters, digits and symbols/],
    ["something_new", "Couldn't sign you in", "error", "Sign-in failed. Please try again or contact your administrator."],
  ])("%s is titled %s", async (code, title, tone, words) => {
    nav.search = `error=${code}&message=${encodeURIComponent("Click evil.example to fix your account")}`
    render(<SignInPage />)
    const box = await refusalBox()
    const text = box.textContent ?? ""
    expect(box.querySelector("h2")?.textContent).toBe(title)
    expect(text).not.toContain("Authentication Failed")
    expect(box.dataset.tone).toBe(tone)
    if (typeof words === "string") expect(text).toContain(words)
    else expect(text).toMatch(words)
    expect(text).not.toContain("evil.example")
    // GitHub takes any address it has verified, not only the primary one.
    expect(text).not.toMatch(/primary address/)
  })

  it("keeps red for a sign-in that broke, and off one that is nobody's fault", async () => {
    nav.search = "error=signin_cancelled"
    render(<SignInPage />)
    const calm = await refusalBox()
    expect(calm.className).not.toMatch(/destructive/)
    expect(calm.getAttribute("role")).toBe("status")
    cleanup()

    nav.search = "error=invitation_expired"
    render(<SignInPage />)
    const warn = await refusalBox()
    expect(warn.className).toMatch(/bg-warning/)
    expect(warn.className).not.toMatch(/destructive/)
    cleanup()

    nav.search = "error=db_error"
    render(<SignInPage />)
    const broke = await refusalBox()
    expect(broke.className).toMatch(/destructive/)
    expect(broke.getAttribute("role")).toBe("alert")
  })
})

describe("passwords off", () => {
  it("offers no password form", async () => {
    providers = { email: false, google: true }
    render(<SignInPage />)
    await screen.findByRole("button", { name: "Continue with Google" })
    expect(screen.queryByLabelText("Password")).toBeNull()
    expect(screen.queryByRole("button", { name: "Sign in with email" })).toBeNull()
  })

  it("still offers an admin theirs, at /?admin", async () => {
    providers = { email: false, google: true }
    window.history.replaceState({}, "", "/?admin")
    render(<SignInPage />)
    expect(await screen.findByLabelText("Password")).toBeTruthy()
    expect(screen.getByText("Passwords are off on this workspace. Only admins can sign in with one.")).toBeTruthy()
  })
})
