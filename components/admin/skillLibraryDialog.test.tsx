import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"

const toastSpy = vi.hoisted(() => vi.fn())
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: toastSpy }), toast: toastSpy }))
vi.mock("@/services/agentService", async (orig) => ({
  ...(await orig<typeof import("@/services/agentService")>()),
  listAgentSkills: vi.fn(),
  updateAgentSkill: vi.fn(),
  deleteAgentSkill: vi.fn(),
  listAgentSkillRevisions: vi.fn(),
  revertAgentSkill: vi.fn(),
}))

import { SkillLibraryDialog } from "@/components/admin/SkillLibraryDialog"
import { listAgentSkillRevisions, listAgentSkills, updateAgentSkill } from "@/services/agentService"

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const skill = { id: "k1", name: "Status updates", instructions: "Write in three lines.", agent_count: 2 }

describe("the skill library", () => {
  // A failed read said "No skills yet."
  it("says the skills could not be loaded, with Try again", async () => {
    vi.mocked(listAgentSkills).mockRejectedValueOnce(new Error("Network Error"))
    render(<SkillLibraryDialog open onClose={() => {}} />)
    expect(await screen.findByText(/Couldn't load the skills/)).toBeTruthy()
    expect(screen.queryByText("No skills yet.")).toBeNull()
    vi.mocked(listAgentSkills).mockResolvedValueOnce([skill] as never)
    fireEvent.click(screen.getByRole("button", { name: "Try again" }))
    expect(await screen.findByText("Status updates")).toBeTruthy()
  })

  it("ties each field to its label, and says why a save failed in the server's words", async () => {
    vi.mocked(listAgentSkills).mockResolvedValue([skill] as never)
    vi.mocked(updateAgentSkill).mockRejectedValueOnce({ response: { data: { msg: "That name is taken." } } })
    render(<SkillLibraryDialog open onClose={() => {}} />)
    fireEvent.click(await screen.findByText("Status updates"))
    const name = screen.getByLabelText("Name")
    expect(screen.getByLabelText("Instructions")).toBeTruthy()
    expect(screen.getByLabelText(/Why/)).toBeTruthy()
    fireEvent.change(name, { target: { value: "Status notes" } })
    fireEvent.click(screen.getByRole("button", { name: "Save" }))
    await waitFor(() =>
      expect(toastSpy).toHaveBeenCalledWith(expect.objectContaining({ title: "Couldn't save the skill", description: "That name is taken." })),
    )
  })

  // A failed read of the history said "No history yet", and the restore
  // button had a tooltip but no name.
  it("says the history could not be loaded, and names each restore button", async () => {
    vi.mocked(listAgentSkills).mockResolvedValue([skill] as never)
    vi.mocked(listAgentSkillRevisions).mockRejectedValueOnce(new Error("Network Error"))
    render(<SkillLibraryDialog open onClose={() => {}} />)
    fireEvent.click(await screen.findByText("Status updates"))
    fireEvent.click(screen.getByRole("button", { name: /History/ }))
    expect(await screen.findByText(/Couldn't load the history/)).toBeTruthy()
    expect(screen.queryByText("No history yet.")).toBeNull()

    vi.mocked(listAgentSkillRevisions).mockResolvedValueOnce([
      { id: "v2", instructions: "Write in three lines.", created_at: "2026-10-09T10:00:00Z" },
      { id: "v1", instructions: "Write in five lines.", created_at: "2026-10-02T10:00:00Z" },
    ] as never)
    fireEvent.click(screen.getByRole("button", { name: "Try again" }))
    expect(await screen.findByRole("button", { name: /Restore the version from 2 Oct/ })).toBeTruthy()
  })
})
