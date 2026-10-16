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
 *
 * Design v3 writes the shadcn names as aliases of its own surfaces and inks
 * (--background: var(--sheet)), so var() is followed as far as it goes.
 */
function token(name: string, mode: "light" | "dark"): string {
  const start = mode === "light" ? CSS.indexOf(":root {") : CSS.indexOf(".dark {")
  const block = CSS.slice(start, CSS.indexOf("\n}", start))
  let m = new RegExp(`\\s--${name}:\\s*([^;]+);`).exec(block)
  if (!m) {
    const bodyStart = CSS.indexOf("\nbody {")
    if (bodyStart !== -1) {
      const bodyBlock = CSS.slice(bodyStart, CSS.indexOf("\n}", bodyStart))
      m = new RegExp(`\\s--${name}:\\s*([^;]+);`).exec(bodyBlock)
    }
  }
  if (!m) throw new Error(`token --${name} not found in ${mode}`)
  const value = m[1].trim()
  const ref = /^var\(--([a-z0-9-]+)\)$/.exec(value)
  return ref ? token(ref[1], mode) : value
}

type RGB = { r: number; g: number; b: number }
type RGBA = RGB & { a: number }

/** A token's colour: hex, rgba() (design v3's alpha lines) or oklch(). */
function rgba(raw: string): RGBA {
  const hex = /^#([0-9a-f]{6})$/i.exec(raw)
  if (hex) {
    const n = parseInt(hex[1], 16)
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: 1 }
  }
  const alpha = /^rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)$/.exec(raw)
  if (alpha) return { r: +alpha[1], g: +alpha[2], b: +alpha[3], a: +alpha[4] }
  const parsed = parseOklch(raw)
  if (!parsed) throw new Error(`not hex, rgba or oklch: ${raw}`)
  return { ...oklchToRgb(parsed.l, parsed.c, parsed.h), a: 1 }
}

/** A colour at `alpha` over a ground, as `bg-success/15` or an alpha line paints it. */
function over(fg: RGB, bg: RGB, alpha: number): RGB {
  const mix = (a: number, b: number) => Math.round(a * alpha + b * (1 - alpha))
  return { r: mix(fg.r, bg.r), g: mix(fg.g, bg.g), b: mix(fg.b, bg.b) }
}

/**
 * A token as painted. An alpha token (a hairline, a hover) is composited over
 * the sheet, which is where it is measured from; an opaque one is itself.
 */
