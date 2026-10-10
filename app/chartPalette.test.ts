import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

/**
 * The chart series palette (--chart-1..5 in globals.css), measured.
 *
 * The method and thresholds are the dataviz skill's validator: distance is
 * Euclidean in OKLab x100, colour blindness is simulated with Machado,
 * Oliveira & Fernandes (2009) at full severity, and the thresholds are
 * calibrated to that model:
 *   - adjacent series (bars, stacks, lines) >= 8 apart for protan and deutan,
 *     and >= 15 apart under normal vision;
 *   - the first three as a set (pie, scatter, where any two can touch) clear
 *     the same floors on every pair;
 *   - every series holds 3:1 against the card it is drawn on (WCAG 1.4.11);
 *   - none is the brand accent's hue, so a series never reads as "selected".
 */
const css = readFileSync(resolve(__dirname, "globals.css"), "utf8")

function chartTokens(block: string): string[] {
  return [1, 2, 3, 4, 5].map((n) => {
    const m = block.match(new RegExp(`--chart-${n}:\\s*(#[0-9a-fA-F]{6})`))
    if (!m) throw new Error(`--chart-${n} is not a hex colour in this block`)
    return m[1]
  })
}
const rootBlock = css.slice(css.indexOf(":root {"), css.indexOf("\n}", css.indexOf(":root {")))
const darkBlock = css.slice(css.indexOf(".dark {"), css.indexOf("\n}", css.indexOf(".dark {")))
const LIGHT = chartTokens(rootBlock)
const DARK = chartTokens(darkBlock)
const SURFACE = { light: "#ffffff", dark: "#16181c" } // --card in each mode
const BRAND = { light: "#cc4a0b", dark: "#ff7a33" }

const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
const toLin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
const lin = (h: string) => hex(h).map(toLin)
const lum = (h: string) => { const [r, g, b] = lin(h); return 0.2126 * r + 0.7152 * g + 0.0722 * b }
const contrast = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05) }
function oklab([r, g, b]: number[]) {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s]
}
const MACHADO = {
  protan: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  deutan: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.01182, 0.04294, 0.968881]],
}
const sim = (h: string, k?: keyof typeof MACHADO) => {
  const v = lin(h)
  if (!k) return v
  return MACHADO[k].map((row) => Math.max(0, Math.min(1, row[0] * v[0] + row[1] * v[1] + row[2] * v[2])))
}
const dE = (a: string, b: string, k?: keyof typeof MACHADO) => {
  const p = oklab(sim(a, k)), q = oklab(sim(b, k))
  return 100 * Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2])
}
const hue = (h: string) => { const [, a, b] = oklab(lin(h)); return ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360 }

const adjacent = (n: number) => Array.from({ length: n - 1 }, (_, i) => [i, i + 1])
const allPairs = (n: number) => Array.from({ length: n }, (_, i) => Array.from({ length: n - i - 1 }, (_, k) => [i, i + 1 + k])).flat()

for (const [mode, palette] of [["light", LIGHT], ["dark", DARK]] as const) {
  describe(`chart palette, ${mode}`, () => {
    it("has five distinct hues, not steps of one", () => {
      for (const [i, j] of allPairs(5)) {
        const d = Math.abs(hue(palette[i]) - hue(palette[j]))
        expect(Math.min(d, 360 - d), `${palette[i]} vs ${palette[j]}`).toBeGreaterThan(25)
      }
    })

    it("keeps adjacent series apart under protanopia and deuteranopia (dE >= 8)", () => {
      for (const [i, j] of adjacent(5)) for (const k of ["protan", "deutan"] as const)
        expect(dE(palette[i], palette[j], k), `${palette[i]} vs ${palette[j]} (${k})`).toBeGreaterThanOrEqual(8)
    })

    it("keeps adjacent series apart under normal vision (dE >= 15)", () => {
      for (const [i, j] of adjacent(5)) expect(dE(palette[i], palette[j]), `${palette[i]} vs ${palette[j]}`).toBeGreaterThanOrEqual(15)
    })

    it("keeps the first three apart as a set, for pie and scatter", () => {
      for (const [i, j] of allPairs(3)) {
        expect(dE(palette[i], palette[j])).toBeGreaterThanOrEqual(15)
        for (const k of ["protan", "deutan"] as const) expect(dE(palette[i], palette[j], k)).toBeGreaterThanOrEqual(8)
      }
    })

    it("holds 3:1 against the card", () => {
      for (const h of palette) expect(contrast(h, SURFACE[mode]), h).toBeGreaterThanOrEqual(3)
    })

    it("does not lead with, or use, the brand accent's hue", () => {
      for (const h of palette) expect(Math.abs(hue(h) - hue(BRAND[mode])), h).toBeGreaterThan(15)
    })
  })
}

/**
 * The series SvgChart actually draws: the camp hues in the playful layer's
 * order (components/charts SERIES_HUES). Measured with the dataviz skill's
 * validator, whose floors are the ones held here: adjacent pairs at 15 or more
 * under normal vision (a hard floor), and 6 or more under protanopia and
 * deuteranopia, which it allows only with secondary encoding (SvgChart draws a
 * legend for two series or more, and gaps between fills). 8 is the target;
 * moss beside sun (6.3, protan, light) and berry beside lake (6.5, deutan,
 * dark) sit in the band below it.
 */
const SERIES = ["sky", "moss", "sun", "dusk", "berry", "lake"] as const
function campTokens(block: string): string[] {
  return SERIES.map((h) => {
    const m = block.match(new RegExp(`--camp-${h}:\\s*(#[0-9a-fA-F]{6})`))
    if (!m) throw new Error(`--camp-${h} is not a hex colour in this block`)
    return m[1]
  })
}
for (const [mode, palette] of [["light", campTokens(rootBlock)], ["dark", campTokens(darkBlock)]] as const) {
  describe(`chart series (camp hues), ${mode}`, () => {
    it("draws them in the playful layer's order", async () => {
      const { SERIES_HUES } = await import("@/components/charts/SvgChart")
      expect([...SERIES_HUES]).toEqual([...SERIES])
    })
    it("keeps adjacent series apart under normal vision (dE >= 15)", () => {
      for (const [i, j] of adjacent(6)) expect(dE(palette[i], palette[j]), `${SERIES[i]} vs ${SERIES[j]}`).toBeGreaterThanOrEqual(15)
    })
    it("keeps adjacent series at least at the colour-blind floor (dE >= 6, with the legend and gaps)", () => {
      for (const [i, j] of adjacent(6)) for (const k of ["protan", "deutan"] as const)
        expect(dE(palette[i], palette[j], k), `${SERIES[i]} vs ${SERIES[j]} (${k})`).toBeGreaterThanOrEqual(6)
    })
    it("holds 3:1 against the card, and none is the brand accent's hue", () => {
      for (const h of palette) {
        expect(contrast(h, SURFACE[mode]), h).toBeGreaterThanOrEqual(3)
        expect(Math.abs(hue(h) - hue(BRAND[mode])), h).toBeGreaterThan(15)
      }
    })
  })
}
