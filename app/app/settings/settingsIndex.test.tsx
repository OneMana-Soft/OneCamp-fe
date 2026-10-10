import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"

// The list of a person's settings sections. Each row's icon sits on a tile in
// its section's hue. Rows a permission decides hold their place while it
// loads, so the rows under them don't jump down when it arrives (Workflows
// used to insert itself above API tokens).

const { caps, ai } = vi.hoisted(() => ({ caps: { isLoading: false, granted: true }, ai: { state: "available" as string } }))
vi.mock("@/hooks/useCapabilities", () => ({ useCapabilities: () => ({ can: () => caps.granted, isLoading: caps.isLoading }) }))
vi.mock("@/hooks/useClientConfig", () => ({ FEATURE_AI: "ai", useFeatureState: () => ai.state, useAIAvailable: () => ai.state === "available" }))

import SettingsPage from "./page"

beforeEach(() => {
  caps.isLoading = false
  caps.granted = true
  ai.state = "available"
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

  it("holds the place of rows that wait on permissions", () => {
    caps.isLoading = true
    ai.state = "unknown"
    render(<SettingsPage />)
    // All four places, one of them waiting.
    expect(rows()).toHaveLength(4)
    expect(screen.getAllByRole("link")).toHaveLength(3)
    // API tokens sits where it will stay.
    expect(rows()[3]).toHaveTextContent("API tokens")
  })

  it("leaves out what this person can't use once the answers are in", () => {
    caps.granted = false
    ai.state = "unavailable"
    render(<SettingsPage />)
    expect(screen.queryByRole("link", { name: /^Workflows/ })).toBeNull()
    expect(screen.queryByRole("link", { name: /^Agents and skills/ })).toBeNull()
    expect(rows()).toHaveLength(3)
  })

  it("hovers in the list highlight, which shows on the page", () => {
    render(<SettingsPage />)
    const link = screen.getByRole("link", { name: /^Notifications/ })
    expect(link.className).toMatch(/hover:bg-highlight/)
    expect(link.className).not.toMatch(/hover:bg-accent/)
  })
})
