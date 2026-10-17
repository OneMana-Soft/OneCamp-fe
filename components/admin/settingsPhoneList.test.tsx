import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"

// Admin on a phone (design v3, admin A1): the sections as grouped cards of
// 52px rows. A section the server's answer decides (AI & agents waits on its
// AI, Transcription on its calls) holds its place while that answer loads, as
// the phone's Settings list and the computer's settings nav hold theirs. It
// was left out until the answer came, then pushed Workflows and every group
// under it down by a row, under the thumb.

const feature = vi.hoisted(() => ({ ai: "available", calls: "available" } as Record<string, string>))
vi.mock("@/hooks/useClientConfig", () => ({
  FEATURE_AI: "ai",
  FEATURE_CALLS: "calls",
  useFeatureState: (name: string) => feature[name] ?? "unavailable",
}))
vi.mock("@/hooks/useCapabilities", () => ({ useCapabilities: () => ({ can: () => true, isLoading: false }) }))
vi.mock("next/navigation", () => ({
  usePathname: () => "/app/admin",
  useSearchParams: () => new URLSearchParams(""),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}))

import { SettingsPhoneList } from "./SettingsPhoneList"

beforeEach(() => {
  feature.ai = "available"
  feature.calls = "available"
})
afterEach(cleanup)

const rowsOf = (group: string) => [...screen.getByRole("region", { name: group }).querySelectorAll("li")]

describe("Admin's list on a phone", () => {
  it("holds the place of a section that waits on the server's AI or calls", () => {
    feature.ai = "unknown"
    feature.calls = "unknown"
    render(<SettingsPhoneList />)
    const rows = rowsOf("AI and automation")
    // AI & agents, Workflows, Transcription: two still waiting.
    expect(rows).toHaveLength(3)
    expect(rows.filter((r) => r.querySelector("a"))).toHaveLength(1)
    // Workflows sits where it will stay.
    expect(rows[1]).toHaveTextContent("Workflows")
  })

  it("lists them once the answers are in", () => {
    render(<SettingsPhoneList />)
    expect(rowsOf("AI and automation").map((r) => r.textContent)).toEqual(["AI & agents", "Workflows", "Transcription"])
  })

  it("leaves out what the server doesn't have", () => {
    feature.ai = "unavailable"
    feature.calls = "unavailable"
    render(<SettingsPhoneList />)
    expect(rowsOf("AI and automation").map((r) => r.textContent)).toEqual(["Workflows"])
  })
})
