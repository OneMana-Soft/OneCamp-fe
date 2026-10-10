import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"

vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }), toast: vi.fn() }))
vi.mock("@/hooks/useConfirm", () => ({ useConfirm: () => vi.fn() }))
vi.mock("@/components/ai/MarkdownMessage", () => ({ default: () => null }))
vi.mock("@/services/agentService", async (orig) => ({
  ...(await orig<typeof import("@/services/agentService")>()),
  listAgentRuns: vi.fn(),
  getAgentStats: vi.fn(),
  listAgentRoutines: vi.fn().mockResolvedValue([]),
  listAgentSkills: vi.fn().mockResolvedValue([]),
}))

import { AgentRunsDialog } from "@/components/admin/AgentRunsDialog"
import { getAgentStats, listAgentRuns } from "@/services/agentService"

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const stats = {
  total_runs: 25, succeeded: 24, failed: 1, stopped: 0, running: 0, avg_steps: 4.2,
  total_tokens: 120000, last_7d_tokens: 30000, avg_duration_ms: 12000, last_7d_runs: 6,
}

describe("an agent's run history", () => {
  // A failed read set the runs to none: "No runs yet", about an agent that
  // may have run every day.
  it("says the runs could not be loaded, with Try again", async () => {
    vi.mocked(listAgentRuns).mockRejectedValueOnce(new Error("Network Error"))
    vi.mocked(getAgentStats).mockResolvedValue(stats as never)
    render(<AgentRunsDialog agentId="a1" agentName="Standup bot" open onClose={() => {}} />)
    expect(await screen.findByText(/Couldn't load the runs/)).toBeTruthy()
    expect(screen.queryByText("No runs yet")).toBeNull()
    vi.mocked(listAgentRuns).mockResolvedValueOnce([] as never)
    fireEvent.click(screen.getByRole("button", { name: "Try again" }))
    await waitFor(() => expect(screen.getByText("No runs yet")).toBeTruthy())
  })

  it("puts its title icon on the AI group's tile, and says its numbers in words, not uppercase tiles", async () => {
    vi.mocked(listAgentRuns).mockResolvedValue([] as never)
    vi.mocked(getAgentStats).mockResolvedValue(stats as never)
    render(<AgentRunsDialog agentId="a1" agentName="Standup bot" open onClose={() => {}} />)
    const title = await screen.findByRole("heading", { name: /Runs of Standup bot/ })
    expect(title.querySelector(".hue-dusk")).toBeTruthy()
    expect(title.querySelector(".text-primary")).toBeNull()
    expect(await screen.findByText(/96% finished without an error/)).toBeTruthy()
    expect(document.body.innerHTML).not.toMatch(/\buppercase\b/)
  })
})
