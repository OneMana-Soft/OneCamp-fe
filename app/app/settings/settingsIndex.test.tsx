import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"

// The list of a person's settings sections, the phone's Settings screen
// (design v3, admin S1). Who you are comes first, as a card that opens your
// profile (the list had no way to it at all); then your sections as one card
// of 52px rows, each icon on a tile in its section's hue, with no line under
// the name; and for an admin, the way into Admin. Rows a permission or the
// server's AI decides hold their place while those answers load, so the rows
// under them don't jump down when they arrive (Workflows and Agents used to
// insert themselves above API tokens).

const { caps, ai } = vi.hoisted(() => ({ caps: { isLoading: false, granted: true }, ai: { state: "available" as string } }))
vi.mock("@/hooks/useCapabilities", () => ({ useCapabilities: () => ({ can: () => caps.granted, isLoading: caps.isLoading }) }))
vi.mock("@/hooks/useClientConfig", () => ({ FEATURE_AI: "ai", useFeatureState: () => ai.state, useAIAvailable: () => ai.state === "available" }))
// The index is the phone's screen; on a computer Settings opens on Profile.
const replace = vi.hoisted(() => vi.fn())
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: true, isTablet: false, isDesktop: false }) }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, push: vi.fn() }) }))
const self = vi.hoisted(() => ({ admin: false }))
vi.mock("@/hooks/useFetch", () => ({
  useFetchOnlyOnce: () => ({ data: { data: { user_uuid: "u1", user_name: "Sam Rivera", user_email_id: "sam@kestrel.studio", user_is_admin: self.admin } } }),
  useFetch: () => ({}),
}))
vi.mock("@/hooks/useUserAvatar", () => ({ useUserAvatar: () => ({ src: "" }) }))

import SettingsPage from "./page"

beforeEach(() => {
  caps.isLoading = false
  caps.granted = true
  ai.state = "available"
  self.admin = false
})
afterEach(cleanup)

const rows = () => screen.getByRole("navigation", { name: "Settings" }).querySelectorAll("li")

describe("the settings index", () => {
  it("puts each section's icon on a tile in its hue", () => {
    render(<SettingsPage />)
    const tileOf = (name: string) => screen.getByRole("link", { name: new RegExp(`^${name}`) }).querySelector("[class*='hue-']")
    expect(tileOf("Notifications")?.className).toMatch(/\bhue-sun\b/)
    expect(tileOf("API tokens")?.className).toMatch(/\bhue-berry\b/)
    expect(tileOf("Connectors")?.className).toMatch(/\bhue-lake\b/)
  })

  it("holds the place of rows that wait on permissions or AI", () => {
    caps.isLoading = true
    ai.state = "unknown"
    render(<SettingsPage />)
    // All six places, three of them waiting.
    expect(rows()).toHaveLength(6)
    expect(screen.getByRole("navigation", { name: "Settings" }).querySelectorAll("a")).toHaveLength(3)
    // API tokens sits where it will stay.
    expect(rows()[3]).toHaveTextContent("API tokens")
  })

  // QA SH-17 (14 Oct 2026): the phone listed Agents and skills before Your AI
  // assistants, the settings nav after. One list now: the nav's.
  it("lists your sections in the settings nav's order", () => {
    render(<SettingsPage />)
    expect([...rows()].map((r) => r.textContent)).toEqual(["Notifications", "Connectors", "Your AI assistants", "API tokens", "Agents and skills", "Workflows"])
  })

  it("leaves out what this person can't use once the answers are in", () => {
    caps.granted = false
    ai.state = "unavailable"
    render(<SettingsPage />)
    expect(screen.queryByRole("link", { name: /^Workflows/ })).toBeNull()
    expect(screen.queryByRole("link", { name: /^Agents and skills/ })).toBeNull()
    expect(rows()).toHaveLength(3)
  })

  it("opens with who you are, a card that opens your profile", () => {
    const { container } = render(<SettingsPage />)
    const card = screen.getByRole("link", { name: /Sam Rivera/ })
    expect(card.getAttribute("href")).toBe("/app/settings/profile")
    expect(card).toHaveTextContent("sam@kestrel.studio")
    // The first thing on the screen, above the sections.
    expect(container.querySelector("[data-profile-card]")).toBe(card)
    expect(card.compareDocumentPosition(screen.getByRole("navigation", { name: "Settings" })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it("lists your sections as 52px rows in one card, named and nothing more", () => {
    render(<SettingsPage />)
    const you = screen.getByRole("region", { name: "You" })
    expect(you.querySelector("ul")?.className).toContain("set-card")
    const link = screen.getByRole("link", { name: /^Notifications/ })
    expect(link.className).toContain("min-h-[52px]")
    // The page it opens says what it is about; the row only names it.
    expect(link.textContent).toBe("Notifications")
  })

  it("gives an admin the way into Admin, and nobody else", () => {
    render(<SettingsPage />)
    expect(screen.queryByRole("link", { name: /^Admin/ })).toBeNull()
    cleanup()
    self.admin = true
    render(<SettingsPage />)
    expect(screen.getByRole("link", { name: /^Admin/ }).getAttribute("href")).toBe("/app/admin")
  })

  it("hovers in the list highlight, which shows on the page", () => {
    render(<SettingsPage />)
    const link = screen.getByRole("link", { name: /^Notifications/ })
    expect(link.className).toMatch(/hover:bg-highlight/)
    expect(link.className).not.toMatch(/hover:bg-accent/)
  })
})