function rgb(name: string, mode: "light" | "dark", ground = "sheet"): RGB {
  const c = rgba(token(name, mode))
  if (c.a === 1) return { r: c.r, g: c.g, b: c.b }
  return over(c, rgb(ground, mode), c.a)
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
  // Design v3's alpha hairline is lighter than the hex one it replaced (it
  // is ink at 7.5%), and it still has to be there.
  ["border", "background", 1.1, "a hairline has to be visible at all"],
  ["foreground", "frame", 4.5, "navigation text on the frame"],
  ["muted-foreground", "frame", 4.5, "nav labels on the frame (ink-2)"],
  ["foreground", "sunken", 4.5, "text in a group header, a column, a comment card"],
  ["muted-foreground", "sunken", 4.5, "secondary text on the sunken surface"],
  ["foreground", "pop", 4.5, "a menu item"],
  ["muted-foreground", "pop", 4.5, "a menu item's secondary text"],
  // ink-3 is meta text (timestamps, counts, the agent provenance line): it
  // reads at AA since D-SD4 (13 Oct 2026). It was 3:1, the floor for a glyph.
  // Every ink on every surface and state is in inkContrast.test.ts.
  ["ink-3", "background", 4.5, "a timestamp on the sheet, the chat surface"],
  ["ink-3", "frame", 4.5, "meta text on the bare frame"],
  ["agent-ink", "agent-muted", 4.5, "an agent's tag on its tinted ground (agent-i on agent-t)"],
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

describe("the neutrals are cool graphite, never warm", () => {
  // Design v3, principle 5: warmth is light, not tint, and the greys stay cool.
  // The frame was a warm wash (hue 55 to 65) that read as beige in light and
  // coffee-brown in dark; it is retired, and a warm hue drifting back into a
  // neutral would undo that one line at a time. A neutral either has no hue
  // (the white sheet) or a cool one (about 250 to 290), and never more chroma
  // than a neutral carries.
  const NEUTRALS = ["frame", "sheet", "sunken", "raised", "pop", "panel", "ink", "ink-2", "ink-3", "ink-4"]
  it.each(NEUTRALS)("--%s stays a cool neutral", (name) => {
    for (const mode of ["light", "dark"] as const) {
      const { l, c, h } = toOklch(rgb(name, mode))
      expect(c, `--${name} in ${mode} is coloured, not a neutral`).toBeLessThan(0.03)
      if (c > 0.004 && l < 0.995) {
        expect(h, `--${name} in ${mode} has drifted warm (hue ${h.toFixed(0)})`).toBeGreaterThanOrEqual(240)
        expect(h, `--${name} in ${mode} has drifted warm (hue ${h.toFixed(0)})`).toBeLessThanOrEqual(300)
      }
    }
  })

  it("draws hairlines, hovers and selection in ink at a low alpha, so one token reads on every surface", () => {
    for (const mode of ["light", "dark"] as const) {
      for (const name of ["line", "line-2", "line-3", "hover", "press", "sel"]) {
        const c = rgba(token(name, mode))
        expect(c.a, `--${name} in ${mode} is not an alpha`).toBeLessThan(0.25)
      }
    }
  })
})

/**
 * The avatar cut (design v3, §3.5): two gradient stops per hue, a1 at OKLCH L
 * .60 to a2 at .49, under white initials. The initials have to read where
 * they sit, which is the middle of the disc: 4.5:1 there. At the lighter stop
 * it measures 3.75 (moss) to 4.3:1, a touch under the spec's "4.0 to 4.3"; a
 * corner of the disc, never where the letters are, so the floor there is 3.7.
 * The cut is the same in both modes.
 */
describe("the avatar cut puts white initials on a saturated face", () => {
  const WHITE = { r: 255, g: 255, b: 255 }
  it.each([...CAMP_HUES.map((h) => `camp-${h}`), "agent"])("%s", (hue) => {
    const a1 = rgb(`${hue}-a1`, "light")
    const a2 = rgb(`${hue}-a2`, "light")
    const mid = mixOklab(a1, a2, 0.5)
    expect(contrastRatio(WHITE, mid), `white on the middle of --${hue}`).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(WHITE, a1), `white on --${hue}-a1`).toBeGreaterThanOrEqual(3.7)
    expect(contrastRatio(WHITE, a2), `white on --${hue}-a2`).toBeGreaterThanOrEqual(5.5)
  })
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
 * The frame, in every theme and both modes (design v3, §3.2 and §3.4).
 *
 * The frame is neutral graphite now, and the theme shows as its light (the
 * glow, glowHue.test.ts) and as the accent on state. What sits on the frame
 * has to stay readable in every theme: the accent of the selected nav icon on
 * the raised chip, the selected chip as a visible step off the frame, the
 * selection tint under ink, a mention row on brand-muted, and the moving edge
 * of a progress bar on its track (--press).
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

function parseColour(raw: string): RGB {
  const c = rgba(raw)
  return { r: c.r, g: c.g, b: c.b }
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

function toOklch(c: RGB): { l: number; c: number; h: number } {
  const [L, a, b] = oklab(c)
  const h = (Math.atan2(b, a) * 180) / Math.PI
  return { l: L, c: Math.hypot(a, b), h: h < 0 ? h + 360 : h }
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

describe("every theme keeps the frame readable", () => {
  const themes = [...THEMES_CSS.matchAll(/^\.theme-([a-z-]+) \{/gm)].map((m) => m[1])

  it("covers all eleven themes", () => {
    expect(themes).toHaveLength(11)
  })

  it("paints the frame neutral: the canvas and the sidebar are the frame, never a theme's wash", () => {
    for (const mode of ["light", "dark"] as const) {
      expect(token("canvas", mode)).toBe(token("frame", mode))
      expect(token("sidebar", mode)).toBe(token("frame", mode))
    }
    expect(THEMES_CSS).not.toMatch(/--brand-wash:/)
    expect(CSS).not.toMatch(/--brand-wash:/)
  })

  describe.each(["light", "dark"] as const)("%s", (mode) => {
    it.each(themes)("%s", (theme) => {
      const brand = parseColour(themeToken(theme, mode, "brand"))
      const muted = parseColour(themeToken(theme, mode, "brand-muted"))
      const frame = rgb("frame", mode)
      const chip = rgb("raised", mode)
      const at = (fg: RGB, bg: RGB) => contrastRatio(fg, bg)
      const say = (what: string, fg: RGB, bg: RGB) => `${theme} (${mode}): ${what}, ${rgbToHex(fg)} on ${rgbToHex(bg)}, ${at(fg, bg).toFixed(2)}:1`

      // The current place: the raised chip, its icon in the accent.
      expect(at(brand, chip), say("the selected nav icon on the raised chip", brand, chip)).toBeGreaterThanOrEqual(3)
      expect(at(rgb("foreground", mode), chip), say("ink on the selected chip", rgb("foreground", mode), chip)).toBeGreaterThanOrEqual(4.5)

      // "This is about you": a mention row and the selected task row.
      expect(at(rgb("foreground", mode), muted), say("ink on brand-muted", rgb("foreground", mode), muted)).toBeGreaterThanOrEqual(4.5)
      expect(distance(muted, rgb("sheet", mode)), `${theme} (${mode}): brand-muted ${rgbToHex(muted)} is too close to the sheet to see`).toBeGreaterThanOrEqual(0.015)

      // Selected text: the accent at 22% under the text's own ink.
      const selected = mixOklab(brand, rgb("background", mode), 0.22)
      expect(at(rgb("foreground", mode), selected), say("selected text", rgb("foreground", mode), selected)).toBeGreaterThanOrEqual(4.5)

      // Progress: the deep stop leads, so the moving edge holds 3:1 on its track.
      const lead = parseColour(themeToken(theme, mode, "progress-to"))
      const track = rgb("press", mode)
      expect(at(lead, track), say("the leading edge of progress on its track", lead, track)).toBeGreaterThanOrEqual(3)

      // The frame itself is the same in every theme: the theme is light on it.
      expect(rgbToHex(frame)).toBe(rgbToHex(rgb("frame", mode)))
    })
  })

  it("lifts the selected chip off the frame: a visible step, in both modes", () => {
    for (const mode of ["light", "dark"] as const) {
      expect(distance(rgb("raised", mode), rgb("frame", mode)), `${mode}: the raised chip is lost on the frame`).toBeGreaterThanOrEqual(0.03)
    }
  })
})
