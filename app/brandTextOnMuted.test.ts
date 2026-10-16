import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { contrastRatio, oklchToRgb, parseOklch, rgbToHex } from "@/lib/color/oklch"

/**
 * The accent's text on its own soft ground, in every theme and both modes.
 *
 * Design v3 pairs them on purpose: --brand-muted is the ground for "this is
 * about you" and --brand-text is how the accent is written on it. In a
 * conversation that is the row that mentions you (its time and the chip with
 * your name) and your own reaction's count. paletteContrast.test.ts checks the
 * accent's text on the page and ink on brand-muted, never the pair itself, and
 * in the blue, green, teal, amber, orange, slate, zinc and stone themes the
 * accent's text (the accent itself, at L .55) scored 4.2 to 4.5 on it: under
 * AA for the 12px time beside a name. Each theme's text is now its accent a
 * shade or two darker, which only raises its contrast on the page.
 */
const THEMES = readFileSync(join(__dirname, "themes.css"), "utf8")

type RGB = { r: number; g: number; b: number }

function colour(raw: string, brand?: RGB): RGB {
  const v = raw.trim()
  if (v === "var(--brand)" && brand) return brand
  const ok = parseOklch(v)
  if (ok) return oklchToRgb(ok.l, ok.c, ok.h)
  const hex = /^#([0-9a-f]{6})$/i.exec(v)
  if (hex) return { r: parseInt(hex[1].slice(0, 2), 16), g: parseInt(hex[1].slice(2, 4), 16), b: parseInt(hex[1].slice(4, 6), 16) }
  throw new Error(`can't read colour ${v}`)
}

function blocks(): { name: string; body: string }[] {
  const out: { name: string; body: string }[] = []
  for (const m of THEMES.matchAll(/((?:\.dark \.theme-[a-z]+,\s*)?\.theme-[a-z]+(?:\.dark)?)\s*\{([^}]*)\}/g)) {
    const name = m[1].replace(/\s+/g, " ")
    if (!/--brand-muted:/.test(m[2])) continue
    out.push({ name, body: m[2] })
  }
  return out
}

const token = (body: string, name: string) => new RegExp(`--${name}:\\s*([^;]+);`).exec(body)?.[1]

describe("the accent's text on its own soft ground", () => {
  const all = blocks()

  it("found every theme, light and dark", () => {
    expect(all.length).toBeGreaterThanOrEqual(20)
  })

  it.each(all.map((b) => [b.name, b.body]))("%s reads at AA", (name, body) => {
    const brand = colour(token(body, "brand")!)
    const text = colour(token(body, "brand-text") ?? "var(--brand)", brand)
    const muted = colour(token(body, "brand-muted")!)
    const ratio = contrastRatio(text, muted)
    expect(ratio, `${name}: ${rgbToHex(text)} on ${rgbToHex(muted)} is ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5)
  })
})
