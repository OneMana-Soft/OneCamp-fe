import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"

const toastSpy = vi.hoisted(() => vi.fn())
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: toastSpy }), toast: toastSpy }))
vi.mock("@/hooks/useConfirm", () => ({ useConfirm: () => vi.fn() }))
vi.mock("@/services/agentService", async (orig) => ({
  ...(await orig<typeof import("@/services/agentService")>()),
  listEvalScenarios: vi.fn(),
  createEvalScenario: vi.fn(),
  runEvalScenario: vi.fn(),
  runEvalSuite: vi.fn(),
  deleteEvalScenario: vi.fn(),
}))

import { AgentEvalSection } from "@/components/admin/AgentEvalSection"
import { createEvalScenario, listEvalScenarios, runEvalScenario } from "@/services/agentService"

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const scenario = { id: "s1", name: "Opens a task for a blocker", prompt: "Standup: I'm blocked on the API key", expectations: "{}", is_active: true }

describe("an agent's saved tests", () => {
  // The four fields had only placeholders, which vanish as you type.
  it("labels every field of a new test", async () => {
    vi.mocked(listEvalScenarios).mockResolvedValue([])
    render(<AgentEvalSection agentId="a1" />)
    expect(await screen.findByLabelText("Test name")).toBeTruthy()
    expect(screen.getByLabelText("Prompt")).toBeTruthy()
    expect(screen.getByLabelText(/Answer must mention/)).toBeTruthy()
    expect(screen.getByLabelText(/Tools it should use/)).toBeTruthy()
  })

  // "Name and prompt are required" was a toast tied to neither field.
  it("says a missing name under it, puts the cursor there, and adds from an outline button", async () => {
    vi.mocked(listEvalScenarios).mockResolvedValue([])
    render(<AgentEvalSection agentId="a1" />)
    const add = await screen.findByRole("button", { name: /Add test/ })
    expect(add.className).not.toMatch(/\bbg-primary\b/)
    fireEvent.click(add)
    const name = screen.getByLabelText("Test name")
    await waitFor(() => expect(name.getAttribute("aria-invalid")).toBe("true"))
    expect(document.activeElement).toBe(name)
    expect(toastSpy).not.toHaveBeenCalled()
    expect(createEvalScenario).not.toHaveBeenCalled()
  })

  // A failed read showed "No saved tests yet", about tests that exist.
  it("says the tests could not be loaded, with Try again", async () => {
    vi.mocked(listEvalScenarios).mockRejectedValueOnce(new Error("Network Error"))
    render(<AgentEvalSection agentId="a1" />)
    expect(await screen.findByText(/Couldn't load the saved tests/)).toBeTruthy()
    expect(screen.queryByText(/No saved tests yet/)).toBeNull()
    vi.mocked(listEvalScenarios).mockResolvedValueOnce([scenario] as never)
    fireEvent.click(screen.getByRole("button", { name: "Try again" }))
    expect(await screen.findByText("Opens a task for a blocker")).toBeTruthy()
  })

  it("says why a test couldn't run, in the server's words", async () => {
    vi.mocked(listEvalScenarios).mockResolvedValue([scenario] as never)
    vi.mocked(runEvalScenario).mockRejectedValueOnce({ response: { data: { msg: "The agent is paused." } } })
    render(<AgentEvalSection agentId="a1" />)
    fireEvent.click(await screen.findByRole("button", { name: /Run Opens a task for a blocker/ }))
    await waitFor(() =>
      expect(toastSpy).toHaveBeenCalledWith(expect.objectContaining({ title: "Couldn't run the test", description: "The agent is paused." })),
    )
  })
})
