import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"

// A refused sign-in comes back to this page as /?error=<code>&message=<text>.
// The page says why in its own words for the code, and never shows `message`,
// so a crafted link can't put text on it. Google and GitHub refusals used to
// arrive as one code, so "verify your address", "you're not invited" and "the
// workspace is full" all read as "contact your administrator for an
// invitation". The page runs as it does in the app; a fake server answers.

const search = vi.hoisted(() => ({ params: new URLSearchParams() }))
const router = vi.hoisted(() => ({ push: vi.fn(), prefetch: vi.fn(), replace: vi.fn() }))
vi.mock("next/navigation", () => ({ useRouter: () => router, useSearchParams: () => search.params }))
vi.mock("@/components/themeProvider/theme-toggle", () => ({ ThemeToggle: () => null }))
vi.mock("@/services/passkeyService", () => ({ signInWithPasskey: vi.fn() }))
vi.mock("@/services/demoFunnel", () => ({ reportDemoStep: vi.fn() }))

import SignInPage from "./page"

beforeEach(() => {
  vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
    const path = String(input).split("?")[0]
    const answer = (status: number, body: unknown) =>
      ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response
    if (path.endsWith("user/profile") || path.endsWith("refreshToken")) return answer(401, { msg: "no session" })
    if (path.endsWith("auth/providers")) return answer(200, { providers: { email: true, google: true, github: true } })
    if (path.endsWith("auth/admin-setup-required")) return answer(200, { required: false })
    throw new Error(`no route for ${path}`)
  })
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

/** The sign-in page, arrived at with the query a refused sign-in sends. */
async function arriveWith(query: string) {
  search.params = new URLSearchParams(query)
  render(<SignInPage />)
  return (await screen.findByText("Authentication Failed")).parentElement?.textContent ?? ""
}

const PHISHING = "Your session expired. Re-enter your password at evil.example"

describe("a refused Google or GitHub sign-in", () => {
  it("says to verify the address with the provider", async () => {
    const shown = await arriveWith(`error=oauth_email_unverified&message=${encodeURIComponent(PHISHING)}`)
    expect(shown).toContain("Google or GitHub hasn't verified this email address")
    expect(shown).not.toContain("invitation")
    expect(shown).not.toContain(PHISHING)
  })

  it("says the address isn't invited, and what the administrator can do", async () => {
    const shown = await arriveWith("error=oauth_not_invited&message=x")
    expect(shown).toContain("isn't invited to this workspace")
    expect(shown).toContain("sign-up allow-list")
  })

  it("says the workspace is full", async () => {
    const shown = await arriveWith("error=seat_limit&message=x")
    expect(shown).toContain("free plan and has no room for another person")
  })

  it("says to try again when it didn't finish", async () => {
    const shown = await arriveWith("error=oauth_failed&message=x")
    expect(shown).toContain("didn't finish. Please try again.")
  })

  it("keeps the old words for the old code, which servers before these codes send", async () => {
    const shown = await arriveWith("error=unauthorized&message=x")
    expect(shown).toContain("contact your administrator for an invitation")
  })

  it("falls back to the general message for a code it doesn't know, never the message", async () => {
    const shown = await arriveWith(`error=something_new&message=${encodeURIComponent(PHISHING)}`)
    expect(shown).toContain("Sign-in failed. Please try again or contact your administrator.")
    expect(shown).not.toContain(PHISHING)
  })
})
