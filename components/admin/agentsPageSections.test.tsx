import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"

// Each list answers from here: [data, isLoading, isError].
const lists = vi.hoisted(() => ({
  agents: { data: { data: [] as unknown[] }, isLoading: false, isError: undefined as unknown },
  servers: { data: { data: [] as unknown[] }, isLoading: false, isError: undefined as unknown },
  catalog: { data: { data: [] as unknown[] }, isLoading: false, isError: undefined as unknown },
  sources: { data: { data: [] as unknown[] }, isLoading: false, isError: undefined as unknown },
}))
vi.mock("@/hooks/useFetch", () => ({
  useFetch: (url: string) => {
    const pick = url.includes("catalog")
      ? lists.catalog
      : url.includes("mcp")
        ? lists.servers
        : url.includes("data-source") || url.includes("datasource")
          ? lists.sources
          : /\/(overview|health|summary|outcomes)$/.test(url)
            ? { data: undefined, isLoading: false, isError: undefined }
            : lists.agents
    return { ...pick, mutate: vi.fn() }
  },
}))
vi.mock("@/hooks/useConfirm", () => ({ useConfirm: () => vi.fn() }))
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }), toast: vi.fn() }))
vi.mock("@/components/admin/AgentActiveWorkPanel", () => ({ default: () => null }))
vi.mock("@/components/admin/AgentActivityFeed", () => ({ default: () => null }))
vi.mock("@/components/marketplace/PublishTemplateDialog", () => ({ PublishTemplateDialog: () => null }))
vi.mock("@/components/admin/McpServerEditDialog", () => ({ McpServerEditDialog: () => null }))
vi.mock("@/components/admin/DataSourceEditDialog", () => ({ DataSourceEditDialog: () => null }))

import AgentsCard from "@/components/admin/AgentsCard"
import McpServersCard from "@/components/admin/McpServersCard"
import DataSourcesCard from "@/components/admin/DataSourcesCard"

afterEach(() => {
  cleanup()
  lists.agents = { data: { data: [] }, isLoading: false, isError: undefined }
  lists.servers = { data: { data: [] }, isLoading: false, isError: undefined }
  lists.catalog = { data: { data: [] }, isLoading: false, isError: undefined }
  lists.sources = { data: { data: [] }, isLoading: false, isError: undefined }
})

// Agents and skills stacked four bordered Cards under the page's h1, each with
// its own tile and title; the settings pages are flat sections, as every admin
// tab is.
describe("the sections of Agents and skills", () => {
  it.each([
    ["Agents", () => <AgentsCard />],
    ["MCP servers", () => <McpServersCard />],
    ["Data sources", () => <DataSourcesCard />],
  ])("draws %s as a flat section: an h2 with no tile, and no card around it", (name, ui) => {
    const { container } = render(ui())
    const root = container.firstElementChild as HTMLElement
    expect(root.tagName).toBe("SECTION")
    expect(root.className).not.toMatch(/\brounded-(xl|lg)\b.*\bborder\b|\bborder\b.*\brounded-(xl|lg)\b/)
    const h = screen.getByRole("heading", { level: 2, name })
    expect(h.querySelector("svg")).toBeNull()
  })

  it("draws MCP servers as a section of a section when it sits inside the Models section", () => {
    render(<McpServersCard embedded />)
    expect(screen.getByRole("heading", { level: 3, name: "MCP servers" })).toBeTruthy()
    expect(screen.queryByRole("heading", { level: 2 })).toBeNull()
  })

  it("puts its outline action on the title's row, at one height", () => {
    render(<McpServersCard />)
    const add = screen.getByRole("button", { name: /Add server/ })
    expect(add.closest("[data-section-action]")).toBeTruthy()
    expect(add.className).toContain("md:h-8")
    expect(add.className).not.toMatch(/\bbg-primary\b/)
  })

  it("leaves New agent to the page when the page holds it", () => {
    const open = vi.fn()
    render(<AgentsCard creating={false} onCreatingChange={open} />)
    expect(screen.queryByRole("button", { name: /New agent/ })).toBeNull()
  })

  it("loads each list in its own shape, and fails compactly with Try again", () => {
    lists.servers = { data: undefined as never, isLoading: true, isError: undefined }
    const { unmount } = render(<McpServersCard />)
    expect(screen.getByRole("status", { name: /Loading MCP servers/ }).hasAttribute("data-section-list-skeleton")).toBe(true)
    unmount()
    lists.sources = { data: undefined as never, isLoading: false, isError: { response: { status: 500, data: { msg: "The sources could not be read." } } } }
    const { container } = render(<DataSourcesCard />)
    expect(screen.getByText("The sources could not be read.")).toBeTruthy()
    expect(container.querySelector("[data-empty-illustration]")).toBeTruthy()
    expect(screen.getByRole("heading", { level: 2, name: "Data sources" })).toBeTruthy()
  })

  // "Google Drive" was cut to "Google Dri…" beside its category chip.
  it("lets a connector's name wrap rather than cut it", () => {
    lists.catalog = {
      data: { data: [{ slug: "gdrive", name: "Google Drive", category: "Knowledge & docs", description: "Files", docs_url: "https://x", installed: false }] },
      isLoading: false,
      isError: undefined,
    }
    render(<McpServersCard />)
    const name = screen.getByText("Google Drive")
    expect(name.className).not.toContain("truncate")
    fireEvent.click(screen.getByRole("button", { name: /Install/ }))
  })
})
