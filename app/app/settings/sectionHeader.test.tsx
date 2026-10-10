import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { SectionHeader } from "./SectionHeader"

// Every settings section opens the same way: its tile in its hue, its name as
// the page's one h1, at the same place on the page. Four of the six had no
// heading at all, and their first line sat at a different height, so moving
// between sections jumped.
afterEach(cleanup)

describe("a settings section's header", () => {
  it("names the section in the page's h1, beside its tile in the section's hue", () => {
    render(<SectionHeader href="/app/settings/api-tokens" />)
    const h1 = screen.getByRole("heading", { level: 1 })
    expect(h1).toHaveAccessibleName("API tokens")
    expect(h1.querySelector("[class*='hue-']")?.className).toMatch(/\bhue-berry\b/)
  })

  it("opens every section page", () => {
    for (const page of ["notifications", "connectors", "workflows", "agents", "assistants", "api-tokens"]) {
      const src = readFileSync(resolve(__dirname, page, "page.tsx"), "utf8")
      expect(src, `${page}/page.tsx must open with SectionHeader`).toMatch(/<SectionHeader\b/)
      // The frame (width and spacing) is the layout's, so no page sets its own.
      expect(src, `${page}/page.tsx must not set its own container`).not.toMatch(/\bcontainer\b|max-w-3xl/)
    }
  })
})
