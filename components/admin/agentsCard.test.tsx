import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

const responses = vi.hoisted(() => ({ agents: undefined as unknown, overview: undefined as unknown }))
vi.mock("@/hooks/useFetch", () => ({
  useFetch: (url: string) => {
    if (url.endsWith("/overview")) return { data: responses.overview, isLoading: false, isError: undefined, mutate: vi.fn() }
    if (/\/(health|summary|outcomes)$/.test(url)) return { data: { data: {} }, isLoading: false, isError: undefined, mutate: vi.fn() }
    return { data: responses.agents, isLoading: false, isError: undefined, mutate: vi.fn() }
  },
}))
vi.mock("@/hooks/useConfirm", () => ({ useConfirm: () => vi.fn() }))
vi.mock("@/components/admin/AgentActiveWorkPanel", () => ({ default: () => null }))
vi.mock("@/components/admin/AgentActivityFeed", () => ({ default: () => null }))
vi.mock("@/components/marketplace/PublishTemplateDialog", () => ({ PublishTemplateDialog: () => null }))

import AgentsCard from "@/components/admin/AgentsCard"

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const agent = {
  id: "a1",
  name: "Standup bot",
  description: "",
  instructions: "",
  trigger_type: "schedule",
  is_active: false,
  run_count: 3,
  enabled_tools: "[]",
  created_by_name: "Priya Raman",
}

describe("agents", () => {
  // The edit dialog (1,400 lines) and the run history (700) were downloaded
  // with the list, before anyone opened either.
  it("loads its dialogs only when they are opened", () => {
    const src = readFileSync(resolve(__dirname, "AgentsCard.tsx"), "utf8")
    expect(src).not.toMatch(/^import[^\n]*from "\.\/AgentEditDialog"/m)
    expect(src).not.toMatch(/^import[^\n]*from "\.\/AgentRunsDialog"/m)
  })

  // A flat section now, as every settings page and admin tab is: the title is
  // an h2 with no tile (the settings index carries the section's tile), and
  // nothing in it is orange but its one action.
  it("is titled 'Agents' as a section, with no tile and no orange icon", () => {
    responses.agents = { data: [agent] }
    responses.overview = undefined
    render(<AgentsCard />)
    const title = screen.getByRole("heading", { level: 2, name: "Agents" })
    expect(title.querySelector("svg")).toBeNull()
    expect(document.querySelector("svg.text-primary")).toBeNull()
  })

  // Six tiles with uppercase labels, three of them often "—", for what is one sentence.
  it("says the fleet's numbers as one sentence, not uppercase tiles", () => {
    responses.agents = { data: [agent] }
    responses.overview = {
      data: { active_agents: 2, total_agents: 3, total_runs: 40, succeeded: 36, failed: 2, stopped: 2, last_7d_tokens: 120000, last_7d_runs: 12 },
    }
    render(<AgentsCard />)
    expect(screen.getByText(/2 of 3 agents running/)).toBeTruthy()
    expect(screen.getByText(/90% finished without an error/)).toBeTruthy()
    expect(document.body.innerHTML).not.toMatch(/\buppercase\b/)
    expect(document.body.textContent).not.toMatch(/—/)
  })

  // Agents are cards since design v3 (admin §S5): the switch in the sunken
  // footer says "Can act", Open edits, and the rarer actions (history, save as
  // a template, delete) wait in the card's ⋯ menu.
  it("names each agent's switch and buttons for it", () => {
    responses.agents = { data: [agent] }
    responses.overview = undefined
    render(<AgentsCard />)
    expect(screen.getByRole("switch", { name: "Standup bot can act" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Open Standup bot" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "More for Standup bot" })).toBeTruthy()
    expect(screen.getByText("Paused")).toBeTruthy()
  })

  it("draws agents as cards in a two-column grid: square, name and tag, job, meta, footer", () => {
    responses.agents = { data: [{ ...agent, description: "Posts the morning standup in #engineering." }] }
    responses.overview = undefined
    const { container } = render(<AgentsCard />)
    const grid = container.querySelector("[data-agent-grid]") as HTMLElement
    expect(grid.className).toContain("md:grid-cols-2")
    const card = grid.querySelector("[data-agent-card]") as HTMLElement
    expect(card.className).toContain("agent-card")
    expect(card.querySelector("[data-agent-square] [data-agent-avatar]")).toBeTruthy()
    expect(card.querySelector("[data-principal-tag='ai']")?.textContent).toContain("Agent")
    expect(card.querySelector("[data-agent-job]")?.className).toContain("line-clamp-2")
    expect(card.querySelector("[data-agent-meta]")?.className).toContain("tabular-nums")
    expect(card.querySelector(".agent-card-foot")?.textContent).toContain("Can act")
  })

  it("puts the empty state on the AI group's tile, with New agent in the card as well as the header", () => {
    // Critic, 11 Oct (#31): the empty card said what an agent could be and
    // left the reader to find New agent above it. The card offers it too, as
    // a secondary: the header's stays the one primary.
    responses.agents = { data: [] }
    responses.overview = undefined
    render(<AgentsCard />)
    expect(screen.getByText("No agents yet")).toBeTruthy()
    const buttons = screen.getAllByRole("button", { name: /New agent/ })
    expect(buttons).toHaveLength(2)
    const inCard = buttons.find((b) => b.closest(".set-card")) as HTMLElement
    expect(inCard.className).toContain("bg-raised")
    expect(inCard.className).not.toContain("bg-brand")
  })
})
