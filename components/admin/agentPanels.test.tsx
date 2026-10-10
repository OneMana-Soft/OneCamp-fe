import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"

vi.mock("@/services/agentService", async (orig) => ({
  ...(await orig<typeof import("@/services/agentService")>()),
  listAgentActivity: vi.fn(),
  listActiveAgentWork: vi.fn(),
}))
vi.mock("@/hooks/useAgentWorkEvents", () => ({ useAgentWorkEvents: () => {} }))
vi.mock("@/hooks/useStreamGapResync", () => ({ useStreamGapResync: () => {} }))
vi.mock("@/hooks/useResilientPolling", () => ({ useResilientPolling: () => {} }))
vi.mock("@/components/mqtt/mqttProvider", () => ({ useMqtt: () => ({ connectionState: { isConnected: true } }) }))
vi.mock("@/components/ai/AgentWorkRow", () => ({
  AgentWorkRow: ({ item }: { item: { title: string } }) => <li>{item.title}</li>,
  sortAgentWork: (items: unknown[]) => items,
}))

import AgentActivityFeed from "@/components/admin/AgentActivityFeed"
import AgentActiveWorkPanel from "@/components/admin/AgentActiveWorkPanel"
import { listActiveAgentWork, listAgentActivity } from "@/services/agentService"

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const run = { run_id: "r1", agent_name: "Standup bot", status: "failed", trigger_source: "schedule", started_at: new Date().toISOString(), summary: "", error: "Couldn't reach #standup", tools_used: [], action_count: 0 }

describe("recent agent activity", () => {
  it("puts its title icon on the AI group's tile, and says each run's state in words", async () => {
    vi.mocked(listAgentActivity).mockResolvedValue([run] as never)
    render(<AgentActivityFeed />)
    const heading = await screen.findByRole("heading", { name: "Recent agent activity" })
    expect(heading.parentElement?.querySelector(".hue-dusk")).toBeTruthy()
    expect(heading.parentElement?.querySelector(".text-primary")).toBeNull()
    // The dot was colour alone, with only a hover title.
    expect(screen.getByText("Failed")).toBeTruthy()
  })

  // A failed read hid the panel, as if no agent had run.
  it("says it couldn't load, with Try again", async () => {
    vi.mocked(listAgentActivity).mockRejectedValueOnce(new Error("Network Error"))
    render(<AgentActivityFeed />)
    expect(await screen.findByText(/Couldn't load recent agent activity/)).toBeTruthy()
    vi.mocked(listAgentActivity).mockResolvedValueOnce([run] as never)
    fireEvent.click(screen.getByRole("button", { name: "Try again" }))
    await waitFor(() => expect(screen.getByText("Standup bot")).toBeTruthy())
  })
})

describe("agent work in progress", () => {
  // A spinner glyph turned in the title even when nothing was loading.
  it("shows a still tile in the AI group's hue, not a spinner, once loaded", async () => {
    vi.mocked(listActiveAgentWork).mockResolvedValue([{ task_id: "t1", title: "Draft the notes", state: "working" }] as never)
    render(<AgentActiveWorkPanel />)
    const heading = await screen.findByRole("heading", { name: "In progress" })
    const header = heading.parentElement as HTMLElement
    expect(header.querySelector(".hue-dusk")).toBeTruthy()
    await waitFor(() => expect(header.querySelector(".animate-spin")).toBeNull())
  })
})
