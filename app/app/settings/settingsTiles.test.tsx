import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"

// The settings list sets each section on a tile in its place's hue (the
// playful layer's tiles), the same hue the phone's More menu gives it.

// Everything allowed and AI on, every answer in: every section shows.
vi.mock("@/hooks/useCapabilities", () => ({ useCapabilities: () => ({ can: () => true, isLoading: false }) }))
vi.mock("@/hooks/useClientConfig", () => ({ FEATURE_AI: "ai", useAIAvailable: () => true, useFeatureState: () => "available" }))
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

import SettingsPage from "./page"
import { destinationHue } from "@/lib/destinationHue"
import { SETTINGS_SECTIONS } from "@/lib/settingsSections"

afterEach(() => cleanup())

describe("the settings list", () => {
  it("sets every section's icon on a tile in its hue", () => {
    render(<SettingsPage />)
    for (const section of SETTINGS_SECTIONS) {
      const link = screen.getByRole("link", { name: new RegExp(section.label) })
      const tile = link.querySelector("span[aria-hidden='true']")
      expect(tile?.className, section.label).toContain(`hue-${destinationHue(section.href)}`)
      expect(tile?.className).toContain("bg-hue-tint")
    }
  })
})
