import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"

// A channel's AI teammates and AI settings said "Couldn't update · Please try
// again." over the request's own error toast (QA F-35). Each says what didn't
// happen and why, once: its request leaves the saying to it.

const { toasted, setTeammate, setBudget } = vi.hoisted(() => ({
  toasted: vi.fn(),
  setTeammate: vi.fn(),
  setBudget: vi.fn(),
}))
vi.mock("@/hooks/use-toast", () => ({ toast: toasted, useToast: () => ({ toast: toasted }) }))
vi.mock("@/services/agentService", () => ({
  getChannelAITeammates: async () => [{ id: "a1", name: "Vella Agent", in_channel: false, global: false }],
  setChannelAITeammate: setTeammate,
  getChannelAIBudget: async () => ({ max_daily_tokens: 0, used_today: 0, ai_model_id: "" }),
  setChannelAIBudget: setBudget,
}))
vi.mock("@/services/aiModelService", () => ({ getMyModels: async () => [] }))

const { default: ChannelAITeammates } = await import("./channelAITeammates")
const { default: ChannelAIBudget } = await import("./channelAIBudget")

const refusal = () => Object.assign(new Error("Request failed with status code 403"), { response: { status: 403, data: { msg: "Only the channel's admins can do that." } } })

afterEach(() => {
  cleanup()
  toasted.mockClear()
  setTeammate.mockReset()
  setBudget.mockReset()
})

describe("a channel's AI settings that fail", () => {
  it("say which agent didn't join, and why", async () => {
    setTeammate.mockRejectedValue(refusal())
    render(<ChannelAITeammates channelId="c1" />)
    fireEvent.click(await screen.findByRole("switch", { name: "Add Vella Agent to channel" }))
    await vi.waitFor(() =>
      expect(toasted).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Couldn't add Vella Agent to this channel", description: "Only the channel's admins can do that.", variant: "destructive" }),
      ),
    )
    expect(screen.getByRole("switch", { name: "Add Vella Agent to channel" }).getAttribute("aria-checked")).toBe("false")
  })

  it("say the AI settings weren't saved, and why", async () => {
    setBudget.mockRejectedValue(refusal())
    render(<ChannelAIBudget channelId="c1" />)
    const cap = await screen.findByRole("spinbutton")
    fireEvent.change(cap, { target: { value: "5000" } })
    fireEvent.blur(cap)
    await vi.waitFor(() =>
      expect(toasted).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Couldn't save the AI settings", description: "Only the channel's admins can do that.", variant: "destructive" }),
      ),
    )
  })
})
