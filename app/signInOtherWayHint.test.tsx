import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"

// An email whose account signs in another way gets a hint under the password
// that names the button to press, and that button is on the page.

const router = vi.hoisted(() => ({ push: vi.fn(), prefetch: vi.fn(), replace: vi.fn() }))
vi.mock("next/navigation", () => ({ useRouter: () => router, useSearchParams: () => new URLSearchParams() }))
vi.mock("@/components/themeProvider/theme-toggle", () => ({ ThemeToggle: () => null }))
vi.mock("@/services/passkeyService", () => ({ signInWithPasskey: vi.fn() }))
vi.mock("@/services/demoFunnel", () => ({ reportDemoStep: vi.fn() }))

import SignInPage from "./page"

let providers: Record<string, boolean>
let method: string

beforeEach(() => {
  vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
    const path = String(input).split("?")[0]
    const answer = (status: number, body: unknown) =>
      ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response
    if (path.endsWith("user/profile") || path.endsWith("refreshToken")) return answer(401, { msg: "no session" })
    if (path.endsWith("auth/providers")) return answer(200, { providers })
    if (path.endsWith("auth/admin-setup-required")) return answer(200, { required: false })
    if (path.endsWith("auth/login")) return answer(401, { msg: "Use another way to sign in.", auth_method: method })
    throw new Error(`no route for ${path}`)
  })
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

async function tryAPassword() {
  render(<SignInPage />)
  fireEvent.change(await screen.findByLabelText("Email address"), { target: { value: "sam@example.com" } })
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "a-password" } })
  await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Sign in" })))
}

/** The control a hint names, by the words between its curly quotes. */
const named = (hint: string) => hint.match(/“([^”]+)”/)?.[1] ?? ""

describe("an account that signs in with single sign-on", () => {
  it("is pointed at the single sign-on button, which is there", async () => {
    providers = { email: true, oidc: true }
    method = "oidc"
    await tryAPassword()
    const hint = (await screen.findByRole("alert")).textContent ?? ""
    expect(screen.getByRole("button", { name: named(hint) })).toBeTruthy()
  })

  it("is pointed at the directory tab, which is there", async () => {
    providers = { email: true, ldap: true }
    method = "ldap"
    await tryAPassword()
    const hint = (await screen.findByRole("alert")).textContent ?? ""
    expect(screen.getByRole("tab", { name: named(hint) })).toBeTruthy()
  })
})
