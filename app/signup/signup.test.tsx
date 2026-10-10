import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"

// Accepting an invitation: a name in any language, one password with a show
// button, the @handle the server made from the name, and every other way in
// the workspace has turned on.

const router = vi.hoisted(() => ({ push: vi.fn(), prefetch: vi.fn(), replace: vi.fn() }))
vi.mock("next/navigation", () => ({ useRouter: () => router, useSearchParams: () => new URLSearchParams("token=tok-ana") }))
vi.mock("@/components/themeProvider/theme-toggle", () => ({ ThemeToggle: () => null }))

import SignupPage from "./page"

const LANDING = "/app/channel/6f1c3a52-9d3e-4c9e-a7b1-2f0e5d4c3b2a?compose=1"
let providers: Record<string, boolean>
let suggested: string
let invitedBy: Record<string, string>
const sent: { path: string; body: unknown }[] = []

beforeEach(() => {
  router.push.mockReset()
  sent.length = 0
  providers = { email: true, google: true, github: false, oidc: true, saml: false, ldap: true }
  suggested = ""
  invitedBy = {}
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input).split("?")[0]
    sent.push({ path, body: init?.body ? JSON.parse(String(init.body)) : undefined })
    let body: unknown
    if (path.endsWith("auth/providers")) body = { providers }
    else if (path.endsWith("auth/validate-token")) body = { valid: true, email: "ana@example.com", name: suggested, ...invitedBy }
    else if (path.endsWith("auth/signup")) body = { status: "success", landing: LANDING, handle: "josé-obrien", name: "José O'Brien" }
    else throw new Error(`no route for ${path}`)
    return { ok: true, status: 200, json: async () => body } as Response
  })
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe("accepting an invitation", () => {
  it("asks for a name and one password, and shows the handle made from the name", async () => {
    render(<SignupPage />)
    await screen.findByLabelText("Your name")
    expect(screen.queryByLabelText(/confirm/i)).toBeNull()
    expect(screen.getAllByLabelText("Password")).toHaveLength(1)
    expect(document.querySelectorAll("input[type=password]")).toHaveLength(1)

    fireEvent.change(screen.getByLabelText("Your name"), { target: { value: "José O'Brien" } })
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "a long enough password" } })
    fireEvent.click(screen.getByRole("button", { name: "Show password" }))
    expect((screen.getByLabelText("Password") as HTMLInputElement).type).toBe("text")
    await act(async () => void fireEvent.submit(screen.getByRole("button", { name: "Create account" }).closest("form")!))

    expect(sent.find((r) => r.path.endsWith("auth/signup"))?.body).toEqual({ token: "tok-ana", name: "José O'Brien", password: "a long enough password" })
    expect(await screen.findByText("@josé-obrien")).toBeTruthy()
    expect(screen.getByText(/You're in, José O'Brien/)).toBeTruthy()
    // Mentions pick people by name, so the handle isn't sold as what they're mentioned by.
    expect(document.body.textContent).not.toMatch(/mention/i)
    fireEvent.click(screen.getByRole("button", { name: "Continue" }))
    expect(router.push).toHaveBeenCalledWith(LANDING)
  })

  it("suggests the name an import already knows them by", async () => {
    suggested = "Priya R"
    render(<SignupPage />)
    await waitFor(() => expect((screen.getByLabelText("Your name") as HTMLInputElement).value).toBe("Priya R"))
  })

  it("refuses a name the rule refuses, without sending it", async () => {
    render(<SignupPage />)
    await screen.findByLabelText("Your name")
    fireEvent.change(screen.getByLabelText("Your name"), { target: { value: "<b>bold</b>" } })
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "a long enough password" } })
    await act(async () => void fireEvent.submit(screen.getByRole("button", { name: "Create account" }).closest("form")!))
    expect(screen.getByRole("alert").textContent).toMatch(/Your name can use letters, spaces, apostrophes, hyphens and full stops/)
    expect(sent.some((r) => r.path.endsWith("auth/signup"))).toBe(false)
  })

  it("offers every way in the workspace has turned on", async () => {
    render(<SignupPage />)
    expect(await screen.findByRole("button", { name: "Continue with Google" })).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Continue with GitHub" })).toBeNull()
    expect(screen.getByRole("button", { name: "Continue with single sign-on" })).toBeTruthy()
    expect(screen.queryByRole("button", { name: /SAML/ })).toBeNull()
    expect(screen.getByRole("link", { name: /directory account/ }).getAttribute("href")).toBe("/?tab=directory")
  })

  it("says who invited them, and to which workspace", async () => {
    invitedBy = { inviter_name: "Sam Rivera", workspace: "team.example.com" }
    render(<SignupPage />)
    await screen.findByLabelText("Your name")
    const line = screen.getByText(/invited you/)
    expect(line.textContent).toBe("Sam Rivera invited you to team.example.com as ana@example.com.")
  })

  it("says only what it knows when the inviter has gone", async () => {
    invitedBy = { inviter_name: "", workspace: "team.example.com" }
    render(<SignupPage />)
    await screen.findByLabelText("Your name")
    expect(screen.getByText(/You're invited/).textContent).toBe("You're invited to team.example.com as ana@example.com.")
  })

  it("leaves the password out when the workspace has turned it off", async () => {
    providers = { email: false, google: true, github: true, oidc: false, saml: false, ldap: false }
    render(<SignupPage />)
    expect(await screen.findByRole("button", { name: "Continue with GitHub" })).toBeTruthy()
    expect(screen.queryByLabelText("Password")).toBeNull()
    expect(screen.queryByRole("button", { name: "Create account" })).toBeNull()
    // Nor offers one in words.
    expect(screen.getByText(/Use the account for ana@example.com/).textContent).toBe("Use the account for ana@example.com.")
  })
})

