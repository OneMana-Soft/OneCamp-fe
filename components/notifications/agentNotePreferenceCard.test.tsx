import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"

// The daily note's switch. When its setting can't be read, the section says so
// and offers to try again: it used to vanish, so the person never learned the
// setting existed. A switch that fails to save says why and goes back.

const { getEnabled, setEnabled, toast } = vi.hoisted(() => ({ getEnabled: vi.fn(), setEnabled: vi.fn(), toast: vi.fn() }))
vi.mock("@/services/agentNoteService", () => ({ getAgentNoteEnabled: getEnabled, setAgentNoteEnabled: setEnabled }))
vi.mock("@/hooks/useClientConfig", () => ({ useAIAvailable: () => true }))
vi.mock("@/hooks/use-toast", () => ({ toast, useToast: () => ({ toast }) }))

import { AgentNotePreferenceCard } from "./AgentNotePreferenceCard"

beforeEach(() => {
  getEnabled.mockReset()
  setEnabled.mockReset()
  toast.mockReset()
})
afterEach(cleanup)

describe("the daily note setting", () => {
  it("says it couldn't be read and offers to try again", async () => {
    getEnabled.mockRejectedValueOnce(new Error("Network Error")).mockResolvedValueOnce(true)
    render(<AgentNotePreferenceCard />)
    expect(await screen.findByText("Couldn't load the daily note setting")).toBeInTheDocument()
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: /try again/i })))
    await waitFor(() => expect(screen.getByRole("switch", { name: "Send me the daily note" })).toHaveAttribute("aria-checked", "true"))
  })

  it("holds its place while it loads", () => {
    getEnabled.mockReturnValue(new Promise(() => {}))
    render(<AgentNotePreferenceCard />)
    expect(screen.getByRole("status", { name: "Loading the daily note setting" })).toBeInTheDocument()
  })

  it("says why a switch didn't save, and puts it back", async () => {
    getEnabled.mockResolvedValue(true)
    setEnabled.mockRejectedValue({ response: { status: 500, data: { msg: "Couldn't reach the AI service." } } })
    render(<AgentNotePreferenceCard />)
    const sw = await screen.findByRole("switch", { name: "Send me the daily note" })
    await act(async () => void fireEvent.click(sw))
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Couldn't turn the daily note off", description: "Couldn't reach the AI service.", variant: "destructive" }),
    )
    expect(screen.getByRole("switch", { name: "Send me the daily note" })).toHaveAttribute("aria-checked", "true")
  })
})
