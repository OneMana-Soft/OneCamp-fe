import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import { VALID_COLOR_THEMES } from "./activeTheme"

/**
 * Every theme the picker offers must actually exist in CSS.
 *
 * This guard exists because the feature was broken in two different ways at once
 * and neither was visible from the code.
 *
 * The first: slate, zinc and stone were in the picker for as long as the picker
 * existed and had no .theme-* block anywhere. Selecting one stored a preference,
 * synced it to the backend, moved the ring on the swatch, and changed nothing at
 * all on the screen. Three of ten choices were decoration.
 *
 * The second: the whole file was deleted as dead CSS during a palette pass,
 * because ActiveThemeProvider builds the class at runtime as
 * `theme-${activeTheme}` and a grep for a literal "theme-blue" finds nothing.
 * That took the remaining seven out too.
 *
 * Both are the same shape: a list in TypeScript and a list in CSS that nothing
 * forced to agree. This is the thing that forces them.
 */

const THEMES_CSS = readFileSync(join(__dirname, "..", "..", "app", "themes.css"), "utf8")
const GLOBALS_CSS = readFileSync(join(__dirname, "..", "..", "app", "globals.css"), "utf8")

describe("theme coverage", () => {
  it("defines every theme the picker offers", () => {
    const missing = VALID_COLOR_THEMES.filter((t) => !THEMES_CSS.includes(`.theme-${t} {`))
    expect(missing, `offered in the picker with no CSS, so selecting them does nothing: ${missing.join(", ")}`).toEqual([])
  })

  it("gives every theme a dark value too", () => {
    // A light accent reused on a dark ground is the mud problem the brand token
    // solves for itself; a theme that forgets it reintroduces it.
    const missing = VALID_COLOR_THEMES.filter((t) => !THEMES_CSS.includes(`.dark .theme-${t}`))
    expect(missing, `no dark accent, so these go muddy in dark mode: ${missing.join(", ")}`).toEqual([])
  })

  it("offers no theme the picker cannot reach", () => {
    // The old file carried nine blocks nothing could select: purple, red, yellow,
    // mono and four font swaps. Dead CSS is how a file stops being read.
    const defined = [...THEMES_CSS.matchAll(/^\.theme-([a-z-]+) \{/gm)].map((m) => m[1])
    const orphans = defined.filter((t) => !(VALID_COLOR_THEMES as readonly string[]).includes(t))
    expect(orphans, `defined but unreachable from the picker: ${orphans.join(", ")}`).toEqual([])
  })

  it("is actually imported, or none of it applies", () => {
    // The deletion removed the import as well, and nothing failed.
    expect(GLOBALS_CSS).toContain('@import "./themes.css"')
  })

  it("changes only the accent, never the neutrals", () => {
    // A theme that repaints the ground stops being an accent and starts being a
    // different product. The neutrals are the identity; --brand is the choice.
    const forbidden = ["--background:", "--foreground:", "--card:", "--border:", "--muted:", "--primary:", "--font-sans:"]
    const found = forbidden.filter((token) => THEMES_CSS.includes(token))
    expect(found, `themes may only set --brand and --brand-muted, found: ${found.join(", ")}`).toEqual([])
  })
})
