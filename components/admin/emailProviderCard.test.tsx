import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"

// The key every email depends on. A failed read used to show "Email is off",
// and an admin acts on that by pasting a key that is already there; it now
// says it couldn't check. The status reads as a quiet label beside its value
// (no pill), the key is a row whose field a browser never fills with the
// admin's own password, and a refusal says why.

const toast = vi.hoisted(() => vi.fn())
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }), toast }))
const api = vi.hoisted(() => ({ get: vi.fn(), update: vi.fn() }))
vi.mock("@/services/settingsService", () => ({
  getWorkspaceSettings: api.get,
  updateWorkspaceSettings: api.update,
}))

const { default: EmailProviderCard } = await import("./EmailProviderCard")

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  api.get.mockReset()
  api.update.mockReset()
})

describe("the email key", () => {
  it("says it couldn't check, instead of calling email off", async () => {
    api.get.mockRejectedValueOnce(new Error("503")).mockResolvedValueOnce({ has_resend_api_key: true, resend_source: "db" })
    render(<EmailProviderCard />)
    expect(await screen.findByText("Couldn't load the email settings")).toBeTruthy()
    expect(screen.queryByText(/Email is off|^Off$/)).toBeNull()
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Try again" })))
    expect(await screen.findByText("On")).toBeTruthy()
  })

  it("reads the status as a quiet label beside its value", async () => {
    api.get.mockResolvedValue({ has_resend_api_key: true, resend_source: "db" })
    render(<EmailProviderCard />)
    const on = await screen.findByText("On")
    expect(on.className).toMatch(/text-success-ink/)
    expect(on.querySelector("svg")).toBeNull()
    expect(screen.getByText("Status").className).toMatch(/text-muted-foreground/)
  })

  it("keeps a browser from filling the admin's password into the key", async () => {
    api.get.mockResolvedValue({ has_resend_api_key: false, resend_source: "none" })
    render(<EmailProviderCard />)
    const key = await screen.findByLabelText("Resend API key")
    expect(key.getAttribute("autocomplete")).toBe("new-password")
    expect(key.getAttribute("name")).toBe("resend-api-key")
  })

  it("says why a key was refused", async () => {
    api.get.mockResolvedValue({ has_resend_api_key: false, resend_source: "none" })
    api.update.mockRejectedValue({ response: { data: { msg: "That key was rejected by Resend." } } })
    render(<EmailProviderCard />)
    fireEvent.change(await screen.findByLabelText("Resend API key"), { target: { value: "re_123" } })
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Save key" })))
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({
      title: "Couldn't save the email key",
      description: "That key was rejected by Resend.",
      variant: "destructive",
    }))
  })
})
