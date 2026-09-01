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

/** Reads a token out of the :root or .dark block. */
function token(name: string, mode: "light" | "dark"): string {
  const start = mode === "light" ? CSS.indexOf(":root {") : CSS.indexOf(".dark {")
  const block = CSS.slice(start, CSS.indexOf("\n}", start))
  const m = new RegExp(`--${name}:\\s*([^;]+);`).exec(block)
  if (!m) throw new Error(`token --${name} not found in ${mode}`)
  const value = m[1].trim()
  // One level of indirection is enough: --ring is var(--brand) and nothing is
  // nested deeper than that.
  const ref = /^var\(--([a-z-]+)\)$/.exec(value)
  return ref ? token(ref[1], mode) : value
}

function rgb(name: string, mode: "light" | "dark") {
  const raw = token(name, mode)
  const parsed = parseOklch(raw)
  if (!parsed) throw new Error(`--${name} in ${mode} is not oklch: ${raw}`)
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
  ["brand", "background", 4.5, "a link or an active item in the accent"],
  ["destructive-foreground", "destructive", 4.5, "the label on a destructive button"],
  ["ring", "background", 3.0, "the focus ring, which is how a keyboard user knows where they are"],
  ["border", "background", 1.2, "a hairline has to be visible at all"],
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

describe("the neutrals are tinted, not grey", () => {
  // The whole diagnosis was that every neutral was oklch(L 0 0): grey with no
  // colour in it, which is the shadcn default and reads as inherited. A token
  // that drifts back to zero chroma undoes the identity one line at a time.
  it.each(["background", "foreground", "muted", "muted-foreground", "border", "card"])(
    "--%s carries the brand's hue",
    (name) => {
      for (const mode of ["light", "dark"] as const) {
        const parsed = parseOklch(token(name, mode))
        expect(parsed, `--${name} in ${mode} is not oklch`).not.toBeNull()
        expect(
          parsed!.c,
          `--${name} in ${mode} has zero chroma, which is the shadcn default grey`,
        ).toBeGreaterThan(0)
      }
    },
  )
})
