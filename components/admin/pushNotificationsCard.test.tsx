import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"

// Mobile push. A failed read used to say "Off: no credential is set", which an
// admin acts on by pasting a key that was already there. It now says it
// couldn't check. Turning push off deletes a key that is never shown again,
// so it asks first and says so. The details read as quiet labels beside ink
// values, one per line.

const toast = vi.hoisted(() => vi.fn())
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }), toast }))
const confirm = vi.hoisted(() => vi.fn())
vi.mock("@/hooks/useConfirm", () => ({ useConfirm: () => confirm }))
const api = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn(), clear: vi.fn() }))
vi.mock("@/services/settingsService", () => ({
  getPushConfig: api.get,
  setPushConfig: api.set,
  clearPushConfig: api.clear,
}))

const { default: PushNotificationsCard } = await import("./PushNotificationsCard")

const on = { configured: true, active: true, source: "settings", project_id: "kestrel-mobile", client_email: "push@kestrel-mobile.iam.gserviceaccount.com" }

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  api.get.mockReset()
})

describe("push notifications", () => {
  it("says it couldn't check, instead of calling push off", async () => {
    api.get.mockRejectedValueOnce(new Error("503")).mockResolvedValueOnce(on)
    render(<PushNotificationsCard />)
    expect(await screen.findByText("Couldn't load the push notification setting")).toBeTruthy()
    expect(screen.queryByText(/No credential is set/)).toBeNull()
    expect(screen.queryByRole("textbox")).toBeNull()
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Try again" })))
    expect(await screen.findByText("kestrel-mobile")).toBeTruthy()
  })

  it("asks before turning push off, and says the key is gone for good", async () => {
    api.get.mockResolvedValue(on)
    api.clear.mockResolvedValue({ configured: false, active: false, source: "none" })
    render(<PushNotificationsCard />)
    fireEvent.click(await screen.findByRole("button", { name: "Turn off" }))
    expect(api.clear).not.toHaveBeenCalled()
    expect(confirm).toHaveBeenCalledWith(expect.objectContaining({
      title: "Turn off push notifications?",
      description: expect.stringMatching(/can't be shown again/),
      destructive: true,
    }))
    await act(async () => confirm.mock.calls[0][0].onConfirm())
    expect(api.clear).toHaveBeenCalled()
  })

  it("lists the details as quiet labels beside their values", async () => {
    api.get.mockResolvedValue(on)
    render(<PushNotificationsCard />)
    const project = await screen.findByText("kestrel-mobile")
    const label = screen.getByText("Project")
    expect(label.className).toMatch(/text-muted-foreground/)
    expect(label.className).toMatch(/whitespace-nowrap/)
    expect(project.closest("div")?.className).toMatch(/grid/)
    expect(screen.getByText("On").className).toMatch(/text-success-ink/)
  })
})
