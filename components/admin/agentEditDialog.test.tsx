import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"

vi.mock("@/hooks/useFetch", () => ({ useFetch: () => ({ data: undefined, isLoading: false, isError: undefined, mutate: vi.fn() }) }))
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }), toast: vi.fn() }))
vi.mock("@/components/admin/SkillLibraryDialog", () => ({ SkillLibraryDialog: () => null }))
vi.mock("@/components/ai/MarkdownMessage", () => ({ default: () => null }))
vi.mock("@/components/admin/AgentEvalSection", () => ({ AgentEvalSection: () => null }))
vi.mock("@/components/admin/AgentLearningSection", () => ({ AgentLearningSection: () => null }))
vi.mock("@/components/admin/A2ACardSummary", () => ({ A2ACardSummary: () => null }))
vi.mock("@/components/task/TaskMoveFilterFields", () => ({ TaskMoveFilterFields: () => null, ANY_MOVE: {} }))
vi.mock("@/services/agentService", async (orig) => ({
  ...(await orig<typeof import("@/services/agentService")>()),
  createAgent: vi.fn(),
  updateAgent: vi.fn(),
  runAgent: vi.fn(),
  listAgentSkills: vi.fn().mockResolvedValue([]),
}))

import { AgentEditDialog } from "@/components/admin/AgentEditDialog"
import { createAgent } from "@/services/agentService"

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe("the agent editor", () => {
  it("puts its title icon on the AI group's tile, not in the accent", () => {
    render(<AgentEditDialog agent={null} open onClose={() => {}} onSaved={() => {}} />)
    const title = screen.getByRole("heading", { name: "New agent" })
    expect(title.querySelector(".hue-dusk")).toBeTruthy()
    expect(title.querySelector(".text-primary")).toBeNull()
  })

  // A missing name was one red line at the very foot of a long dialog.
  it("says a missing name under the name, and puts the cursor there", async () => {
    render(<AgentEditDialog agent={null} open onClose={() => {}} onSaved={() => {}} />)
    fireEvent.click(screen.getByRole("button", { name: /Create agent/ }))
    const name = screen.getByLabelText("Name")
    await waitFor(() => expect(name.getAttribute("aria-invalid")).toBe("true"))
    expect(document.activeElement).toBe(name)
    expect(createAgent).not.toHaveBeenCalled()
  })

  it("says missing instructions under them, and puts the cursor there", async () => {
    render(<AgentEditDialog agent={null} open onClose={() => {}} onSaved={() => {}} />)
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Standup bot" } })
    fireEvent.click(screen.getByRole("button", { name: /Create agent/ }))
    const instr = screen.getByLabelText("Instructions")
    await waitFor(() => expect(instr.getAttribute("aria-invalid")).toBe("true"))
    expect(document.activeElement).toBe(instr)
  })

  // Tool chips were pills with no pressed state; group labels shouted.
  it("draws tool choices as 4px chips with a pressed state, under sentence-case labels", () => {
    render(<AgentEditDialog agent={null} open onClose={() => {}} onSaved={() => {}} />)
    const chips = Array.from(document.querySelectorAll("button[aria-pressed]"))
    expect(chips.length).toBeGreaterThan(0)
    for (const chip of chips) expect(chip.className).not.toMatch(/\brounded-full\b/)
    expect(document.body.innerHTML).not.toMatch(/\buppercase\b/)
  })

  it("chooses the trigger from a radio group", () => {
    render(<AgentEditDialog agent={null} open onClose={() => {}} onSaved={() => {}} />)
    const group = screen.getByRole("radiogroup", { name: "Trigger" })
    const radios = Array.from(group.querySelectorAll('[role="radio"]'))
    expect(radios.length).toBeGreaterThan(1)
    expect(radios.some((r) => r.getAttribute("aria-checked") === "true")).toBe(true)
  })
})
