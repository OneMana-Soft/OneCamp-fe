import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"

vi.mock("@/services/aiModelService", async (orig) => ({
  ...(await orig<typeof import("@/services/aiModelService")>()),
  getAIMCPServer: vi.fn(),
  setAIMCPServer: vi.fn().mockResolvedValue(undefined),
}))
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }), toast: vi.fn() }))

import MCPServerCard from "@/components/admin/MCPServerCard"
import { getAIMCPServer, setAIMCPServer } from "@/services/aiModelService"

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const closed = { enabled: false, tool_groups: "", available_groups: ["tasks", "docs"] }

describe("external agent access", () => {
  // A failed read showed the switch as off, which an admin reads as "the door
  // is closed", and left Save disabled for good.
  it("says the setting could not be loaded instead of showing it as off", async () => {
    vi.mocked(getAIMCPServer).mockRejectedValueOnce(new Error("Network Error"))
    render(<MCPServerCard />)
    expect(await screen.findByText(/Couldn't load the external agent access setting/)).toBeTruthy()
    expect(screen.queryByRole("switch")).toBeNull()
    vi.mocked(getAIMCPServer).mockResolvedValueOnce(closed as never)
    fireEvent.click(screen.getByRole("button", { name: "Try again" }))
    expect(await screen.findByRole("switch", { name: /Allow external agents to connect/ })).toBeTruthy()
  })

  // The Save sat at the foot of a long card, disabled, with nothing to say a
  // change was waiting for it.
  it("holds a change in the save bar, and saves both values together from it", async () => {
    vi.mocked(getAIMCPServer).mockResolvedValue(closed as never)
    render(<MCPServerCard />)
    fireEvent.click(await screen.findByRole("switch", { name: /Allow external agents to connect/ }))
    fireEvent.click(screen.getByRole("checkbox", { name: "Tasks" }))
    const bar = await screen.findByRole("region", { name: "Unsaved changes" })
    fireEvent.click(bar.querySelector("button:last-child") as HTMLElement)
    await waitFor(() => expect(setAIMCPServer).toHaveBeenCalledWith(true, "tasks"))
  })

  it("says on or off as a dot and a word, and points to Settings, API tokens in words", async () => {
    const base = process.env.NEXT_PUBLIC_BACKEND_URL
    process.env.NEXT_PUBLIC_BACKEND_URL = "https://api.example.com/"
    try {
      vi.mocked(getAIMCPServer).mockResolvedValue({ ...closed, enabled: true, tool_groups: "tasks" } as never)
      render(<MCPServerCard />)
      const on = await screen.findByText("On")
      expect(on.className).not.toMatch(/bg-success/)
      fireEvent.mouseDown(screen.getByRole("tab", { name: "Scripts & other clients" }))
      expect(await screen.findByText(/Settings, API tokens/)).toBeTruthy()
      expect(document.body.textContent).not.toMatch(/→/)
    } finally {
      process.env.NEXT_PUBLIC_BACKEND_URL = base
    }
  })

  it("loads in its list's shape and fails compactly with the server's reason", async () => {
    vi.mocked(getAIMCPServer).mockReturnValue(new Promise(() => {}))
    const { unmount } = render(<MCPServerCard />)
    expect(screen.getByRole("status", { name: /Loading/ }).hasAttribute("data-section-list-skeleton")).toBe(true)
    unmount()
    vi.mocked(getAIMCPServer).mockRejectedValue({ response: { status: 403, data: { msg: "Only admins can read this." } } })
    const { container } = render(<MCPServerCard />)
    expect(await screen.findByText("Only admins can read this.")).toBeTruthy()
    expect(container.querySelector("[data-empty-illustration]")).toBeTruthy()
  })

  // "Everything" sat in a bordered box beside unboxed checkboxes for the same
  // job, and "Connecting an agent" was a box holding more boxes.
  it("draws every group choice the same way, and the how-to as a section, not a box", async () => {
    const base = process.env.NEXT_PUBLIC_BACKEND_URL
    process.env.NEXT_PUBLIC_BACKEND_URL = "https://api.example.com/"
    try {
      vi.mocked(getAIMCPServer).mockResolvedValue({ ...closed, enabled: true, tool_groups: "tasks" } as never)
      render(<MCPServerCard />)
      const everything = await screen.findByRole("checkbox", { name: "Everything" })
      expect(everything.closest(".rounded-md.border")).toBeNull()
      const how = screen.getByRole("heading", { level: 3, name: "Connecting an agent" })
      expect(how.closest("section")?.className ?? "").not.toMatch(/rounded-lg|border/)
    } finally {
      process.env.NEXT_PUBLIC_BACKEND_URL = base
    }
  })

  // Every client's tab was numbered steps except this one, which opened with a
  // code block, then prose, then a second block.
  it("gives scripts and other clients the same numbered steps as every other tab", async () => {
    const base = process.env.NEXT_PUBLIC_BACKEND_URL
    process.env.NEXT_PUBLIC_BACKEND_URL = "https://api.example.com/"
    try {
      vi.mocked(getAIMCPServer).mockResolvedValue({ ...closed, enabled: true, tool_groups: "tasks" } as never)
      render(<MCPServerCard />)
      fireEvent.mouseDown(await screen.findByRole("tab", { name: "Scripts & other clients" }))
      const panel = await screen.findByRole("tabpanel")
      const first = panel.firstElementChild as HTMLElement
      expect(first.tagName).toBe("OL")
      expect(first.className).toContain("list-decimal")
      expect(first.querySelectorAll(":scope > li").length).toBeGreaterThanOrEqual(3)
    } finally {
      process.env.NEXT_PUBLIC_BACKEND_URL = base
    }
  })
})
