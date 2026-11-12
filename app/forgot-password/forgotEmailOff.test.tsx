import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"

// Forgot password on a server that can't send email (SHELL-26). The page used
// to say a link was on its way and offer to send it again, whether or not the
// server could send anything: a person locked out waited for an email that
// was never coming. The public sign-in answer says whether mailed links can
// arrive (email_configured), so the page says so instead, and offers nothing
// that would send nothing. It depends on the workspace, never the address,
// so it tells a stranger nothing about who has an account.

vi.mock("@/components/themeProvider/theme-toggle", () => ({ ThemeToggle: () => null }))
import ForgotPasswordPage from "./page"

const OFF = "This workspace can't send email yet, so no link will arrive. Ask your workspace admin to set up email or to help you sign in."
let resets = 0
let answer: Promise<unknown>

beforeEach(() => {
  resets = 0
  answer = Promise.resolve({ status: "success", providers: { email: true }, email_configured: false })
  process.env.NEXT_PUBLIC_BACKEND_URL = "https://api.example.com/"
  vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url.endsWith("auth/providers")) return { ok: true, status: 200, json: async () => await answer } as Response
    if (/auth\/forgot-password/.test(url)) resets++
    return { ok: true, status: 200, json: async () => ({ msg: "sent" }) } as Response
  })
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  delete process.env.NEXT_PUBLIC_BACKEND_URL
})

describe("forgot password on a server without email", () => {
  it("says no link will arrive when the server can't send, and offers no resend", async () => {
    render(<ForgotPasswordPage />)
    const note = await screen.findByRole("note")
    expect(note.textContent).toBe(OFF)
    expect(screen.queryByRole("button", { name: "Send reset link" })).toBeNull()
    expect(screen.queryByRole("button", { name: /Send again/ })).toBeNull()
    expect(document.body.textContent).not.toMatch(/on its way|we'll send you a link/)
    expect(screen.getByRole("link", { name: "Back to sign in" })).toBeTruthy()
  })

  it("takes back the promise when the answer comes after the link was asked for", async () => {
    let tell: (v: unknown) => void = () => {}
    answer = new Promise((r) => (tell = r))
    render(<ForgotPasswordPage />)
    fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "priya@kestrel.studio" } })
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Send reset link" })))
    expect(await screen.findByRole("heading", { name: "Check your email" })).toBeTruthy()
    expect(resets).toBe(1)
    await act(async () => tell({ status: "success", providers: { email: true }, email_configured: false }))
    expect((await screen.findByRole("note")).textContent).toBe(OFF)
    expect(screen.queryByRole("button", { name: /Send again/ })).toBeNull()
    expect(document.body.textContent).not.toMatch(/on its way/)
  })

  it("changes nothing on a server that can send", async () => {
    answer = Promise.resolve({ status: "success", providers: { email: true }, email_configured: true })
    render(<ForgotPasswordPage />)
    fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "priya@kestrel.studio" } })
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Send reset link" })))
    expect(await screen.findByRole("heading", { name: "Check your email" })).toBeTruthy()
    expect(screen.getByRole("button", { name: /Send again in/ })).toBeTruthy()
    expect(screen.queryByRole("note")).toBeNull()
  })
})
