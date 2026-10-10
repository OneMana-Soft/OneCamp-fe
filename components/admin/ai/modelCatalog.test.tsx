import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"

// Stable, as the real one is: a new function each render would re-run the load.
const toastSpy = vi.hoisted(() => vi.fn())
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: toastSpy }), toast: toastSpy }))
vi.mock("@/services/aiModelService", async (orig) => ({
  ...(await orig<typeof import("@/services/aiModelService")>()),
  getOllamaCatalog: vi.fn(),
}))

import { ModelCatalog } from "@/components/admin/ai/ModelCatalog"
import { getOllamaCatalog, type CatalogModelView } from "@/services/aiModelService"

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const model = (over: Partial<CatalogModelView> = {}): CatalogModelView => ({
  tag: "qwen3:4b-instruct",
  family: "qwen3",
  display_name: "Qwen3 4B",
  description: "A small chat model.",
  parameters: "4B",
  size_bytes: 2_500_000_000,
  min_ram_bytes: 4_000_000_000,
  capabilities: ["chat"],
  recommended: true,
  installed: false,
  ...over,
})

describe("the model catalog", () => {
  // A row of pills with the chosen one filled in the accent; the app's single
  // choices are the house segmented control.
  it("filters with the house segmented control", async () => {
    vi.mocked(getOllamaCatalog).mockResolvedValue({ models: [model()] } as never)
    render(<ModelCatalog providerId="p1" onInstalled={() => {}} />)
    const group = await screen.findByRole("radiogroup", { name: "Show models" })
    const all = screen.getByRole("radio", { name: "All" })
    expect(group.contains(all)).toBe(true)
    expect(all.getAttribute("aria-checked")).toBe("true")
    expect(all.className).not.toContain("bg-primary")
    expect(all.className).not.toContain("rounded-full")
  })

  // A failed load toasted, then said "No models match your search.": a false
  // empty, with nothing to press.
  it("says the catalog couldn't load, with the reason and Try again, not that nothing matches", async () => {
    vi.mocked(getOllamaCatalog).mockRejectedValueOnce({ response: { status: 502, data: { msg: "Ollama isn't answering." } } })
    render(<ModelCatalog providerId="p1" onInstalled={() => {}} />)
    expect(await screen.findByText("Couldn't load the model catalog")).toBeTruthy()
    expect(screen.getByText("Ollama isn't answering.")).toBeTruthy()
    expect(screen.queryByText(/No models match/)).toBeNull()
    vi.mocked(getOllamaCatalog).mockResolvedValueOnce({ models: [model()] } as never)
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /try again/i })) })
    expect(await screen.findByText("Qwen3 4B")).toBeTruthy()
  })

  it("says a search matched nothing, and offers to clear it", async () => {
    vi.mocked(getOllamaCatalog).mockResolvedValue({ models: [model()] } as never)
    render(<ModelCatalog providerId="p1" onInstalled={() => {}} />)
    const search = await screen.findByPlaceholderText(/Search models/)
    fireEvent.change(search, { target: { value: "zzz" } })
    expect(screen.getByText("No models match")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Clear search" }))
    expect(await screen.findByText("Qwen3 4B")).toBeTruthy()
  })
})
