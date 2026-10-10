import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"

// Someone who has just joined opens on the channel the server put them in, not
// on an empty Home: after accepting an invitation, and after a first sign-in
// through the directory. Anything that is not a page of the app is ignored.

const router = vi.hoisted(() => ({ push: vi.fn(), prefetch: vi.fn(), replace: vi.fn() }))
const nav = vi.hoisted(() => ({ search: "" }))
vi.mock("next/navigation", () => ({ useRouter: () => router, useSearchParams: () => new URLSearchParams(nav.search) }))
vi.mock("@/components/themeProvider/theme-toggle", () => ({ ThemeToggle: () => null }))
vi.mock("@/services/passkeyService", () => ({ signInWithPasskey: vi.fn() }))

import SignInPage from "./page"
import SignupPage from "./signup/page"

const LANDING = "/app/channel/6f1c3a52-9d3e-4c9e-a7b1-2f0e5d4c3b2a?compose=1"
let answer: unknown

function server(path: string): { status: number; body: unknown } {
  if (path.endsWith("user/profile") || path.endsWith("refreshToken")) return { status: 401, body: { msg: "no session" } }
  if (path.endsWith("auth/providers")) return { status: 200, body: { providers: { email: true, ldap: true } } }
  if (path.endsWith("auth/admin-setup-required")) return { status: 200, body: { required: false } }
  if (path.endsWith("auth/validate-token")) return { status: 200, body: { valid: true, email: "ana@example.com" } }
  if (path.endsWith("auth/ldap-login") || path.endsWith("auth/signup")) return { status: 200, body: answer }
  throw new Error(`no route for ${path}`)
}

beforeEach(() => {
  router.push.mockReset()
  nav.search = ""
  answer = { status: "success", msg: "login successful", landing: LANDING }
  vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
    const { status, body } = server(String(input).split("?")[0])
    return { ok: status >= 200 && status < 300, status, json: async () => body } as Response
  })
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

async function signInThroughTheDirectory() {
  render(<SignInPage />)
  // A tab switches on the press, as a click starts (Radix tabs).
  fireEvent.mouseDown(await screen.findByRole("tab", { name: "Company directory" }))
  fireEvent.change(screen.getByLabelText("Directory username or email"), { target: { value: "cleo" } })
  fireEvent.change(screen.getByLabelText("Directory password"), { target: { value: "directory-password" } })
  await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Sign in with directory" })))
}

describe("a first sign-in through the directory", () => {
  it("opens the channel the new member was put in", async () => {
    await signInThroughTheDirectory()
    await waitFor(() => expect(router.push).toHaveBeenCalledWith(LANDING))
  })

  it("keeps Home for a member signing in again, and for an answer that leaves the app", async () => {
    answer = { status: "success", landing: "https://evil.example/app" }
    await signInThroughTheDirectory()
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/app/home"))
  })
})

describe("accepting an invitation", () => {
  it("opens the channel the new member was put in", async () => {
    nav.search = "token=tok-ana"
    render(<SignupPage />)
    await screen.findByText("ana@example.com")
    fireEvent.change(screen.getByLabelText("Your name"), { target: { value: "Ana" } })
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "a long enough password" } })
    await act(async () => void fireEvent.submit(screen.getByRole("button", { name: /create account/i }).closest("form")!))
    await waitFor(() => expect(router.push).toHaveBeenCalledWith(LANDING))
  })
})
