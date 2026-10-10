import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"

const checkForUpdates = vi.fn()
vi.mock("@/services/updatesService", async (orig) => ({
  ...(await orig<typeof import("@/services/updatesService")>()),
  checkForUpdates: () => checkForUpdates(),
}))
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }))

const UpdatesCard = (await import("./UpdatesCard")).default

afterEach(() => {
  cleanup()
  checkForUpdates.mockReset()
})

describe("the updates card", () => {
  // At 390 the button sat beside the description and squeezed it to two or
  // three words a line.
  it("puts its button under the words on a phone, beside them from sm up", () => {
    render(<UpdatesCard />)
    const header = screen.getByRole("button", { name: "Check for updates" }).parentElement as HTMLElement
    const cls = header.className.split(/\s+/)
    expect(cls).toContain("flex-col")
    expect(cls).toContain("sm:flex-row")
    expect(cls).not.toContain("flex-row")
  })

  // "An update is available" drew its icon in the accent, which means "press
  // me", beside words nobody can press. It is news, in the info colour.
  it("marks an available update in the info colour, not the accent", async () => {
    checkForUpdates.mockResolvedValue({
      running: "v2.70.0",
      edition: "v2",
      latest: "v2.71.0",
      latest_by_line: { v2: "v2.71.0" },
      update_available: true,
      managed: false,
      update_command: "curl -fsSL https://onemana.dev/install | sh -s -- --license YOUR-LICENSE-KEY",
    })
    const { container } = render(<UpdatesCard />)
    fireEvent.click(screen.getByRole("button", { name: "Check for updates" }))
    await screen.findByText("v2.71.0 is available")
    const icon = container.querySelector("[data-update-tone] svg") as SVGElement
    expect(icon.getAttribute("class")).toContain("text-info-ink")
    expect(icon.getAttribute("class")).not.toContain("text-primary")
  })
})
