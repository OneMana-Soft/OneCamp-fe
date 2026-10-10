import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen, within } from "@testing-library/react"
import { SWRConfig } from "swr"
import type { ReactNode } from "react"

import { AgentInventoryCard } from "@/components/admin/AgentInventoryCard"
import AIActivityCard, { AIActivityRow } from "@/components/admin/AIActivityCard"
import { getAgentInventory, type AgentInventory } from "@/services/agentService"

vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }), toast: vi.fn() }))
vi.mock("@/services/agentService", async (orig) => ({
  ...(await orig<typeof import("@/services/agentService")>()),
  getAgentInventory: vi.fn(),
}))
const get = vi.hoisted(() => vi.fn())
vi.mock("@/lib/axiosInstance", () => ({
  default: { get: (...a: unknown[]) => get(...a), post: vi.fn() },
  OWN_ERRORS: {},
}))

const fresh = ({ children }: { children: ReactNode }) => (
  <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0, shouldRetryOnError: false }}>{children}</SWRConfig>
)

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const empty = (): AgentInventory => ({ window_days: 7, agents: [], credentials: [] })

// The AI tab's sections loaded as a generic block of 40px rows that a bordered
// list of taller rows then replaced, stood empty as a bare sentence, and failed
// as a full-height error. Each now loads in its list's own shape, stands empty
// as the muted empty state on the group's tile, and fails compactly under its
// title.
describe("the agent inventory's states", () => {
  it("loads in its lists' own shape, under headings that are already there", () => {
    vi.mocked(getAgentInventory).mockReturnValue(new Promise(() => {}))
    render(<AgentInventoryCard />)
    expect(screen.getByRole("heading", { level: 3, name: /agents/i })).toBeTruthy()
    expect(screen.getByRole("heading", { level: 3, name: /credentials/i })).toBeTruthy()
    const skeletons = document.querySelectorAll("[data-section-list-skeleton]")
    expect(skeletons.length).toBe(2)
    expect(skeletons[0].className).toContain("rounded-lg border")
  })

  it("stands empty as the empty state on the AI group's tile, not a bare sentence", async () => {
    vi.mocked(getAgentInventory).mockResolvedValue(empty())
    render(<AgentInventoryCard />)
    const none = await screen.findByText("No agents yet")
    const block = none.closest("div.flex-col") as HTMLElement
    expect(block.querySelector("[data-empty-icon]")).toBeTruthy()
    expect(block.querySelector(".hue-dusk, [class*='hue-dusk']")).toBeTruthy()
    expect(screen.getByText("No live credentials")).toBeTruthy()
  })

  it("puts no tile beside one subsection's title and not the other's", async () => {
    vi.mocked(getAgentInventory).mockResolvedValue(empty())
    render(<AgentInventoryCard />)
    const h = await screen.findByRole("heading", { level: 3, name: /credentials/i })
    expect(h.querySelector("svg")).toBeNull()
  })

  it("fails compactly under its title, with Try again", async () => {
    vi.mocked(getAgentInventory).mockRejectedValue({ response: { status: 503, data: { msg: "Inventory is unavailable." } } })
    const { container } = render(<AgentInventoryCard />)
    expect(await screen.findByText("Couldn't load the agent inventory")).toBeTruthy()
    expect(screen.getByText("Inventory is unavailable.")).toBeTruthy()
    expect(container.querySelector("[data-empty-illustration]")).toBeTruthy()
    expect(screen.getByRole("heading", { level: 2, name: "Agent inventory" })).toBeTruthy()
  })
})

describe("the AI activity's states", () => {
  it("loads in its list's own shape", () => {
    get.mockReturnValue(new Promise(() => {}))
    render(<AIActivityCard />, { wrapper: fresh })
    const sk = screen.getByRole("status", { name: "Loading the AI activity" })
    expect(sk.hasAttribute("data-section-list-skeleton")).toBe(true)
  })

  it("stands empty as the empty state on the AI group's tile", async () => {
    get.mockResolvedValue({ data: { data: [] } })
    render(<AIActivityCard />, { wrapper: fresh })
    const none = await screen.findByText("No AI activity yet")
    const block = none.closest("div.flex-col") as HTMLElement
    expect(block.querySelector("[data-empty-icon]")).toBeTruthy()
  })

  it("fails compactly under its title", async () => {
    get.mockRejectedValue({ response: { status: 500, data: { msg: "The feed could not be read." } } })
    const { container } = render(<AIActivityCard />, { wrapper: fresh })
    expect(await screen.findByText("Couldn't load the AI activity")).toBeTruthy()
    expect(container.querySelector("[data-empty-illustration]")).toBeTruthy()
  })

  // Muted at 70% opacity and 11px, a row's who and when fell under AA.
  it("says who and when at the help size in the muted ink, never faded", () => {
    render(
      <ul>
        <AIActivityRow item={{ kind: "agent_run", title: "Release Captain", summary: "Posted the notes", status: "succeeded", actor: "priya@kestrel.example", at: new Date().toISOString() }} />
      </ul>,
    )
    const who = screen.getByText("priya@kestrel.example")
    const line = who.parentElement as HTMLElement
    expect(line.className).toContain("text-xs")
    expect(line.className).not.toMatch(/text-muted-foreground\/\d+/)
    expect(line.className).not.toContain("text-2xs")
    const row = who.closest("li") as HTMLElement
    expect(within(row).getByText("succeeded").className).toContain("text-xs")
  })
})
