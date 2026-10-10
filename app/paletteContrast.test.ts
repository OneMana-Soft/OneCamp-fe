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

/**
 * The theme's wash on the frame, in every theme and both modes.
 *
 * Choosing a theme washes the sidebar, the top bar and the phone's
 * navigation in a tint of its hue (app/themes.css), so everything that sits
 * on the frame has to stay readable on every wash: the sidebar's text (ink,
 * and text-2 for the quieter labels), the 2px accent bar of the current place
 * and the identity dots (sun is the tightest camp hue). The current place's
 * ground (brand-muted taken one step deeper with the accent, .nav-active) has
 * to be a visible step off the wash, with ink on it; the selection tint keeps
 * ink readable; and the moving edge of a progress bar holds 3:1 on its track.
 */
function themeToken(theme: string, mode: "light" | "dark", name: string): string {
  const head = mode === "light" ? `.theme-${theme} {` : `.dark .theme-${theme},`
  const at = THEMES_CSS.indexOf(head)
  const block = THEMES_CSS.slice(at, THEMES_CSS.indexOf("}", at))
  const m = new RegExp(`--${name}:\\s*([^;]+);`).exec(block)
  if (!m) throw new Error(`.theme-${theme} (${mode}) has no --${name}`)
  const ref = /^var\(--([a-z-]+)\)$/.exec(m[1].trim())
  return ref ? themeToken(theme, mode, ref[1]) : m[1].trim()
}

type RGB = { r: number; g: number; b: number }

function parseColour(raw: string): RGB {
  const hex = /^#([0-9a-f]{6})$/i.exec(raw)
  if (hex) {
    const n = parseInt(hex[1], 16)
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
  }
  const p = parseOklch(raw)
  if (!p) throw new Error(`not a colour: ${raw}`)
  return oklchToRgb(p.l, p.c, p.h)
}

const lin = (c: number) => {
  const s = c / 255
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}

/** sRGB to OKLab, for mixing as color-mix(in oklab) does and for a distance. */
function oklab({ r, g, b }: RGB): [number, number, number] {
  const [R, G, B] = [lin(r), lin(g), lin(b)]
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B)
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B)
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B)
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ]
}

function fromOklab([L, a, b]: [number, number, number]): RGB {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  const enc = (x: number) => {
    const c = Math.min(1, Math.max(0, x))
    return Math.round(255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055))
  }
  return {
    r: enc(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    g: enc(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    b: enc(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  }
}

/** color-mix(in oklab, a t, b): t of a, the rest b. */
function mixOklab(a: RGB, b: RGB, t: number): RGB {
  const [A, B] = [oklab(a), oklab(b)]
  return fromOklab([0, 1, 2].map((i) => A[i] * t + B[i] * (1 - t)) as [number, number, number])
}

const distance = (a: RGB, b: RGB) => Math.hypot(...oklab(a).map((v, i) => v - oklab(b)[i]))

describe("every theme's wash keeps the frame readable", () => {
  const themes = [...THEMES_CSS.matchAll(/^\.theme-([a-z-]+) \{/gm)].map((m) => m[1])

  it("covers all eleven themes", () => {
    expect(themes).toHaveLength(11)
  })

  it("is what the frame paints: the canvas and the sidebar take the wash on body", () => {
    const body = CSS.slice(CSS.indexOf("\nbody {"), CSS.indexOf("\n}", CSS.indexOf("\nbody {")))
    expect(body).toMatch(/--canvas:\s*var\(--brand-wash\);/)
    expect(body).toMatch(/--sidebar:\s*var\(--brand-wash\);/)
  })

  describe.each(["light", "dark"] as const)("%s", (mode) => {
    it.each(themes)("%s", (theme) => {
      const wash = parseColour(themeToken(theme, mode, "brand-wash"))
      const brand = parseColour(themeToken(theme, mode, "brand"))
      const muted = parseColour(themeToken(theme, mode, "brand-muted"))
      const at = (fg: RGB, bg: RGB) => contrastRatio(fg, bg)
      const say = (what: string, fg: RGB, bg: RGB) => `${theme} (${mode}): ${what}, ${rgbToHex(fg)} on ${rgbToHex(bg)}, ${at(fg, bg).toFixed(2)}:1`

      for (const text of ["foreground", "muted-foreground"]) {
        expect(at(rgb(text, mode), wash), say(`--${text} on the wash`, rgb(text, mode), wash)).toBeGreaterThanOrEqual(4.5)
      }
      expect(at(brand, wash), say("the accent bar on the wash", brand, wash)).toBeGreaterThanOrEqual(3)
      for (const hue of CAMP_HUES) {
        const dot = rgb(`camp-${hue}`, mode)
        expect(at(dot, wash), say(`a ${hue} identity dot on the wash`, dot, wash)).toBeGreaterThanOrEqual(3)
      }

      // The current place: .nav-active's ground.
      const active = mixOklab(brand, muted, 0.12)
      expect(at(rgb("foreground", mode), active), say("ink on the current place", rgb("foreground", mode), active)).toBeGreaterThanOrEqual(4.5)
      expect(distance(active, wash), `${theme} (${mode}): the current place is ${rgbToHex(active)} on the wash ${rgbToHex(wash)}, too close to see`).toBeGreaterThanOrEqual(0.04)

      // A sidebar glyph in its identity hue takes the ink cut where the row is
      // a step darker than the wash: the current place, and hover (.nav-idle,
      // ink at 6% over the wash). The strong cut is checked on the wash above.
      const hover = mixOklab(rgb("foreground", mode), wash, 0.06)
      for (const hue of CAMP_HUES) {
        const ink = rgb(`camp-${hue}-ink`, mode)
        expect(at(ink, active), say(`a ${hue} glyph on the current place`, ink, active)).toBeGreaterThanOrEqual(3)
        expect(at(ink, hover), say(`a ${hue} glyph on a hovered row`, ink, hover)).toBeGreaterThanOrEqual(3)
      }

      // Selected text: the accent at 26% under the text's own ink.
      const selected = over(brand, rgb("background", mode), 0.26)
      expect(at(rgb("foreground", mode), selected), say("selected text", rgb("foreground", mode), selected)).toBeGreaterThanOrEqual(4.5)

      // Progress: the deep stop leads, so the moving edge holds 3:1 on its track.
      const lead = parseColour(themeToken(theme, mode, "progress-to"))
      const track = rgb("sidebar-accent", mode)
      expect(at(lead, track), say("the leading edge of progress on its track", lead, track)).toBeGreaterThanOrEqual(3)
    })
  })
})
