import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"

vi.mock("@/services/aiModelService", async (orig) => ({
  ...(await orig<typeof import("@/services/aiModelService")>()),
  getModelRouting: vi.fn(),
  getAuthorizedModels: vi.fn(),
  setModelRouting: vi.fn().mockResolvedValue(undefined),
}))
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }), toast: vi.fn() }))

import ModelRoutingCard from "@/components/admin/ModelRoutingCard"
import { getAuthorizedModels, getModelRouting, setModelRouting } from "@/services/aiModelService"

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const routing = {
  purposes: [{ key: "summaries", label: "Summaries and briefings", description: "Frequent and short." }],
  routes: {},
}

describe("model per job", () => {
  // A failed load was one red line with nothing to press.
  it("says it could not load, with Try again", async () => {
    vi.mocked(getModelRouting).mockRejectedValueOnce(new Error("Network Error"))
    vi.mocked(getAuthorizedModels).mockResolvedValue([])
    render(<ModelRoutingCard />)
    expect(await screen.findByText(/Couldn't load the model choices/)).toBeTruthy()
    vi.mocked(getModelRouting).mockResolvedValueOnce(routing as never)
    fireEvent.click(screen.getByRole("button", { name: "Try again" }))
    expect(await screen.findByText("Summaries and briefings")).toBeTruthy()
  })

  it("ties each job's picker to its name", async () => {
    vi.mocked(getModelRouting).mockResolvedValue(routing as never)
    vi.mocked(getAuthorizedModels).mockResolvedValue([])
    render(<ModelRoutingCard />)
    expect(await screen.findByLabelText("Summaries and briefings")).toBeTruthy()
  })

  // The Save button sat at the card's foot, disabled until something
  // changed, and nothing said a choice was waiting for it.
  it("says a choice is unsaved in a save bar, and saves from it", async () => {
    vi.mocked(getModelRouting).mockResolvedValue(routing as never)
    vi.mocked(getAuthorizedModels).mockResolvedValue([
      { id: "m1", provider_id: "p1", provider_kind: "ollama", provider_label: "Studio Ollama", model: "qwen3:4b", label: "Qwen3 4B", enabled: true, provider_enabled: true } as never,
    ])
    render(<ModelRoutingCard />)
    const trigger = await screen.findByLabelText("Summaries and briefings")
    expect(screen.queryByRole("region", { name: "Unsaved changes" })).toBeNull()
    fireEvent.keyDown(trigger, { key: "ArrowDown" })
    fireEvent.click(await screen.findByRole("option", { name: /Qwen3 4B/ }))
    const bar = await screen.findByRole("region", { name: "Unsaved changes" })
    fireEvent.click(bar.querySelector("button:last-child") as HTMLElement)
    await waitFor(() => expect(setModelRouting).toHaveBeenCalled())
  })
})