// A link that couldn't be checked is not a dead link. When the server can't be
// reached, or answers with its own failure, the page said "This invitation
// can't be used" and offered only the sign-in page, so a good invitation looked
// spent and the person asked for a new one they didn't need.
describe("an invitation that couldn't be checked", () => {
  const answer = (status: number, body: unknown) =>
    ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response

  it("says it couldn't check, and checks again when asked", async () => {
    let reachable = false
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      const path = String(input).split("?")[0]
      if (path.endsWith("auth/providers")) return answer(200, { providers })
      if (path.endsWith("auth/validate-token")) {
        if (!reachable) throw new TypeError("Failed to fetch")
        return answer(200, { valid: true, email: "ana@example.com" })
      }
      throw new Error(`no route for ${path}`)
    })
    render(<SignupPage />)
    expect(await screen.findByRole("heading", { name: "Couldn't check your invitation" })).toBeTruthy()
    expect(screen.queryByRole("heading", { name: "This invitation can't be used" })).toBeNull()
    reachable = true
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Try again" })))
    expect(await screen.findByLabelText("Your name")).toBeTruthy()
  })

  it("reads the server's own failure the same way", async () => {
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      const path = String(input).split("?")[0]
      if (path.endsWith("auth/providers")) return answer(200, { providers })
      if (path.endsWith("auth/validate-token")) return { ok: false, status: 502, json: async () => { throw new SyntaxError("Unexpected token <") } } as unknown as Response
      throw new Error(`no route for ${path}`)
    })
    render(<SignupPage />)
    expect(await screen.findByRole("heading", { name: "Couldn't check your invitation" })).toBeTruthy()
  })

  it("still says an invitation the server refused can't be used, and why", async () => {
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      const path = String(input).split("?")[0]
      if (path.endsWith("auth/providers")) return answer(200, { providers })
      if (path.endsWith("auth/validate-token")) return answer(400, { valid: false, msg: "This invitation has expired. Ask Sam Rivera to send it again." })
      throw new Error(`no route for ${path}`)
    })
    render(<SignupPage />)
    expect(await screen.findByRole("heading", { name: "This invitation can't be used" })).toBeTruthy()
    expect(screen.getByText("This invitation has expired. Ask Sam Rivera to send it again.")).toBeTruthy()
  })
})
