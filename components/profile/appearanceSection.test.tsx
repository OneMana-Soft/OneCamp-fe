import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react"

// The theme choice keys as a radio group does (WAI-ARIA): one stop in the Tab
// order, and the arrow keys move to the next theme and choose it.

const theme = vi.hoisted(() => ({ current: "light", setTheme: vi.fn() }))
vi.mock("next-themes", () => ({ useTheme: () => ({ theme: theme.current, setTheme: theme.setTheme }) }))
const accent = vi.hoisted(() => ({ current: "onecamp", setActiveTheme: vi.fn() }))
vi.mock("@/components/activeTheme/activeTheme", () => ({ VALID_COLOR_THEMES: ["onecamp", "blue"], useThemeConfig: () => ({ activeTheme: accent.current, setActiveTheme: accent.setActiveTheme }) }))
// The shared toast, read back: what a change says and the Undo it offers.
type Toasted = { title?: string; action?: { props: { onClick: () => Promise<void>; altText?: string } } }
const toast = vi.hoisted(() => vi.fn<(t: Toasted) => void>())
vi.mock("@/hooks/use-toast", async (orig) => ({ ...(await orig<object>()), useToast: () => ({ toast }), toast }))
vi.mock("@/components/profile/ChangePasswordSection", () => ({ ChangePasswordSection: () => null }))
vi.mock("@/components/profile/TwoFactorSection", () => ({ TwoFactorSection: () => null }))
vi.mock("@/components/profile/PasskeySection", () => ({ PasskeySection: () => null }))
vi.mock("@/hooks/useConfirm", () => ({ useConfirm: () => vi.fn() }))
vi.mock("@/lib/axiosInstance", async () => (await import("@/lib/testing/axiosInstance")).axiosInstanceModule({ default: { get: vi.fn(), post: vi.fn() } }))

const { AppearanceSection } = await import("@/components/profile/ProfileSettingsSections")

beforeEach(() => {
  theme.current = "light"
  theme.setTheme.mockReset()
  accent.current = "onecamp"
  accent.setActiveTheme.mockReset()
  toast.mockReset()
})
// A change's toast loads on first use (import()): let any offer still on its
// way land before the next test counts its own.
afterEach(async () => {
  await act(async () => void (await import("@/components/ui/undoToast")))
  cleanup()
})

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
    fireEvent.click(screen.getByRole("radio", { name: "Device" }))
    expect(theme.setTheme).toHaveBeenCalledWith("system")
  })
})

// The theme and the accent are rows of a settings card, and the theme is a
// choice of three cards, each a miniature of the app in that mode (design v3,
// admin D1): it was a segmented control of three words.
describe("the appearance section", () => {
  it("sets the theme in a row of a settings card", () => {
    render(<AppearanceSection />)
    const row = screen.getByRole("radiogroup", { name: "Theme" }).closest(".set-row")
    expect(row).not.toBeNull()
    expect(row?.parentElement?.className).toMatch(/set-card/)
  })

  it("draws each theme as a miniature of the app in that mode", () => {
    render(<AppearanceSection />)
    const group = screen.getByRole("radiogroup", { name: "Theme" })
    for (const [name, mode] of [["Light", "light"], ["Dark", "dark"], ["Device", "system"]]) {
      expect(within(group).getByRole("radio", { name }).querySelector(`:is(.you-mini, .you-mini-pair)[data-mode="${mode}"]`)).not.toBeNull()
    }
  })

  it("draws the device's own as the light miniature with the dark one over its right half", () => {
    // Critic, 11 Oct: each part was split at its own 50 %, so the halves met
    // out of line and the card read as a rendering fault.
    render(<AppearanceSection />)
    const device = within(screen.getByRole("radiogroup", { name: "Theme" })).getByRole("radio", { name: "Device" })
    expect(device.querySelector('.you-mini-pair > .you-mini[data-mode="light"]')).not.toBeNull()
    expect(device.querySelector('.you-mini-pair > .you-mini-half > .you-mini[data-mode="dark"]')).not.toBeNull()
  })
})

// design-14, item 2: every change saved with a tick and undo. The theme and
// the accent change the moment they are picked, so each row ticks beside its
// name, and the toast offers the change back.
describe("a change of theme or accent", () => {
  const offered = () => toast.mock.calls.map(([t]) => t).filter((t) => t.action)

  it("ticks beside Theme, and Undo puts the theme it had back", async () => {
    render(<AppearanceSection />)
    await act(async () => {
      fireEvent.click(screen.getByRole("radio", { name: "Dark" }))
    })
    expect(theme.setTheme).toHaveBeenCalledWith("dark")
    const row = screen.getByRole("radiogroup", { name: "Theme" }).closest(".set-row")!
    expect(row.querySelector("[data-saved-tick]")).not.toBeNull()
    await waitFor(() => expect(offered().map((t) => t.title)).toEqual(["Theme: Dark"]))
    await act(async () => {
      await offered()[0].action!.props.onClick()
    })
    expect(theme.setTheme).toHaveBeenLastCalledWith("light")
    expect(offered()).toHaveLength(1)
  })

  it("ticks beside Accent colour, and Undo puts the accent it had back", async () => {
    render(<AppearanceSection />)
    await act(async () => {
      fireEvent.click(screen.getByRole("radio", { name: "Blue" }))
    })
    expect(accent.setActiveTheme).toHaveBeenCalledWith("blue")
    const row = screen.getByRole("radiogroup", { name: "Accent colour" }).closest(".set-row")!
    expect(row.querySelector("[data-saved-tick]")).not.toBeNull()
    await waitFor(() => expect(offered().map((t) => t.title)).toEqual(["Accent: Blue"]))
    await act(async () => {
      await offered()[0].action!.props.onClick()
    })
    expect(accent.setActiveTheme).toHaveBeenLastCalledWith("onecamp")
  })

  it("says nothing when the chosen one is picked again", async () => {
    render(<AppearanceSection />)
    await act(async () => {
      fireEvent.click(screen.getByRole("radio", { name: "OneCamp" }))
    })
    expect(accent.setActiveTheme).not.toHaveBeenCalled()
    expect(offered()).toHaveLength(0)
  })
})
