import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"

// Setting a new password from an emailed link. A link that is old or already
// used was answered with the server's raw "invalid or expired reset token"
// under a form that could never succeed, and nothing offered a new link.

const router = vi.hoisted(() => ({ push: vi.fn() }))
const toast = vi.hoisted(() => vi.fn())
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams("token=r1"), useRouter: () => router }))
vi.mock("@/hooks/use-toast", () => ({ toast }))
vi.mock("@/components/themeProvider/theme-toggle", () => ({ ThemeToggle: () => null }))

import ResetPasswordPage from "./page"

type Answer = { status: number; body: unknown } | "unreachable"
let answer: Answer
// What the link check answers as the page opens; unanswered by default.
let check: Answer
const sent: unknown[] = []

beforeEach(() => {
  sent.length = 0
  answer = { status: 200, body: { msg: "password reset", status: "success" } }
  check = "unreachable"
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input).split("?")[0]
    if (path.endsWith("auth/reset-password/check")) {
      if (check === "unreachable") throw new TypeError("Failed to fetch")
      return { ok: check.status >= 200 && check.status < 300, status: check.status, json: async () => (check as { body: unknown }).body } as Response
    }
    if (!path.endsWith("auth/reset-password")) throw new Error(`no route for ${path}`)
    sent.push(init?.body ? JSON.parse(String(init.body)) : undefined)
    if (answer === "unreachable") throw new TypeError("Failed to fetch")
    const { status, body } = answer
    return { ok: status >= 200 && status < 300, status, json: async () => body } as Response
  })
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

async function choose(password: string, again = password) {
  render(<ResetPasswordPage />)
  fireEvent.change(await screen.findByLabelText("New password"), { target: { value: password } })
  fireEvent.change(screen.getByLabelText("Type it again"), { target: { value: again } })
  await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Save new password" })))
}

describe("a link that can't be used", () => {
  it("says the link has expired and offers a new one", async () => {
    answer = { status: 400, body: { msg: "invalid or expired reset token", status: "failed" } }
    await choose("a-new-password")
    expect(await screen.findByRole("heading", { name: "This link has expired" })).toBeTruthy()
    expect(screen.getByRole("link", { name: "Request a new one" }).getAttribute("href")).toBe("/forgot-password")
    expect(screen.queryByLabelText("New password")).toBeNull()
    expect(document.body.textContent).not.toContain("invalid or expired reset token")
  })

  it("tells someone whose account uses single sign-on that it has no password here", async () => {
    answer = {
      status: 403,
      body: { msg: "this account is managed by your single sign-on provider; local passwords are disabled", status: "failed" },
    }
    await choose("a-new-password")
    expect(await screen.findByRole("heading", { name: "Your account signs in with single sign-on" })).toBeTruthy()
    expect(screen.getByRole("link", { name: "Go to sign in" }).getAttribute("href")).toBe("/")
  })
})

describe("a link that works", () => {
  it("changes the password", async () => {
    await choose("a-new-password")
    expect(sent).toEqual([{ token: "r1", password: "a-new-password" }])
    expect(await screen.findByRole("heading", { name: "Your password is changed" })).toBeTruthy()
    // Design v3 (F6): back to sign-in, with the toast that says what next.
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Password changed. Sign in with the new one." }))
    expect(router.push).toHaveBeenCalledWith("/")
  })

  it("keeps the form when the workspace can't be reached, and says so", async () => {
    answer = "unreachable"
    await choose("a-new-password")
    expect(await screen.findByRole("alert")).toBeTruthy()
    expect(screen.getByLabelText("New password")).toBeTruthy()
  })
})

describe("a field that needs fixing", () => {
  it("takes the cursor to the second field when the two differ", async () => {
    await choose("a-new-password", "a-new-passw0rd")
    expect(document.activeElement).toBe(screen.getByLabelText("Type it again"))
    expect(sent).toEqual([])
  })

  it("takes the cursor to a password that is too short", async () => {
    await choose("short")
    expect(document.activeElement).toBe(screen.getByLabelText("New password"))
  })
})


// The new password is rated as it is typed, and the second field checks
// itself once the two match.
describe("choosing the new password", () => {
  it("shows the strength meter and the match check", async () => {
    const { container } = render(<ResetPasswordPage />)
    fireEvent.change(await screen.findByLabelText("New password"), { target: { value: "a-new-password" } })
    expect(container.querySelector("[data-strength-meter]")).not.toBeNull()
    fireEvent.change(screen.getByLabelText("Type it again"), { target: { value: "a-new-passwore" } })
    expect(screen.getByLabelText("Type it again").getAttribute("aria-invalid")).toBe("true")
    fireEvent.change(screen.getByLabelText("Type it again"), { target: { value: "a-new-password" } })
    expect(container.querySelector("[data-match-check]")).not.toBeNull()
  })
})

// QA SH-20 (14 Oct 2026): a made-up, used or expired link showed the form,
// and said it was no good only after a new password was typed twice.
describe("a link checked as the page opens", () => {
  it("says at once that it has expired, with no form", async () => {
    check = { status: 400, body: { code: "reset_link_invalid", msg: "This reset link is missing or used. Ask for a new one." } }
    render(<ResetPasswordPage />)
    expect(await screen.findByRole("heading", { name: "This link has expired" })).toBeTruthy()
    expect(screen.queryByLabelText("New password")).toBeNull()
  })

  it("shows the form for a link that can be used, or when nothing answered", async () => {
    check = { status: 200, body: { msg: "ok", data: { valid: true } } }
    render(<ResetPasswordPage />)
    expect(await screen.findByLabelText("New password")).toBeTruthy()
    cleanup()
    check = "unreachable"
    render(<ResetPasswordPage />)
    expect(await screen.findByLabelText("New password")).toBeTruthy()
  })
})
