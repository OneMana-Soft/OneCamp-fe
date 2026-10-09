import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"

// Signing in through the directory (LDAP) asks for the second step too, as the
// email password does: the server answers a right password from someone with
// two-step on with 200, a challenge and no cookie. The sign-in page runs as it
// does in the app, with its own AuthService; a fake server answers its requests.

const router = vi.hoisted(() => ({ push: vi.fn(), prefetch: vi.fn(), replace: vi.fn() }))
vi.mock("next/navigation", () => ({ useRouter: () => router, useSearchParams: () => new URLSearchParams() }))
vi.mock("@/components/themeProvider/theme-toggle", () => ({ ThemeToggle: () => null }))
vi.mock("@/services/passkeyService", () => ({ signInWithPasskey: vi.fn() }))

import SignInPage from "./page"

type Answer = { status: number; body: unknown }
const CHALLENGE = "challenge-jwt"
const SIGNED_IN: Answer = { status: 200, body: { msg: "Signed in" } }
const EXPIRED: Answer = { status: 401, body: { code: "totp_challenge_invalid", msg: "This sign-in has expired. Start again." } }

let directoryAnswer: Answer
let emailAnswer: Answer
let codeAnswer: Answer
const sent: { path: string; body: unknown }[] = []

// The server, by the path each request ends with.
function server(path: string): Answer {
  if (path.endsWith("user/profile") || path.endsWith("refreshToken")) return { status: 401, body: { msg: "no session" } }
  if (path.endsWith("auth/providers")) return { status: 200, body: { providers: { email: true, ldap: true } } }
  if (path.endsWith("auth/admin-setup-required")) return { status: 200, body: { required: false } }
  if (path.endsWith("auth/ldap-login")) return directoryAnswer
  if (path.endsWith("auth/login")) return emailAnswer
  if (path.endsWith("auth/login/totp")) return codeAnswer
  throw new Error(`no route for ${path}`)
}

beforeEach(() => {
  router.push.mockReset()
  sent.length = 0
  directoryAnswer = {
    status: 200,
    body: { status: "totp_required", msg: "Enter the code from your authenticator app.", challenge: CHALLENGE },
  }
  emailAnswer = directoryAnswer
  codeAnswer = SIGNED_IN
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input).split("?")[0]
    sent.push({ path, body: init?.body ? JSON.parse(String(init.body)) : undefined })
    const { status, body } = server(path)
    return { ok: status >= 200 && status < 300, status, json: async () => body } as Response
  })
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

/** The page, on its directory form, with a name and password entered and sent. */
async function signInThroughTheDirectory() {
  render(<SignInPage />)
  fireEvent.click(await screen.findByRole("button", { name: "Directory Login" }))
  fireEvent.change(screen.getByLabelText("Directory Username or Email"), { target: { value: "sam" } })
  fireEvent.change(screen.getByLabelText("Directory Password"), { target: { value: "directory-password" } })
  await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Sign in via Directory" })))
}

const enterCode = async (code: string) => {
  await act(async () => void fireEvent.change(screen.getByLabelText("6-digit code"), { target: { value: code } }))
}

describe("signing in through the directory with two-step on", () => {
  it("asks for the code, and doesn't go into the app without it", async () => {
    await signInThroughTheDirectory()
    expect(await screen.findByText("Two-step verification")).toBeTruthy()
    expect(screen.getByText("Enter the code from your authenticator app.")).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Sign in via Directory" })).toBeNull()
    expect(router.push).not.toHaveBeenCalled()
  })

  it("signs in once the code is right, sending the challenge and the code as the email sign-in does", async () => {
    await signInThroughTheDirectory()
    await screen.findByText("Two-step verification")
    await enterCode("123456")
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/app/home"))
    expect(sent.find((r) => r.path.endsWith("auth/login/totp"))?.body).toEqual({ challenge: CHALLENGE, code: "123456" })
  })

  it("goes back to the directory form, without the password, once the challenge has expired", async () => {
    codeAnswer = EXPIRED
    await signInThroughTheDirectory()
    await screen.findByText("Two-step verification")
    await enterCode("123456")
    expect(await screen.findByText("This sign-in has expired. Start again.")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Start again" }))
    expect(await screen.findByRole("button", { name: "Sign in via Directory" })).toBeTruthy()
    expect(screen.queryByText("Two-step verification")).toBeNull()
    expect((screen.getByLabelText("Directory Username or Email") as HTMLInputElement).value).toBe("sam")
    expect((screen.getByLabelText("Directory Password") as HTMLInputElement).value).toBe("")
    expect(router.push).not.toHaveBeenCalled()
  })
})

describe("signing in through the directory", () => {
  it("goes straight in for someone without two-step", async () => {
    directoryAnswer = SIGNED_IN
    await signInThroughTheDirectory()
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/app/home"))
    expect(screen.queryByText("Two-step verification")).toBeNull()
  })

  it("says why a wrong password was refused, on the directory form", async () => {
    directoryAnswer = { status: 401, body: { msg: "Invalid directory credentials." } }
    await signInThroughTheDirectory()
    expect(await screen.findByText("Invalid directory credentials.")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Sign in via Directory" })).toBeTruthy()
    expect(router.push).not.toHaveBeenCalled()
  })
})

// The email form goes through the same handling, so it's checked here too.
describe("signing in with an email password with two-step on", () => {
  it("still asks for the code, and the code signs in", async () => {
    render(<SignInPage />)
    fireEvent.change(await screen.findByLabelText("Email address"), { target: { value: "sam@example.com" } })
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "email-password" } })
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Sign In" })))
    expect(await screen.findByText("Two-step verification")).toBeTruthy()
    expect(router.push).not.toHaveBeenCalled()
    await enterCode("654321")
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/app/home"))
    expect(sent.find((r) => r.path.endsWith("auth/login/totp"))?.body).toEqual({ challenge: CHALLENGE, code: "654321" })
  })
})
