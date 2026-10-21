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
vi.mock("@/components/mqtt/mqttContext", async (orig) => ({ ...(await orig<object>()), useMqtt: () => ({ connectionState: { isConnected: true } }) }))
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
  // Design v3 (admin §A23): the audit log's row anatomy (time, the agent's
  // square, the sentence), the state as a glyph and a word, tools as neutral
  // chips; no tinted tile on the title.
  it("draws each run in the audit row anatomy, and says its state in words", async () => {
    vi.mocked(listAgentActivity).mockResolvedValue([{ ...run, tools_used: ["post_message"] }] as never)
    const { container } = render(<AgentActivityFeed />)
    const heading = await screen.findByRole("heading", { name: "Recent agent activity" })
    expect(heading.parentElement?.querySelector("[class*='hue-']")).toBeNull()
    expect(heading.parentElement?.querySelector(".text-primary")).toBeNull()
    const row = container.querySelector("[data-activity-row]") as HTMLElement
    expect(row.className).toContain("ai-row")
    expect(row.querySelector(".ai-row-actor [data-agent-avatar]")).toBeTruthy()
    expect(row.querySelector(".ai-chip")?.textContent).toBe("post message")
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
  // Design v3 (admin §A15): a card of rows, each led by the agent's square and
  // a 2px live bar that breathes while the run is going. The title sat on a
  // tinted tile with a spinner that turned whenever it refreshed.
  it("leads each row with the agent's square and a live bar, and no tinted tile", async () => {
    vi.mocked(listActiveAgentWork).mockResolvedValue([{ task_id: "t1", agent_name: "Release Captain", title: "Draft the notes", state: "working" }] as never)
    const { container } = render(<AgentActiveWorkPanel title="Working now" />)
    const heading = await screen.findByRole("heading", { name: "Working now" })
    expect(heading.parentElement?.querySelector("[class*='hue-']")).toBeNull()
    const row = container.querySelector("[data-live-row]") as HTMLElement
    expect(row.dataset.live).toBe("true")
    expect(row.querySelector("[data-live-bar]")).toBeTruthy()
    expect(row.querySelector("[data-agent-avatar]")).toBeTruthy()
  })
})
