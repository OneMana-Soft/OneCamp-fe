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

  it("changes only the accent and the frame's wash, never the neutrals", () => {
    // A theme that repaints the page stops being a theme and starts being a
    // different product. The neutrals and the sheet are the identity; the
    // accent and the wash on the frame round the sheet are the choice.
    const forbidden = ["--background:", "--foreground:", "--card:", "--border:", "--muted:", "--primary:", "--font-sans:"]
    const found = forbidden.filter((token) => THEMES_CSS.includes(token))
    expect(found, `themes may only set the theme tokens, found: ${found.join(", ")}`).toEqual([])
  })

  /**
   * Every theme sets every theme token, in light and in dark.
   *
   * A token one theme forgets is not "unset": it inherits whatever the theme
   * before it, or :root, left behind, so a blue theme quietly shows the house
   * orange's progress gradient or a dark wash on a light page. The house
   * theme's light block is the list.
   */
  function block(theme: string, mode: "light" | "dark"): string {
    const head = mode === "light" ? `.theme-${theme} {` : `.dark .theme-${theme},`
    const at = THEMES_CSS.indexOf(head)
    return at < 0 ? "" : THEMES_CSS.slice(at, THEMES_CSS.indexOf("}", at))
  }
  const names = (css: string) => [...css.matchAll(/(--[a-z-]+):/g)].map((m) => m[1])
  const TOKENS = names(block("onecamp", "light"))

  it("lists the theme tokens from the house theme", () => {
    expect(TOKENS).toEqual(["--brand", "--brand-text", "--brand-muted", "--brand-wash", "--progress-from", "--progress-to"])
  })

  it.each(VALID_COLOR_THEMES)("%s sets every theme token in light and dark", (theme) => {
    for (const mode of ["light", "dark"] as const) {
      const got = names(block(theme, mode))
      const missing = TOKENS.filter((t) => !got.includes(t))
      expect(missing, `${theme} (${mode}) does not set ${missing.join(", ")}`).toEqual([])
    }
  })
})
