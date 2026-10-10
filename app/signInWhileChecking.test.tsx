import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"

// While the sign-in page asks whether somebody is already signed in, it used to
// draw nothing at all: a white page, for as long as the API took. It now draws
// its own frame with a placeholder in the shape of what comes, and nothing that
// says "Sign in", because the visitor may well be signed in and on their way
// through to the app.

const router = vi.hoisted(() => ({ push: vi.fn(), prefetch: vi.fn(), replace: vi.fn() }))
vi.mock("next/navigation", () => ({ useRouter: () => router, useSearchParams: () => new URLSearchParams() }))
vi.mock("@/components/themeProvider/theme-toggle", () => ({ ThemeToggle: () => null }))
vi.mock("@/services/passkeyService", () => ({ signInWithPasskey: vi.fn() }))
vi.mock("@/services/demoFunnel", () => ({ reportDemoStep: vi.fn() }))

import SignInPage from "./page"

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe("the sign-in page while it checks", () => {
  it("shows its frame and a placeholder, not a blank page", () => {
    // Nothing answers: the check is still running.
    vi.stubGlobal("fetch", () => new Promise(() => {}))
    render(<SignInPage />)
    expect(screen.getByText("OneCamp")).toBeTruthy()
    const waiting = screen.getByRole("status", { name: "Checking whether you're signed in" })
    expect(waiting.getAttribute("aria-busy")).toBe("true")
  })

  it("says nothing about signing in until it knows nobody is", () => {
    vi.stubGlobal("fetch", () => new Promise(() => {}))
    render(<SignInPage />)
    expect(screen.queryByRole("heading", { name: "Sign in" })).toBeNull()
    expect(screen.queryByRole("button")).toBeNull()
  })

  it("is the sign-in page once nobody is signed in", async () => {
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      const path = String(input).split("?")[0]
      const answer = (status: number, body: unknown) =>
        ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response
      if (path.endsWith("user/profile") || path.endsWith("refreshToken")) return answer(401, { msg: "no session" })
      if (path.endsWith("auth/providers")) return answer(200, { providers: { email: true } })
      if (path.endsWith("auth/admin-setup-required")) return answer(200, { required: false })
      throw new Error(`no route for ${path}`)
    })
    render(<SignInPage />)
    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeTruthy()
    expect(screen.queryByRole("status", { name: "Checking whether you're signed in" })).toBeNull()
  })

  it("is named for what it is", () => {
    expect(SignInPage.name).toBe("SignInPage")
  })
})
