import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"

// Setting up the first admin on an empty server. An error is said under the
// field it is about, and the cursor goes there.

const router = vi.hoisted(() => ({ push: vi.fn(), prefetch: vi.fn(), replace: vi.fn() }))
vi.mock("next/navigation", () => ({ useRouter: () => router }))
vi.mock("@/components/themeProvider/theme-toggle", () => ({ ThemeToggle: () => null }))

import AdminSetupPage from "./page"

const sent: string[] = []

beforeEach(() => {
  sent.length = 0
  vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
    const path = String(input).split("?")[0]
    sent.push(path)
    if (path.endsWith("auth/admin-setup-required")) {
      return { ok: true, status: 200, json: async () => ({ required: true, pinned: false }) } as Response
    }
    throw new Error(`no route for ${path}`)
  })
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

async function fill(fields: { email?: string; password?: string; again?: string }) {
  render(<AdminSetupPage />)
  fireEvent.change(await screen.findByLabelText("Your email"), { target: { value: fields.email ?? "" } })
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: fields.password ?? "" } })
  fireEvent.change(screen.getByLabelText("Type it again"), { target: { value: fields.again ?? fields.password ?? "" } })
  await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Create admin account" })))
}

describe("a field that needs fixing", () => {
  it("takes the cursor to an address that isn't one", async () => {
    await fill({ email: "not-an-address", password: "a-long-password" })
    expect(screen.getByRole("alert").textContent).toBe("Enter an email address like you@company.com.")
    expect(document.activeElement).toBe(screen.getByLabelText("Your email"))
  })

  it("takes the cursor to a password that is too short", async () => {
    await fill({ email: "you@company.com", password: "short" })
    expect(document.activeElement).toBe(screen.getByLabelText("Password"))
  })

  it("takes the cursor to the second password when the two differ", async () => {
    await fill({ email: "you@company.com", password: "a-long-password", again: "a-long-passw0rd" })
    expect(document.activeElement).toBe(screen.getByLabelText("Type it again"))
    expect(sent.some((p) => p.endsWith("auth/admin-setup"))).toBe(false)
  })
})

describe("checking the server", () => {
  it("holds the form's place, and says what it is doing", () => {
    vi.stubGlobal("fetch", () => new Promise(() => {}))
    const { container } = render(<AdminSetupPage />)
    const waiting = screen.getByRole("status", { name: "Checking this server" })
    expect(waiting.getAttribute("aria-busy")).toBe("true")
    expect(container.querySelector(".animate-spin")).toBeNull()
  })
})

