import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

// Chosen states are neutral (the standing design ruling): an ink ring and an
// ink check, never the accent. The theme picker's chosen card had an orange
// ring and an orange check on Light (DESIGN-BUILD-4, 22 Oct 2026). The accent
// swatches keep their ring: that row chooses the accent itself.

const CSS = readFileSync(join(__dirname, "..", "..", "app", "styles", "admin", "you.css"), "utf8")

/** The declarations of the first rule whose selector is exactly `selector`. */
function rule(selector: string): string {
  const at = CSS.indexOf(`${selector} {`)
  expect(at, `you.css has a rule for ${selector}`).toBeGreaterThanOrEqual(0)
  return CSS.slice(at + selector.length + 2, CSS.indexOf("}", at))
}

describe("the theme picker's chosen card", () => {
  it("is ringed in ink", () => {
    expect(rule('.you-theme[data-state="checked"] .you-theme-card')).toMatch(/outline-color:\s*var\(--foreground\)/)
  })

  it("carries an ink check", () => {
    expect(rule(".you-theme-check")).toMatch(/background:\s*var\(--foreground\)/)
  })

  it("wears no accent anywhere in the picker", () => {
    const picker = CSS.slice(CSS.indexOf(".you-themes {"), CSS.indexOf(".you-mini {"))
    expect(picker).not.toMatch(/--brand/)
  })
})
