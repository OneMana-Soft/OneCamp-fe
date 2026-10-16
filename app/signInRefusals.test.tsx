import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"

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
    // Design v3 (F2): one notice card whose tone is data-tone (the tile's
    // colour follows it in app/styles/admin/auth.css), not a tinted box.
    const calm = await refusalBox()
    expect(calm.dataset.tone).toBe("neutral")
    expect(calm.className).toContain("auth-notice")
    expect(calm.getAttribute("role")).toBe("status")
    cleanup()

    nav.search = "error=invitation_expired"
    render(<SignInPage />)
    const warn = await refusalBox()
    expect(warn.dataset.tone).toBe("warning")
    expect(warn.getAttribute("role")).toBe("status")
    cleanup()

    nav.search = "error=db_error"
    render(<SignInPage />)
    const broke = await refusalBox()
    expect(broke.dataset.tone).toBe("error")
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
    fireEvent.change(await screen.findByLabelText("Email address"), { target: { value: "admin@example.com" } })
    fireEvent.click(screen.getByRole("button", { name: "Continue with email" }))
    expect(await screen.findByLabelText("Password")).toBeTruthy()
    expect(screen.getByText("Passwords are off on this workspace. Only admins can sign in with one.")).toBeTruthy()
  })
})

// The two-step email (design v3, F2; owner decision D3): the address first,
// then the password slides in with the address collapsed into an identity
// chip, and "Change" goes back with the address kept.
describe("signing in with an email", () => {
  it("asks for the address, then the password beside an identity chip", async () => {
    render(<SignInPage />)
    expect(screen.queryByLabelText("Password")).toBeNull()
    fireEvent.change(await screen.findByLabelText("Email address"), { target: { value: "sam@example.com" } })
    fireEvent.click(screen.getByRole("button", { name: "Continue with email" }))
    expect(await screen.findByLabelText("Password")).toBeTruthy()
    const chip = document.querySelector("[data-identity-chip]")!
    expect(chip.textContent).toContain("sam@example.com")
    expect(screen.queryByLabelText("Email address")).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: /Change the email/ }))
    expect(((await screen.findByLabelText("Email address")) as HTMLInputElement).value).toBe("sam@example.com")
  })

  it("says what is missing when Continue is pressed with no address", async () => {
    render(<SignInPage />)
    fireEvent.click(await screen.findByRole("button", { name: "Continue with email" }))
    expect(screen.getByRole("alert").textContent).toContain("Enter the email you sign in with.")
    expect(screen.queryByLabelText("Password")).toBeNull()
  })

  it("lays Google and GitHub side by side, named in full for a screen reader", async () => {
    providers = { email: true, google: true, github: true }
    render(<SignInPage />)
    const google = await screen.findByRole("button", { name: "Continue with Google" })
    const github = screen.getByRole("button", { name: "Continue with GitHub" })
    expect(google.parentElement).toBe(github.parentElement)
    expect(google.parentElement?.className).toContain("auth-providers")
    expect(google.className).not.toContain("auth-wide")
    expect(google.querySelector('[data-provider-mark="google"]')).not.toBeNull()
  })

  it("draws a refusal as the notice card, above the form", async () => {
    nav.search = "error=seat_limit"
    render(<SignInPage />)
    const box = await refusalBox()
    expect(box.className).toContain("auth-notice")
    expect(box.querySelector(".auth-notice-tile")).not.toBeNull()
    const email = screen.getByLabelText("Email address")
    expect(box.compareDocumentPosition(email) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})
