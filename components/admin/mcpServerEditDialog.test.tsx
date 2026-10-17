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
import { createMcpServer, testMcpServer, updateMcpServer } from "@/services/mcpService"

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const saved = {
  id: "m1",
  name: "GitHub tools",
  url: "https://mcp.kestrel.example/github",
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
    // The house segmented control: the choice raised on the card colour with a
    // hairline, where this copy marked it with bg-background alone (1.03:1).
    // (app/interaction.css raises the chosen tab in a [data-segmented] well.)
    expect(bearer.closest("[data-segmented]")).not.toBeNull()
    expect(bearer.getAttribute("data-interactive")).toBe("tab")
  })

  it("shows the tested tools as 4px chips, not pills", async () => {
    vi.mocked(testMcpServer).mockResolvedValue({ ok: true, tools: [{ name: "list_issues" }] } as never)
    render(<McpServerEditDialog server={saved as never} open onClose={() => {}} onSaved={() => {}} />)
    fireEvent.click(screen.getByRole("button", { name: /Test connection/ }))
    const chip = await screen.findByText("list_issues")
    expect(chip.closest("span")?.className).not.toMatch(/rounded-full/)
  })

  // A stored token is bound to the address it was given for. Moving the
  // address, or how it is sent, without entering it again would carry an
  // admin's token anywhere: the field asks for it, and nothing is sent until
  // it is there.
  describe("a token kept for another address", () => {
    const openSaved = () => render(<McpServerEditDialog server={saved as never} open onClose={() => {}} onSaved={() => {}} />)
    const hint = "Enter the token again for the new address."

    it("is asked for again when the address moves to another host", async () => {
      openSaved()
      const token = screen.getByLabelText(/Token/)
      expect(screen.queryByText(hint)).toBeNull()
      fireEvent.change(screen.getByLabelText("Server address"), { target: { value: "https://elsewhere.example.net/github" } })
      expect(screen.getByText(hint)).toBeTruthy()
      expect(token.hasAttribute("required")).toBe(true)
      fireEvent.click(screen.getByRole("button", { name: "Save changes" }))
      await waitFor(() => expect(token.getAttribute("aria-invalid")).toBe("true"))
      expect(document.activeElement).toBe(token)
      expect(updateMcpServer).not.toHaveBeenCalled()

      vi.mocked(updateMcpServer).mockResolvedValue(saved as never)
      fireEvent.change(token, { target: { value: "new-token" } })
      fireEvent.click(screen.getByRole("button", { name: "Save changes" }))
      await waitFor(() => expect(updateMcpServer).toHaveBeenCalled())
      expect(vi.mocked(updateMcpServer).mock.calls[0][2]).toBe(true)
    })

    it("is asked for again when the token moves into a header", () => {
      openSaved()
      fireEvent.click(screen.getByRole("radio", { name: "Custom header" }))
      fireEvent.change(screen.getByLabelText("Header name"), { target: { value: "X-Api-Key" } })
      expect(screen.getByText(hint)).toBeTruthy()
    })

    it("is kept for another path on the same host", async () => {
      vi.mocked(updateMcpServer).mockResolvedValue(saved as never)
      openSaved()
      // The saved address's own host, on another path.
      fireEvent.change(screen.getByLabelText("Server address"), { target: { value: saved.url.replace("/github", "/v2/github") } })
      expect(screen.queryByText(hint)).toBeNull()
      fireEvent.click(screen.getByRole("button", { name: "Save changes" }))
      await waitFor(() => expect(updateMcpServer).toHaveBeenCalled())
      expect(vi.mocked(updateMcpServer).mock.calls[0][2]).toBe(false)
    })

    it("puts the server's refusal under the token, in its words", async () => {
      vi.mocked(updateMcpServer).mockRejectedValue({
        response: { status: 400, data: { code: "secret_reentry", msg: hint } },
      })
      openSaved()
      fireEvent.change(screen.getByLabelText("Name"), { target: { value: "GitHub" } })
      fireEvent.click(screen.getByRole("button", { name: "Save changes" }))
      const token = screen.getByLabelText(/Token/)
      await waitFor(() => expect(token.getAttribute("aria-invalid")).toBe("true"))
      expect(screen.getByText(hint)).toBeTruthy()
    })
  })
})
