import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import { contrastRatio, oklchToRgb, parseOklch, rgbToHex } from "@/lib/color/oklch"

/**
 * The palette is authored in OKLCH, which keeps lightness perceptually even
 * across hues and makes a tinted neutral ramp possible at all. It also means you
 * cannot read a contrast ratio off the tokens by eye: the brand at L 0.58 looked
 * fine and scored 4.43 against its own foreground, which fails AA for body text.
 * It is 0.55 because this test said so, not because it looked better.
 *
 * Guarding the pairs rather than every token, because a ratio only exists
 * between two colours and these are the ones the interface actually puts
 * together.
 */

const CSS = readFileSync(join(__dirname, "globals.css"), "utf8")
const THEMES_CSS = readFileSync(join(__dirname, "themes.css"), "utf8")

/**
 * Reads a token, from the :root or .dark block, falling back to the body block.
 *
 * The fallback is not tidiness. Everything the accent drives is declared on body
 * rather than :root, because a var() inside a custom property is substituted on
 * the element where it is DECLARED: written on :root it resolves against the
 * root accent and never sees the theme class on body. So --primary, --ring and
 * --selection genuinely live in a different block from the neutrals, and a
 * reader that only knows about :root reports them as missing.
 */
function token(name: string, mode: "light" | "dark"): string {
  const start = mode === "light" ? CSS.indexOf(":root {") : CSS.indexOf(".dark {")
  const block = CSS.slice(start, CSS.indexOf("\n}", start))
  let m = new RegExp(`--${name}:\\s*([^;]+);`).exec(block)
  if (!m) {
    const bodyStart = CSS.indexOf("\nbody {")
    if (bodyStart !== -1) {
      const bodyBlock = CSS.slice(bodyStart, CSS.indexOf("\n}", bodyStart))
      m = new RegExp(`--${name}:\\s*([^;]+);`).exec(bodyBlock)
    }
  }
  if (!m) throw new Error(`token --${name} not found in ${mode}`)
  const value = m[1].trim()
  // One level of indirection is enough: --ring is var(--brand) and nothing is
  // nested deeper than that.
  const ref = /^var\(--([a-z-]+)\)$/.exec(value)
  return ref ? token(ref[1], mode) : value
}

function rgb(name: string, mode: "light" | "dark") {
  const raw = token(name, mode)
  // The camp hues are the design direction's hex table verbatim.
  const hex = /^#([0-9a-f]{6})$/i.exec(raw)
  if (hex) {
    const n = parseInt(hex[1], 16)
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
  }
  const parsed = parseOklch(raw)
  if (!parsed) throw new Error(`--${name} in ${mode} is not oklch or hex: ${raw}`)
  return oklchToRgb(parsed.l, parsed.c, parsed.h)
}

// [foreground, background, minimum ratio, what it is]
//
// 4.5 is AA for body text. 3.0 is AA for large text and for the boundary of a
// user interface component, which is what a focus ring is.
const PAIRS: Array<[string, string, number, string]> = [
  ["foreground", "background", 4.5, "body text on the page"],
  ["foreground", "card", 4.5, "body text on a card"],
  ["muted-foreground", "background", 4.5, "secondary text, which is most of the interface"],
  ["muted-foreground", "card", 4.5, "secondary text on a card"],
  ["primary-foreground", "primary", 4.5, "the label on a primary button"],
  ["brand-foreground", "brand", 4.5, "the label on a brand surface"],
  ["primary", "background", 4.5, "a link or other text in the accent (--brand-text)"],
  ["brand-text", "card", 4.5, "a link on a card"],
  ["brand", "background", 3.0, "the accent as a marker: focus ring, selection, the logo"],
  ["destructive-foreground", "destructive", 4.5, "the label on a destructive button"],
  ["ring", "background", 3.0, "the focus ring, which is how a keyboard user knows where they are"],
  ["border", "background", 1.2, "a hairline has to be visible at all"],
  ["foreground", "canvas", 4.5, "navigation text on the canvas"],
  ["muted-foreground", "canvas", 4.5, "section labels and counts on the canvas"],
  ["agent", "agent-muted", 4.5, "an agent's tag and initials on its tinted ground"],
  ["agent", "background", 4.5, "agent-coloured text on the page"],
  ["agent-foreground", "agent", 4.5, "a label on a solid agent surface"],
  // A meaning as text is its -ink cut, never the fill: the light fills scored
  // 4.27 (success) and 4.10 (warning) as small text on the page.
  ["success-ink", "background", 4.5, "a success word on the page"],
  ["warning-ink", "background", 4.5, "a warning word on the page"],
  ["info-ink", "background", 4.5, "an info word on the page"],
  ["danger-ink", "background", 4.5, "a danger word on the page"],
  ["success-ink", "card", 4.5, "a success word on a card"],
  ["warning-ink", "card", 4.5, "a warning word on a card"],
  ["info-ink", "card", 4.5, "an info word on a card"],
  ["danger-ink", "card", 4.5, "a danger word on a card"],
]

