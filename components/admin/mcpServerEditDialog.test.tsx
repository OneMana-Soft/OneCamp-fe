import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"

vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }), toast: vi.fn() }))
vi.mock("@/services/mcpService", async (orig) => ({
  ...(await orig<typeof import("@/services/mcpService")>()),
  createMcpServer: vi.fn(),
  updateMcpServer: vi.fn(),
  testMcpServer: vi.fn(),
}))

import { McpServerEditDialog } from "@/components/admin/McpServerEditDialog"
import { createMcpServer, testMcpServer } from "@/services/mcpService"

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const saved = {
  id: "m1",
  name: "GitHub tools",
  url: "https://mcp.kestrel.studio/github",
  auth_type: "bearer" as const,
  enabled: true,
  has_auth_secret: true,
}

describe("the MCP server dialog", () => {
  it("puts its title icon on the AI group's tile, not in the accent", () => {
    render(<McpServerEditDialog server={null} open onClose={() => {}} onSaved={() => {}} />)
    const title = screen.getByRole("heading", { name: "Add an MCP server" })
    expect(title.querySelector(".hue-dusk")).toBeTruthy()
    expect(title.querySelector(".text-primary")).toBeNull()
  })

  // One red line at the foot of the dialog, tied to no field, with the cursor
  // left where it was.
  it("says a missing name under the name, and puts the cursor there", async () => {
    render(<McpServerEditDialog server={null} open onClose={() => {}} onSaved={() => {}} />)
    fireEvent.click(screen.getByRole("button", { name: "Add server" }))
    const name = screen.getByLabelText("Name")
    await waitFor(() => expect(name.getAttribute("aria-invalid")).toBe("true"))
    expect(screen.getByText("Give the server a name.")).toBeTruthy()
    expect(document.activeElement).toBe(name)
    expect(createMcpServer).not.toHaveBeenCalled()
  })

  it("says an address that isn't http(s) under the address", async () => {
    render(<McpServerEditDialog server={null} open onClose={() => {}} onSaved={() => {}} />)
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "GitHub" } })
    fireEvent.change(screen.getByLabelText("Server address"), { target: { value: "mcp.example.com" } })
    fireEvent.click(screen.getByRole("button", { name: "Add server" }))
    const url = screen.getByLabelText("Server address")
    await waitFor(() => expect(url.getAttribute("aria-invalid")).toBe("true"))
    expect(document.activeElement).toBe(url)
  })

  // Three buttons with the chosen one drawn in the accent.
  it("chooses how it signs in from a radio group", () => {
    render(<McpServerEditDialog server={null} open onClose={() => {}} onSaved={() => {}} />)
    const bearer = screen.getByRole("radio", { name: "Bearer token" })
    fireEvent.click(bearer)
    expect(bearer.getAttribute("aria-checked")).toBe("true")
    expect(screen.getByRole("radiogroup", { name: "How it signs in" })).toBeTruthy()
  })

  it("shows the tested tools as 4px chips, not pills", async () => {
    vi.mocked(testMcpServer).mockResolvedValue({ ok: true, tools: [{ name: "list_issues" }] } as never)
    render(<McpServerEditDialog server={saved as never} open onClose={() => {}} onSaved={() => {}} />)
    fireEvent.click(screen.getByRole("button", { name: /Test connection/ }))
    const chip = await screen.findByText("list_issues")
    expect(chip.closest("span")?.className).not.toMatch(/rounded-full/)
  })
})
