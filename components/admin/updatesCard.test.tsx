import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"

// Design v3 (admin A21, mock M8): a version row in a card ("OneCamp 2.71.0",
// a moss dot, "You're up to date · checked …"); a release that is out turns
// it into a release card with a New tag and the update command as a code row.
// The refresh glyph turns once per check, never continuously.

const checkForUpdates = vi.fn()
vi.mock("@/services/updatesService", async (orig) => ({
  ...(await orig<typeof import("@/services/updatesService")>()),
  checkForUpdates: () => checkForUpdates(),
}))
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }))

const { default: UpdatesCard, checkedAgo } = await import("./UpdatesCard")

afterEach(() => {
  cleanup()
  checkForUpdates.mockReset()
})

const base = { edition: "v2", latest_by_line: { v2: "v2.71.0" }, managed: false, source: "onemana.dev", checked_at: "" }

describe("the updates card", () => {
  it("is a card under a plain h2, asking only when pressed", () => {
    const { container } = render(<UpdatesCard />)
    expect(screen.getByRole("heading", { level: 2, name: "Updates" }).className).toContain("text-heading")
    expect(container.querySelector("[data-settings-card] [data-version-row]")).toBeTruthy()
    expect(screen.getByText(/Not checked yet/)).toBeTruthy()
    expect(checkForUpdates).not.toHaveBeenCalled()
  })

  it("says it's up to date with a moss dot, and turns the glyph once per check", async () => {
    checkForUpdates.mockResolvedValue({ ...base, running: "v2.71.0", latest: "v2.71.0", update_available: false })
    const { container } = render(<UpdatesCard />)
    const button = screen.getByRole("button", { name: "Check for updates" })
    expect(button.querySelector("svg")?.getAttribute("class") ?? "").not.toMatch(/animate-spin|cfg-spin-once/)
    await act(async () => void fireEvent.click(button))
    expect(screen.getByRole("heading", { level: 3, name: "OneCamp 2.71.0" })).toBeTruthy()
    const line = screen.getByText(/You're up to date · checked just now/)
    expect(line.closest("[data-status-word]")?.getAttribute("data-status-word")).toBe("success")
    const glyph = container.querySelector("[data-version-row] button svg") as SVGElement
    expect(glyph.getAttribute("class")).toContain("cfg-spin-once")
    expect(glyph.getAttribute("class")).not.toContain("animate-spin")
  })

  it("becomes a release card with a New tag and the command to copy", async () => {
    checkForUpdates.mockResolvedValue({
      ...base,
      running: "v2.70.0",
      latest: "v2.71.0",
      update_available: true,
      update_command: "curl -fsSL https://onemana.dev/install | sh -s -- --license YOUR-LICENSE-KEY",
      highlights: ["Faster boards", "Guest approvals", "A fix for imports from Jira", "A fourth"],
      notes_url: "https://onemana.dev/changelog",
    })
    render(<UpdatesCard />)
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Check for updates" })))
    const card = document.querySelector("[data-release-card]") as HTMLElement
    expect(screen.getByRole("heading", { level: 3, name: "OneCamp 2.71.0 is out" })).toBeTruthy()
    expect(card.querySelector("[data-new-tag]")?.textContent).toBe("New")
    expect(card.querySelectorAll("li")).toHaveLength(3)
    expect(card.querySelector("[data-code-row] code")?.textContent).toMatch(/^curl -fsSL/)
    expect(screen.getByRole("link", { name: /Read the notes/ }).getAttribute("href")).toBe("https://onemana.dev/changelog")
  })

  it("says how long ago it checked", () => {
    const now = new Date("2026-10-11T12:00:00Z")
    expect(checkedAgo(new Date("2026-10-11T11:59:50Z"), now)).toBe("just now")
    expect(checkedAgo(new Date("2026-10-11T11:58:00Z"), now)).toBe("2 m ago")
    expect(checkedAgo(new Date("2026-10-11T09:00:00Z"), now)).toBe("3 h ago")
  })
})
