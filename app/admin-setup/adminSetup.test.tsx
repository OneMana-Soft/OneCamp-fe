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
    if (path.endsWith("auth/admin-setup")) {
      return { ok: true, status: 200, json: async () => ({ msg: "created" }) } as Response
    }
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

async function fill(fields: { email?: string; password?: string; again?: string }, mount = true) {
  if (mount) render(<AdminSetupPage />)
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

// A fresh install on a slow server: a setup check that gets no answer used to
// read as "no admin needed" and send the operator to a sign-in page on a server
// with no accounts.
describe("a setup check that gets no answer", () => {
  it("says so, offers to check again, and stays on setup", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new TypeError("Failed to fetch")
    })
    render(<AdminSetupPage />)
    expect(await screen.findByRole("heading", { name: "Couldn't reach this server" })).toBeInTheDocument()
    expect(router.push).not.toHaveBeenCalled()
    vi.stubGlobal("fetch", async () => ({ ok: true, status: 200, json: async () => ({ required: true, pinned: false }) }) as Response)
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Check again" })))
    expect(await screen.findByLabelText("Your email")).toBeInTheDocument()
  })
})

// Design v3 (admin.md E1, mock M9): step 1 of the first run beside the camp
// before anyone arrives, then the ignition into step 2.
describe("the first run's first step", () => {
  it("says which step it is, and is beside the grey camp", async () => {
    const { container } = render(<AdminSetupPage />)
    await screen.findByLabelText("Your email")
    expect(container.querySelector("[data-step-pill]")?.textContent).toBe("Step 1 of 3 · Your account")
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Set up your camp")
    expect(container.querySelector("[data-first-run-camp]")).not.toBeNull()
    expect(container.querySelector("[data-camp][data-lit]")).toBeNull()
  })

  it("rates the password as it is typed: four segments and a word", async () => {
    const { container } = render(<AdminSetupPage />)
    fireEvent.change(await screen.findByLabelText("Password"), { target: { value: "short" } })
    const meter = container.querySelector("[data-strength-meter]")!
    expect(meter.querySelectorAll("i")).toHaveLength(4)
    expect(meter.getAttribute("data-level")).toBe("1")
    expect(meter.textContent).toBe("Weak")
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "Camp-fire-2026-lit" } })
    expect(meter.getAttribute("data-level")).toBe("4")
    expect(meter.textContent).toBe("Strong")
  })

  it("checks the second password inside its field once the two match", async () => {
    const { container } = render(<AdminSetupPage />)
    fireEvent.change(await screen.findByLabelText("Password"), { target: { value: "a-long-password" } })
    fireEvent.change(screen.getByLabelText("Type it again"), { target: { value: "a-long-passwor" } })
    expect(container.querySelector("[data-match-check]")).toBeNull()
    fireEvent.change(screen.getByLabelText("Type it again"), { target: { value: "a-long-password" } })
    expect(container.querySelector("[data-match-check]")).not.toBeNull()
  })

  it("skips the ignition under reduced motion: the ring lit at once, then step 2", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    window.matchMedia = ((q: string) => ({ matches: q.includes("reduce"), media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia
    const { container } = render(<AdminSetupPage />)
    await fill({ email: "you@company.com", password: "a-long-password" }, false)
    const camp = container.querySelector("[data-camp][data-lit]")
    expect(camp).not.toBeNull()
    expect(camp?.hasAttribute("data-instant")).toBe(true)
    await act(async () => void vi.advanceTimersByTime(200))
    expect(await screen.findByRole("heading", { name: "Pick your camp's colour" })).toBeTruthy()
    vi.useRealTimers()
  })

  it("lets Enter skip the ignition", async () => {
    window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia
    render(<AdminSetupPage />)
    await fill({ email: "you@company.com", password: "a-long-password" }, false)
    expect(screen.queryByRole("heading", { name: "Pick your camp's colour" })).toBeNull()
    fireEvent.keyDown(window, { key: "Enter" })
    expect(await screen.findByRole("heading", { name: "Pick your camp's colour" })).toBeTruthy()
  })
})
