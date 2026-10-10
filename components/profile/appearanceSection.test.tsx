import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"

// The theme choice keys as a radio group does (WAI-ARIA): one stop in the Tab
// order, and the arrow keys move to the next theme and choose it.

const theme = vi.hoisted(() => ({ current: "light", setTheme: vi.fn() }))
vi.mock("next-themes", () => ({ useTheme: () => ({ theme: theme.current, setTheme: theme.setTheme }) }))
vi.mock("@/components/activeTheme/ColorThemePicker", () => ({ ColorThemePicker: () => null }))
vi.mock("@/components/profile/ChangePasswordSection", () => ({ ChangePasswordSection: () => null }))
vi.mock("@/components/profile/TwoFactorSection", () => ({ TwoFactorSection: () => null }))
vi.mock("@/components/profile/PasskeySection", () => ({ PasskeySection: () => null }))
vi.mock("@/hooks/useConfirm", () => ({ useConfirm: () => vi.fn() }))
vi.mock("@/lib/axiosInstance", () => ({ default: { get: vi.fn(), post: vi.fn() } }))

const { AppearanceSection } = await import("@/components/profile/ProfileSettingsSections")

beforeEach(() => {
  theme.current = "light"
  theme.setTheme.mockReset()
})
afterEach(cleanup)

describe("the theme choice", () => {
  it("is a radio group named Theme, with the current theme chosen", () => {
    render(<AppearanceSection />)
    expect(screen.getByRole("radiogroup", { name: "Theme" })).toBeTruthy()
    expect(screen.getByRole("radio", { name: "Light" }).getAttribute("aria-checked")).toBe("true")
    expect(screen.getByRole("radio", { name: "Dark" }).getAttribute("aria-checked")).toBe("false")
  })

  it("moves to the next theme and chooses it with an arrow key", async () => {
    render(<AppearanceSection />)
    const light = screen.getByRole("radio", { name: "Light" })
    const dark = screen.getByRole("radio", { name: "Dark" })
    act(() => light.focus())
    fireEvent.keyDown(light, { key: "ArrowRight" })
    await waitFor(() => expect(document.activeElement).toBe(dark))
    expect(theme.setTheme).toHaveBeenCalledWith("dark")
  })

  it("chooses a theme when it is clicked", () => {
    render(<AppearanceSection />)
    fireEvent.click(screen.getByRole("radio", { name: "Match system" }))
    expect(theme.setTheme).toHaveBeenCalledWith("system")
  })
})
