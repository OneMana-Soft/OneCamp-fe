import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"

const fetchState = vi.hoisted(() => ({
  servers: { data: undefined as unknown, isLoading: false, isError: undefined as unknown, mutate: vi.fn() },
  catalog: { data: undefined as unknown, isLoading: false, isError: undefined as unknown, mutate: vi.fn() },
}))
vi.mock("@/hooks/useFetch", () => ({
  useFetch: (url: string) => (url.includes("catalog") ? fetchState.catalog : fetchState.servers),
}))
vi.mock("@/hooks/useConfirm", () => ({ useConfirm: () => vi.fn() }))
vi.mock("@/components/admin/McpServerEditDialog", () => ({ McpServerEditDialog: () => null }))

import McpServersCard from "@/components/admin/McpServersCard"

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const server = {
  id: "m1",
  name: "GitHub tools",
  url: "https://mcp.kestrel.studio/github",
  enabled: false,
  tools: [{ name: "list_issues" }, { name: "create_issue" }],
}

describe("MCP servers", () => {
  // The title icon was orange; the playful layer puts it on the AI group's
  // dusk tile, and the accent stays with the page's one primary action.
  it("puts the title icon on the AI group's tile, and adds a server from an outline button", () => {
    fetchState.servers = { data: { data: [server] }, isLoading: false, isError: undefined, mutate: vi.fn() }
    fetchState.catalog = { data: { data: [] }, isLoading: false, isError: undefined, mutate: vi.fn() }
    render(<McpServersCard />)
    expect(document.querySelector(".hue-dusk")).toBeTruthy()
    expect(document.querySelector("svg.text-primary")).toBeNull()
    expect(screen.getByRole("button", { name: /Add server/ }).className).not.toMatch(/\bbg-primary\b/)
  })

  it("names each server's switch and buttons for it, and shows a state as a word", () => {
    fetchState.servers = { data: { data: [server] }, isLoading: false, isError: undefined, mutate: vi.fn() }
    fetchState.catalog = { data: { data: [] }, isLoading: false, isError: undefined, mutate: vi.fn() }
    render(<McpServersCard />)
    expect(screen.getByRole("switch", { name: "Use GitHub tools" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Remove GitHub tools" })).toBeTruthy()
    expect(screen.getByText("Turned off")).toBeTruthy()
    expect(screen.getByText("2 tools")).toBeTruthy()
  })

  it("shows the plug spot when no server is connected", () => {
    fetchState.servers = { data: { data: [] }, isLoading: false, isError: undefined, mutate: vi.fn() }
    fetchState.catalog = { data: { data: [] }, isLoading: false, isError: undefined, mutate: vi.fn() }
    render(<McpServersCard />)
    expect(screen.getByText("No MCP servers yet")).toBeTruthy()
    expect(document.querySelector("[data-empty-illustration]")).toBeTruthy()
  })

  // A category is a thing with a colour of its own: tint and ink.
  it("shows a connector's category as a chip in its own hue", () => {
    fetchState.servers = { data: { data: [] }, isLoading: false, isError: undefined, mutate: vi.fn() }
    fetchState.catalog = {
      data: { data: [{ slug: "linear", name: "Linear", category: "Project tracking", description: "Issues", docs_url: "https://x", installed: false }] },
      isLoading: false,
      isError: undefined,
      mutate: vi.fn(),
    }
    render(<McpServersCard />)
    const chip = screen.getByText("Project tracking")
    expect(chip.className).toMatch(/\bhue-(sky|moss|sun|dusk|berry|lake)\b/)
    expect(chip.className).toMatch(/bg-hue-tint/)
  })
})
