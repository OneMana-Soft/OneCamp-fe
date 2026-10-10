import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"

// The workspace's read receipts. A failed read used to show the switch on (its
// default) beside a toast that left: the card then claimed a setting it had
// never read. Now it says so, with Try again, and shows no switch. The switch
// saves as it is flipped, and says so; a refusal puts it back and says why.

const toast = vi.hoisted(() => vi.fn())
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }), toast }))
const api = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn() }))
vi.mock("@/services/settingsService", () => ({
  getWorkspaceSettings: api.get,
  setReadReceiptsPolicy: api.set,
}))

const { default: ReadReceiptsPolicyCard } = await import("./ReadReceiptsPolicyCard")

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  api.get.mockReset()
  api.set.mockReset()
})

describe("the read receipts policy", () => {
  it("says it couldn't read the setting, with no switch to guess at, and tries again", async () => {
    api.get.mockRejectedValueOnce(new Error("503")).mockResolvedValueOnce({ read_receipts_enabled: false })
    render(<ReadReceiptsPolicyCard />)
    expect(await screen.findByText("Couldn't load the read receipts setting")).toBeTruthy()
    expect(screen.queryByRole("switch")).toBeNull()
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Try again" })))
    const sw = await screen.findByRole("switch", { name: "Allow read receipts" })
    expect(sw.getAttribute("aria-checked")).toBe("false")
  })

  it("says the switch saves as it is flipped", async () => {
    api.get.mockResolvedValue({ read_receipts_enabled: true })
    render(<ReadReceiptsPolicyCard />)
    await screen.findByRole("switch", { name: "Allow read receipts" })
    expect(screen.getByText(/Changes save as you make them\./)).toBeTruthy()
  })

  it("puts the switch back and says why when the server refuses", async () => {
    api.get.mockResolvedValue({ read_receipts_enabled: true })
    api.set.mockRejectedValue({ response: { data: { msg: "The demo is shared, so this stays on." } } })
    render(<ReadReceiptsPolicyCard />)
    const sw = await screen.findByRole("switch", { name: "Allow read receipts" })
    await act(async () => void fireEvent.click(sw))
    expect(sw.getAttribute("aria-checked")).toBe("true")
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({
      title: "Couldn't change read receipts",
      description: "The demo is shared, so this stays on.",
      variant: "destructive",
    }))
  })
})
