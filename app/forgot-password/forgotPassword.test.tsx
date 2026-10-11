import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"

// The forgot-password page's sent state (design v3, admin.md F6): the
// envelope, the address masked, and "Send again" held for 30 seconds so a
// second email is one press away without a flood of them.

vi.mock("@/components/themeProvider/theme-toggle", () => ({ ThemeToggle: () => null }))
import ForgotPasswordPage from "./page"

const sent: string[] = []
beforeEach(() => {
  sent.length = 0
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    sent.push(String(init?.body ?? ""))
    expect(String(input)).toMatch(/auth\/forgot-password/)
    return { ok: true, status: 200, json: async () => ({ msg: "sent" }) } as Response
  })
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe("asking for a reset link", () => {
  it("says to check the masked address, and holds Send again for 30 seconds", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    render(<ForgotPasswordPage />)
    fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "priya@kestrel.example" } })
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Send reset link" })))
    expect(await screen.findByRole("heading", { name: "Check your email" })).toBeTruthy()
    expect(document.body.textContent).toContain("p•••@kestrel.example")
    expect(document.body.textContent).not.toContain("priya@kestrel.example")
    const again = screen.getByRole("button", { name: /Send again in 0:30/ }) as HTMLButtonElement
    expect(again.disabled).toBe(true)
    for (let i = 0; i < 31; i++) await act(async () => void vi.advanceTimersByTime(1000))
    const ready = screen.getByRole("button", { name: "Send again" }) as HTMLButtonElement
    expect(ready.disabled).toBe(false)
    await act(async () => void fireEvent.click(ready))
    expect(sent).toHaveLength(2)
  })
})
