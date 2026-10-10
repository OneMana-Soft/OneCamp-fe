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
    const header = screen.getByRole("button", { name: "Check for updates" }).closest("[data-section-header]") as HTMLElement
    const cls = header.className.split(/\s+/)
    expect(cls).toContain("flex-col")
    expect(cls).toContain("sm:flex-row")
    expect(cls).not.toContain("flex-row")
  })

  // "Updates" was a 14px title in a bordered card, beside "Installation health"
  // at 16px: the Health tab had two title sizes and a box around each.
  it("is a flat section whose title is a plain h2", () => {
    const { container } = render(<UpdatesCard />)
    const root = container.firstElementChild as HTMLElement
    expect(root.tagName).toBe("SECTION")
    expect(root.className).not.toMatch(/(^|\s)border(\s|$)/)
    expect(screen.getByRole("heading", { level: 2, name: "Updates" }).className).toContain("text-base")
    // The section's one action, at the header's height.
    expect(screen.getByRole("button", { name: "Check for updates" }).className).toContain("md:h-8")
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
