import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { SWRConfig } from "swr"
import { AtAddress } from "@/lib/testing/nextAddress"
import type { ReactNode } from "react"
import { readFileSync } from "node:fs"
import { join } from "node:path"

/**
 * Design v3, admin §A19: the directory is a grid of app cards (raised, e1,
 * r12; 3 across at the wide column, 2 at 720) with a 40px icon, the name, one
 * line and a neutral category chip. The card opens a side sheet; installing
 * morphs Install → spinner → "Installed ✓" inside one fixed-width slot, so
 * nothing beside it moves (a width that animates lays the page out on every
 * frame).
 */

vi.mock("@/services/appService", () => ({
  listMarketplace: vi.fn(),
  installTemplate: vi.fn(),
  uninstallTemplate: vi.fn(),
}))
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }), toast: vi.fn() }))

import MarketplaceCard from "@/components/admin/MarketplaceCard"
import { installTemplate, listMarketplace } from "@/services/appService"

const fresh = ({ children }: { children: ReactNode }) => (
  <AtAddress url="/app/admin?tab=apps">
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0, shouldRetryOnError: false }}>{children}</SWRConfig>
  </AtAddress>
)

const zoom = {
  slug: "zoom", name: "Zoom", description: "Start a call", category: "Video", kind: "external", featured: false,
  commands: ["zoom"], setup: [{ key: "k", label: "Key", type: "secret", required: false }],
  installed: false, enabled: false, needs_setup: false, is_connected: false,
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe("app cards", () => {
  it("draws each app as a raised card with its icon, name, one line and a neutral category", async () => {
    vi.mocked(listMarketplace).mockResolvedValue([zoom] as never)
    render(<MarketplaceCard onConfigure={() => {}} />, { wrapper: fresh })
    const card = (await screen.findByText("Zoom")).closest("[data-app-card]") as HTMLElement
    expect(card.className).toContain("cx-app-card")
    expect(card.className).not.toMatch(/\bborder\b/)
    expect(card.querySelector("[data-app-icon]")).toBeTruthy()
    expect(card.querySelector("[data-neutral-chip]")?.textContent).toBe("Video")
    expect(card.innerHTML).not.toMatch(/hue-|camp-/)
    const css = readFileSync(join(process.cwd(), "app/styles/admin/connect.css"), "utf8")
    expect(css).toMatch(/\.cx-app-card \{[^}]*box-shadow: var\(--e1\)/)
    expect(css).toMatch(/\.cx-app-card-live:hover \{[^}]*var\(--e2\)[^}]*translateY\(-1px\)/)
    expect(css).toMatch(/@container \(min-width: 860px\) \{ \.cx-app-grid \{ grid-template-columns: repeat\(3/)
  })

  it("opens a side sheet with what the app adds and uses", async () => {
    vi.mocked(listMarketplace).mockResolvedValue([zoom] as never)
    render(<MarketplaceCard onConfigure={() => {}} />, { wrapper: fresh })
    fireEvent.click(await screen.findByRole("button", { name: "About Zoom" }))
    expect(await screen.findByRole("heading", { name: "Adds these commands" })).toBeTruthy()
    expect(document.querySelector('[data-app-need="secret"]')).toBeTruthy()
  })

  it("morphs Install to a spinner and then Installed ✓ in one slot", async () => {
    let finish: (v: unknown) => void = () => {}
    vi.mocked(installTemplate).mockReturnValue(new Promise((r) => (finish = r)) as never)
    vi.mocked(listMarketplace).mockResolvedValueOnce([zoom] as never).mockResolvedValue([{ ...zoom, installed: true, app_id: "a1" }] as never)
    render(<MarketplaceCard onConfigure={() => {}} />, { wrapper: fresh })
    const install = await screen.findByRole("button", { name: "Install Zoom" })
    const slot = install.className
    fireEvent.click(install)
    const busy = await screen.findByRole("button", { name: "Installing Zoom" })
    expect(busy.getAttribute("data-install-state")).toBe("busy")
    expect(busy.className).toContain("cx-app-slot")
    finish({ id: "a1" })
    const done = await screen.findByRole("button", { name: "Zoom installed" })
    await waitFor(() => expect(done.getAttribute("data-install-state")).toBe("done"))
    expect(done.textContent).toContain("Installed")
    // One slot class throughout: the width comes from the slot, not the label.
    expect(slot).toContain("cx-app-slot")
    // Stacked, as a utility (critic, 11 Oct): the slot's components-layer
    // grid lost to the button's inline-flex, so the three labels stood side
    // by side and "Install" sat at the left of a box that read as a field.
    expect(slot.split(/\s+/)).toContain("inline-grid")
    expect(slot.split(/\s+/)).not.toContain("inline-flex")
  })

  it("keeps its category filters on one line of their own, under the search", async () => {
    vi.mocked(listMarketplace).mockResolvedValue([zoom] as never)
    render(<MarketplaceCard onConfigure={() => {}} />, { wrapper: fresh })
    await screen.findByRole("button", { name: "Install Zoom" })
    const group = screen.getByRole("group", { name: "Category" })
    expect(group.className).not.toMatch(/flex-wrap/)
    expect(group.className).toContain("overflow-x-auto")
  })
})
