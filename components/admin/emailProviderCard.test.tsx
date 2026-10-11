import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"

// The key every email depends on. A failed read used to show "Email is off",
// and an admin acts on that by pasting a key that is already there; it now
// says it couldn't check. The provider is one large row with a dot and a word,
// the key is a row whose field a browser never fills with the
// admin's own password, and a refusal says why.

const toast = vi.hoisted(() => vi.fn())
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }), toast }))
const api = vi.hoisted(() => ({ get: vi.fn(), update: vi.fn() }))
// Read through the one shared SWR key (useWorkspaceSettings), answering from api.get.
vi.mock("@/lib/axiosInstance", () => ({
  // The sender address comes from the email config, answered apart.
  default: { get: async (url: string) => (url.includes("config/email") ? { data: { data: { default_sender: "noreply@kestrel.example" } } } : { data: { data: await api.get() } }), post: vi.fn() },
  OWN_ERRORS: {},
}))
vi.mock("@/services/settingsService", async (orig) => ({
  ...(await orig<typeof import("@/services/settingsService")>()),
  updateWorkspaceSettings: api.update,
}))

const { SWRConfig } = await import("swr")
const { default: Card } = await import("./EmailProviderCard")
const EmailProviderCard = () => (
  <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0, shouldRetryOnError: false }}>
    <Card />
  </SWRConfig>
)

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
    expect(await screen.findByText(/Couldn't load the email settings/)).toBeTruthy()
    expect(screen.queryByText(/Email is off|^Off$/)).toBeNull()
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Try again" })))
    expect(await screen.findByText("On")).toBeTruthy()
  })

  // Design v3 (admin A10): the provider is one large row, a 36px mark tile,
  // "Sending through Resend" and a dot and a word.
  it("shows the provider as a large row with a dot and a word", async () => {
    api.get.mockResolvedValue({ has_resend_api_key: true, resend_source: "db" })
    render(<EmailProviderCard />)
    const on = await screen.findByText("On")
    expect(on.closest("[data-status-word]")?.getAttribute("data-status-word")).toBe("success")
    const row = on.closest("[data-email-provider]") as HTMLElement
    expect(row.textContent).toContain("Sending through Resend")
    expect(row.querySelector(".size-9 svg")).toBeTruthy()
  })

  // The key is write-only: a masked code row with Replace, which opens the field.
  it("shows a set key as a code row, and Replace opens the field", async () => {
    api.get.mockResolvedValue({ has_resend_api_key: true, resend_source: "db" })
    render(<EmailProviderCard />)
    const masked = await screen.findByText(/^re_•+$/)
    expect(masked.closest("[data-code-row]")).toBeTruthy()
    expect(screen.queryByLabelText("Resend API key")).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Replace" }))
    const key = screen.getByLabelText("Resend API key")
    expect(key.className).not.toMatch(/(^|\s)h-8(\s|$)/)
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
