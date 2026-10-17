import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"

// Member-selectable models: a refused change said twice, the API client's
// toast in the server's words and the section's own, reading "Request failed
// with status code 400". Each failure is said once now, by the section, in the
// server's words (apiErrorMessage), and the request's own toast stays quiet.

const { toasts, toast } = vi.hoisted(() => {
  const toasts: { title?: string; description?: string; variant?: string }[] = []
  // One function for the life of the test, as the real hook's is.
  return { toasts, toast: (t: (typeof toasts)[number]) => toasts.push(t) }
})
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }))

const refused = Object.assign(new Error("Request failed with status code 400"), {
  isAxiosError: true,
  response: { status: 400, data: { msg: "That model isn't offered by this provider." } },
})
const service = vi.hoisted(() => ({
  getAuthorizedModels: vi.fn(),
  authorizeModel: vi.fn(),
  setAuthorizedModelEnabled: vi.fn(),
  setAuthorizedModelLimits: vi.fn(),
  discoverAuthorizedModelLimits: vi.fn(),
  revokeAuthorizedModel: vi.fn(),
}))
vi.mock("@/services/aiModelService", async (importOriginal) => ({ ...(await importOriginal<object>()), ...service }))

const { default: AuthorizedModelsSection } = await import("@/components/admin/ai/AuthorizedModelsSection")
const { OWN_ERRORS } = await import("@/lib/axiosInstance")

const MODEL = { id: "m1", provider_id: "p1", model: "llama3.1:8b", label: "Llama", enabled: true, context_window_tokens: 0, max_output_tokens: 0 }
const CONFIG = { providers: [{ id: "p1", name: "Ollama", enabled: true }] } as never

beforeEach(() => {
  toasts.length = 0
  for (const f of Object.values(service)) f.mockReset()
  service.getAuthorizedModels.mockResolvedValue([MODEL])
  for (const f of [service.authorizeModel, service.setAuthorizedModelEnabled, service.setAuthorizedModelLimits, service.discoverAuthorizedModelLimits, service.revokeAuthorizedModel]) f.mockRejectedValue(refused)
})
afterEach(cleanup)

describe("a refused change to a member-selectable model", () => {
  it("is said once, in the server's words", async () => {
    render(<AuthorizedModelsSection config={CONFIG} />)
    await screen.findByRole("button", { name: "Revoke Llama" })

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Revoke Llama" }))
    })
    await act(async () => {
      fireEvent.click(screen.getByRole("switch", { name: "Offer Llama" }))
    })
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Edit token limits for Llama" }))
    })
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save" }))
    })
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Detect" }))
    })

    expect(toasts.map((t) => t.title)).toEqual(["Couldn't revoke the model", "Couldn't turn the model off", "Couldn't save the limits", "Couldn't detect the limits"])
    for (const t of toasts) expect(t.description).toBe("That model isn't offered by this provider.")
    // The request's own toast stays quiet: the section says it.
    expect(service.revokeAuthorizedModel).toHaveBeenCalledWith("m1", OWN_ERRORS)
    expect(service.setAuthorizedModelEnabled).toHaveBeenCalledWith("m1", false, OWN_ERRORS)
    expect(service.setAuthorizedModelLimits).toHaveBeenCalledWith("m1", { context_window_tokens: 0, max_output_tokens: 0 }, OWN_ERRORS)
    expect(service.discoverAuthorizedModelLimits).toHaveBeenCalledWith("m1", OWN_ERRORS)
  })
})
