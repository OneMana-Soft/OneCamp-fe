import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react"

// The Audit tab's redaction window: how long detailed records are kept before
// they are redacted. It was titled "Retention", the word Archive uses for
// something else, and a failed read made the whole card vanish. It now says
// so, with Try again; a bad number is said under the field; an edit waits in
// the save bar.

const toast = vi.hoisted(() => vi.fn())
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }), toast }))
const api = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn() }))
vi.mock("@/services/settingsService", () => ({
  getRetentionPolicy: api.get,
  setRetentionPolicy: api.set,
}))

const { default: RetentionCard } = await import("./RetentionCard")

const policy = { window_days: 365, minimum_days_floor: 190, keeps_everything: false, swept_stores: ["messages", "audit log details"] }

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  api.get.mockReset()
  api.set.mockReset()
})

const saveBar = () => screen.getByRole("region", { name: "Unsaved changes" })

describe("the redaction window", () => {
  it("is called what it does, not Archive's word", async () => {
    api.get.mockResolvedValue(policy)
    render(<RetentionCard />)
    expect(await screen.findByRole("heading", { name: "Redaction window" })).toBeTruthy()
    expect(screen.queryByRole("heading", { name: "Retention" })).toBeNull()
  })

  it("says it couldn't load instead of vanishing, and tries again", async () => {
    api.get.mockRejectedValueOnce(new Error("503")).mockResolvedValueOnce(policy)
    render(<RetentionCard />)
    expect(await screen.findByText("Couldn't load the redaction window")).toBeTruthy()
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Try again" })))
    expect(await screen.findByDisplayValue("365")).toBeTruthy()
  })

  it("says a bad number under the field, and sends nothing", async () => {
    api.get.mockResolvedValue(policy)
    render(<RetentionCard />)
    const days = await screen.findByLabelText("Days to keep")
    fireEvent.change(days, { target: { value: "-4" } })
    await act(async () => void fireEvent.click(within(saveBar()).getByRole("button", { name: "Save" })))
    expect(api.set).not.toHaveBeenCalled()
    expect(screen.getByRole("alert").textContent).toMatch(/whole number of days/)
    expect(days.getAttribute("aria-invalid")).toBe("true")
    expect(document.activeElement).toBe(days)
  })

  it("saves from the save bar, and says when the floor raised the number", async () => {
    api.get.mockResolvedValue(policy)
    api.set.mockResolvedValue({ ...policy, window_days: 190 })
    render(<RetentionCard />)
    fireEvent.change(await screen.findByLabelText("Days to keep"), { target: { value: "30" } })
    await act(async () => void fireEvent.click(within(saveBar()).getByRole("button", { name: "Save" })))
    expect(api.set).toHaveBeenCalledWith(30)
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Saved as 190 days" }))
    expect(screen.queryByRole("region", { name: "Unsaved changes" })).toBeNull()
  })

  // A row's control takes the list's one height, the field's own; a plain h-8
  // lost to the field's md:h-9, so the class said one thing and the page another.
  it("keeps the days field at the list's one control height", async () => {
    api.get.mockResolvedValue(policy)
    render(<RetentionCard />)
    const days = await screen.findByDisplayValue("365")
    expect(days.className).not.toMatch(/(^|\s)h-8(\s|$)/)
    expect(days.className).toContain("md:h-9")
  })

  it("says the server's reason for a failed read, under the title", async () => {
    api.get.mockRejectedValueOnce({ response: { status: 403, data: { msg: "Only admins can change the redaction window." } } })
    render(<RetentionCard />)
    expect(await screen.findByText("Only admins can change the redaction window.")).toBeTruthy()
    expect(screen.getByRole("heading", { name: "Redaction window" })).toBeTruthy()
  })
})
