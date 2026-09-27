import React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"

import { ConnectAuthorize } from "@/components/connect/ConnectAuthorize"
import { approveConsent, denyConsent, getConsent, type ConsentView } from "@/services/connectService"
import { takePendingConnect } from "@/lib/pendingConnect"

const REQ = "3f2a4c1e-9b7d-4e2a-8c1f-0a1b2c3d4e5f"
let search = `request=${REQ}`

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(search),
}))
vi.mock("@/services/connectService", async (orig) => ({
  ...(await orig<typeof import("@/services/connectService")>()),
  getConsent: vi.fn(),
  approveConsent: vi.fn(),
  denyConsent: vi.fn(),
}))

const view = (over: Partial<ConsentView> = {}): ConsentView => ({
  client_name: "Claude",
  redirect_host: "claude.ai",
  scopes: ["tasks:read", "tasks:write"],
  agents: [],
  surface_enabled: true,
  is_admin: false,
  expires_at: "2026-09-27T10:00:00Z",
  ...over,
})

const assign = vi.fn()

describe("approving an outside agent", () => {
  beforeEach(() => {
    search = `request=${REQ}`
    Object.defineProperty(window, "location", { value: { ...window.location, assign }, writable: true })
  })
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
    sessionStorage.clear()
  })

  it("connects as a new agent with what was asked, then returns to the client", async () => {
    vi.mocked(getConsent).mockResolvedValue(view())
    vi.mocked(approveConsent).mockResolvedValue({
      redirect: "https://claude.ai/api/mcp/auth_callback?code=c&state=s",
      agent_id: "a1",
      agent_name: "Claude",
      created: true,
    })
    render(<ConnectAuthorize />)
    expect(await screen.findByRole("heading", { name: "Connect Claude" })).toBeTruthy()
    expect(screen.getByText(/A new agent named/)).toBeTruthy()
    expect(screen.getByText("changes things")).toBeTruthy()
    expect(screen.getByText("claude.ai")).toBeTruthy()

    fireEvent.click(screen.getByRole("button", { name: "Connect Claude" }))
    await waitFor(() =>
      expect(approveConsent).toHaveBeenCalledWith(REQ, { agent_id: "", scopes: ["tasks:read", "tasks:write"] }),
    )
    expect(assign).toHaveBeenCalledWith("https://claude.ai/api/mcp/auth_callback?code=c&state=s")
  })

  it("grants only what is left ticked, and nothing at all is not an option", async () => {
    vi.mocked(getConsent).mockResolvedValue(view())
    vi.mocked(approveConsent).mockResolvedValue({ redirect: "https://claude.ai/cb", agent_id: "a1", agent_name: "Claude", created: true })
    render(<ConnectAuthorize />)
    await screen.findByRole("heading", { name: "Connect Claude" })
    const [read, write] = screen.getAllByRole("checkbox")
    const button = screen.getByRole("button", { name: "Connect Claude" }) as HTMLButtonElement
    fireEvent.click(read)
    fireEvent.click(write)
    expect(button.disabled).toBe(true)
    fireEvent.click(read)
    fireEvent.click(button)
    await waitFor(() => expect(approveConsent).toHaveBeenCalledWith(REQ, { agent_id: "", scopes: ["tasks:read"] }))
  })

  it("reuses the agent made last time", async () => {
    vi.mocked(getConsent).mockResolvedValue(
      view({ agents: [{ id: "a1", name: "Claude", tools: 4 }], suggested_agent_id: "a1" }),
    )
    vi.mocked(approveConsent).mockResolvedValue({ redirect: "https://claude.ai/cb", agent_id: "a1", agent_name: "Claude", created: false })
    render(<ConnectAuthorize />)
    expect(await screen.findByText(/Connected before/)).toBeTruthy()
    expect(screen.queryByText(/A new agent named/)).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Connect Claude" }))
    await waitFor(() => expect(approveConsent).toHaveBeenCalledWith(REQ, expect.objectContaining({ agent_id: "a1" })))
  })

  it("says what to do while an admin has outside agents off, and cannot approve", async () => {
    vi.mocked(getConsent).mockResolvedValue(view({ surface_enabled: false, is_admin: true }))
    render(<ConnectAuthorize />)
    expect(await screen.findByText(/Outside agents are turned off here/)).toBeTruthy()
    expect((screen.getByRole("button", { name: "Connect Claude" }) as HTMLButtonElement).disabled).toBe(true)
  })

  it("sends a signed-out person to sign in and brings them back", async () => {
    vi.mocked(getConsent).mockRejectedValue({ response: { status: 401 } })
    render(<ConnectAuthorize />)
    fireEvent.click(await screen.findByRole("button", { name: "Sign in" }))
    expect(assign).toHaveBeenCalledWith("/")
    expect(takePendingConnect()).toBe(`/connect/authorize?request=${REQ}`)
    expect(takePendingConnect()).toBeNull()
  })

  it("tells the client no when the person declines", async () => {
    vi.mocked(getConsent).mockResolvedValue(view())
    vi.mocked(denyConsent).mockResolvedValue("https://claude.ai/cb?error=access_denied")
    render(<ConnectAuthorize />)
    fireEvent.click(await screen.findByRole("button", { name: "Don't connect" }))
    await waitFor(() => expect(assign).toHaveBeenCalledWith("https://claude.ai/cb?error=access_denied"))
  })

  it("explains an error the server would not send to an unverified address", async () => {
    search = "error=invalid_redirect_uri"
    render(<ConnectAuthorize />)
    expect(await screen.findByText(/never registered/)).toBeTruthy()
    expect(getConsent).not.toHaveBeenCalled()
  })

  it("an expired sign-in says so", async () => {
    vi.mocked(getConsent).mockRejectedValue({ response: { status: 410, data: { msg: "This sign-in has expired." } } })
    render(<ConnectAuthorize />)
    expect(await screen.findByText("This sign-in has expired.")).toBeTruthy()
  })
})