describe.each(["light", "dark"] as const)("%s palette meets WCAG AA", (mode) => {
  it.each(PAIRS)("%s on %s", (fg, bg, min, what) => {
    const a = rgb(fg, mode)
    const b = rgb(bg, mode)
    const ratio = contrastRatio(a, b)
    expect(
      ratio,
      `${what}: --${fg} ${rgbToHex(a)} on --${bg} ${rgbToHex(b)} is ${ratio.toFixed(2)}:1, needs ${min}:1`,
    ).toBeGreaterThanOrEqual(min)
  })
})

/** A colour at `alpha` over a ground, as `bg-success/15` paints it. */
function over(fg: { r: number; g: number; b: number }, bg: { r: number; g: number; b: number }, alpha: number) {
  const mix = (a: number, b: number) => Math.round(a * alpha + b * (1 - alpha))
  return { r: mix(fg.r, bg.r), g: mix(fg.g, bg.g), b: mix(fg.b, bg.b) }
}

// Status pills and notices: the word in its -ink on its own fill's tint, up to
// the 20% the app uses under text, over the page and over a card.
describe.each(["light", "dark"] as const)("%s: a status word reads on its own tint", (mode) => {
  it.each([
    ["success-ink", "success"],
    ["warning-ink", "warning"],
    ["info-ink", "info"],
    ["danger-ink", "destructive"],
  ])("--%s on --%s", (ink, fill) => {
    for (const ground of ["background", "card"]) {
      for (const alpha of [0.1, 0.15, 0.2]) {
        const tint = over(rgb(fill, mode), rgb(ground, mode), alpha)
        const ratio = contrastRatio(rgb(ink, mode), tint)
        expect(ratio, `--${ink} on --${fill} at ${alpha * 100}% over --${ground}: ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5)
      }
    }
  })
})

/**
 * The camp palette (the playful layer): six identity hues in three cuts.
 *
 * The ink is text, so it reads at 4.5:1 on its own tint (a tag, a tile, an
 * avatar's initials) and on the page and a card. The strong cut is a graphic
 * (a dot, an icon, a chart line, a ring), so it holds 3:1 on every ground a
 * mark sits on: the page, a card, the canvas the sidebar's dots sit on, and
 * its own tint, where a tile puts its icon. Sun is the tightest, at 3.10 on
 * the canvas and on its tint in light mode: a lighter sun fails here first.
 */
const CAMP_HUES = ["sun", "moss", "lake", "sky", "dusk", "berry"] as const

describe.each(["light", "dark"] as const)("%s: the camp hues", (mode) => {
  it.each(CAMP_HUES)("%s: the ink reads on its own tint, the page and a card", (hue) => {
    for (const ground of [`camp-${hue}-tint`, "background", "card"]) {
      const ratio = contrastRatio(rgb(`camp-${hue}-ink`, mode), rgb(ground, mode))
      expect(ratio, `--camp-${hue}-ink on --${ground}: ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5)
    }
  })

  it.each(CAMP_HUES)("%s: the strong cut is a visible mark on the page, a card, the canvas and its tint", (hue) => {
    for (const ground of ["background", "card", "canvas", `camp-${hue}-tint`]) {
      const ratio = contrastRatio(rgb(`camp-${hue}`, mode), rgb(ground, mode))
      expect(ratio, `--camp-${hue} on --${ground}: ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(3)
    }
  })
})

describe("the neutrals are graphite, not shadcn grey", () => {
  // The neutrals carry a trace of a cool graphite hue (about 250 to 290, chroma
  // under 0.03): orange on graphite reads like an instrument panel, orange on
  // cream like a bakery. oklch(L 0 0) is the shadcn default and reads as
  // inherited; a warm hue drifting back would undo the swap one line at a time.
  // The card is exempt: pure white is the one neutral with no hue to carry.
  it.each(["background", "foreground", "muted", "muted-foreground", "border"])(
    "--%s carries the graphite hue",
    (name) => {
      for (const mode of ["light", "dark"] as const) {
        const parsed = parseOklch(token(name, mode))
        expect(parsed, `--${name} in ${mode} is not oklch`).not.toBeNull()
        expect(parsed!.c, `--${name} in ${mode} has zero chroma`).toBeGreaterThan(0)
        expect(parsed!.c, `--${name} in ${mode} is coloured, not a neutral`).toBeLessThan(0.03)
        expect(parsed!.h, `--${name} in ${mode} has left the graphite hue`).toBeGreaterThanOrEqual(240)
        expect(parsed!.h, `--${name} in ${mode} has left the graphite hue`).toBeLessThanOrEqual(290)
      }
    },
  )
})


/**
 * Every accent a person can pick, in both modes.
 *
 * The ten themes were solved rather than chosen: each sits as close to the
 * brand's own lightness as AA allows, which is why they read as a family. That
 * property only survives if something checks it, and a theme is exactly the kind
 * of thing added in a hurry with a hex that looked right.
 *
 * Both directions matter. An accent is text on the page (a link, an active item)
 * and it is also a ground under its own foreground (a selected row, a filled
 * button), and passing one does not imply passing the other.
 */
describe("every selectable accent meets WCAG AA", () => {
  const themes = [...THEMES_CSS.matchAll(/^\.theme-([a-z-]+) \{/gm)].map((m) => m[1])

  it("found the themes to check", () => {
    expect(themes.length).toBeGreaterThan(0)
  })

  it.each(themes)("%s", (name) => {
    for (const mode of ["light", "dark"] as const) {
      const block =
        mode === "light"
          ? THEMES_CSS.slice(THEMES_CSS.indexOf(`.theme-${name} {`))
          : THEMES_CSS.slice(THEMES_CSS.indexOf(`.dark .theme-${name}`))
      // The accent as text is --brand-text: a shade of its own in the house
      // theme, and the accent itself (var(--brand)) in every other.
      const blockEnd = block.indexOf("}")
      const own = /--brand-text:\s*(oklch\([^;]+\));/.exec(block.slice(0, blockEnd))
      const m = own ?? /--brand:\s*([^;]+);/.exec(block)
      expect(m, `.theme-${name} has no --brand in ${mode}`).not.toBeNull()
      const parsed = parseOklch(m![1].trim())
      expect(parsed, `.theme-${name} ${mode} --brand is not oklch`).not.toBeNull()
      const brand = oklchToRgb(parsed!.l, parsed!.c, parsed!.h)

      const bg = rgb("background", mode)
      const fg = rgb("brand-foreground", mode)

      const onPage = contrastRatio(brand, bg)
      const labelOnIt = contrastRatio(fg, brand)
      expect(
        onPage,
        `theme ${name} (${mode}): the accent as text is ${rgbToHex(brand)} on ${rgbToHex(bg)}, ${onPage.toFixed(2)}:1`,
      ).toBeGreaterThanOrEqual(4.5)
      expect(
        labelOnIt,
        `theme ${name} (${mode}): a label on the accent is ${rgbToHex(fg)} on ${rgbToHex(brand)}, ${labelOnIt.toFixed(2)}:1`,
      ).toBeGreaterThanOrEqual(4.5)
    }
  })
})
