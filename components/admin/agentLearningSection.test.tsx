import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"

const toastSpy = vi.hoisted(() => vi.fn())
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: toastSpy }), toast: toastSpy }))
vi.mock("@/services/agentService", async (orig) => ({
  ...(await orig<typeof import("@/services/agentService")>()),
  reviewAgentLearning: vi.fn(),
  createEvalScenario: vi.fn(),
}))

import { AgentLearningSection } from "@/components/admin/AgentLearningSection"
import { createEvalScenario, reviewAgentLearning } from "@/services/agentService"

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const review = {
  runs_considered: 12,
  runs_without_prompt: 0,
  scenario_proposals: [
    { run_id: "r1", name: "Blocker becomes a task", why: "It answered but opened no task", prompt: "I'm blocked", expectations: {}, ran_at: "2026-10-08T09:00:00Z" },
  ],
  failure_patterns: [{ kind: "tool", subject: "create_task", count: 1, suggestion: "Give it the projects it may write to." }],
}

describe("what an agent's history suggests", () => {
  // A failed read left nothing to show, and the copy for that is "Nothing to
  // suggest from the last 0 runs. That means they went well."
  it("says the history could not be read instead of claiming the runs went well", async () => {
    vi.mocked(reviewAgentLearning).mockRejectedValueOnce(new Error("Network Error"))
    render(<AgentLearningSection agentId="a1" />)
    expect(await screen.findByText(/Couldn't read this agent's recent runs/)).toBeTruthy()
    expect(screen.queryByText(/went well/)).toBeNull()
    vi.mocked(reviewAgentLearning).mockResolvedValueOnce(review as never)
    fireEvent.click(screen.getByRole("button", { name: "Try again" }))
    expect(await screen.findByText("It answered but opened no task")).toBeTruthy()
  })

  // Every suggestion had a filled orange button beside the dialog's Save.
  it("adds a suggestion as a test from an outline button, under sentence-case labels", async () => {
    vi.mocked(reviewAgentLearning).mockResolvedValue(review as never)
    render(<AgentLearningSection agentId="a1" />)
    const add = await screen.findByRole("button", { name: /Add as a test/ })
    expect(add.className).not.toMatch(/\bbg-primary\b/)
    expect(document.body.innerHTML).not.toMatch(/\buppercase\b/)
    expect(screen.getByText("1 run")).toBeTruthy()
  })

  it("says why a suggestion couldn't be added, in the server's words", async () => {
    vi.mocked(reviewAgentLearning).mockResolvedValue(review as never)
    vi.mocked(createEvalScenario).mockRejectedValueOnce({ response: { data: { msg: "A test with that name exists." } } })
    render(<AgentLearningSection agentId="a1" />)
    fireEvent.click(await screen.findByRole("button", { name: /Add as a test/ }))
    await waitFor(() =>
      expect(toastSpy).toHaveBeenCalledWith(expect.objectContaining({ title: "Couldn't add the test", description: "A test with that name exists." })),
    )
  })
})
