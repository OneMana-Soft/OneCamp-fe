import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"
import { render } from "@testing-library/react"
import SvgChart from "@/components/charts/SvgChart"
import { normalizeChartSpec } from "@/lib/utils/chartSpec"
import { TABLE_CHART_HUES, TABLE_CHART_PALETTE } from "./tableChartPalette"

// The table chart's camp order, held to the chart guard's thresholds (the
// dataviz validator in app/chartPalette.test.ts): OKLab x100, Machado et al.
// at full severity, in both themes, against the card it is drawn on.
const css = readFileSync(resolve(__dirname, "../../app/globals.css"), "utf8")
const block = (sel: string) => css.slice(css.indexOf(sel), css.indexOf("\n}", css.indexOf(sel)))
const tokens = (b: string) => TABLE_CHART_HUES.map((h) => b.match(new RegExp(`--camp-${h}:\\s*(#[0-9a-fA-F]{6})`))![1])
const LIGHT = tokens(block(":root {"))
const DARK = tokens(block(".dark {"))
const CARD = { light: "#ffffff", dark: "#16181c" }

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
  return k ? MACHADO[k].map((row) => Math.max(0, Math.min(1, row[0] * v[0] + row[1] * v[1] + row[2] * v[2]))) : v
}
const dE = (a: string, b: string, k?: keyof typeof MACHADO) => {
  const p = oklab(sim(a, k)), q = oklab(sim(b, k))
  return 100 * Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2])
}

for (const [mode, pal] of [["light", LIGHT], ["dark", DARK]] as const) {
  describe(`a table chart's colours, ${mode}`, () => {
    it("keeps neighbouring series apart for everyone", () => {
      for (let i = 0; i < pal.length - 1; i++) {
        expect(dE(pal[i], pal[i + 1]), `${TABLE_CHART_HUES[i]} vs ${TABLE_CHART_HUES[i + 1]}`).toBeGreaterThanOrEqual(15)
        for (const k of ["protan", "deutan"] as const)
          expect(dE(pal[i], pal[i + 1], k), `${TABLE_CHART_HUES[i]} vs ${TABLE_CHART_HUES[i + 1]} (${k})`).toBeGreaterThanOrEqual(8)
      }
    })
    it("keeps the first three apart as a set, for a pie", () => {
      for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) {
        expect(dE(pal[i], pal[j])).toBeGreaterThanOrEqual(15)
        for (const k of ["protan", "deutan"] as const) expect(dE(pal[i], pal[j], k)).toBeGreaterThanOrEqual(8)
      }
    })
    it("holds 3:1 on the card", () => {
      for (const c of pal) expect(contrast(c, CARD[mode]), c).toBeGreaterThanOrEqual(3)
    })
  })
}

describe("SvgChart's palette", () => {
  it("draws a chart given a palette in it, and one given none in the calm default", () => {
    const chart = normalizeChartSpec({ type: "pie", labels: ["A", "B"], series: [{ name: "n", values: [2, 1] }] })!
    const camp = render(<SvgChart chart={chart} palette={TABLE_CHART_PALETTE} />).container
    expect(camp.querySelector("path")?.getAttribute("fill")).toBe("var(--camp-sky)")
    const calm = render(<SvgChart chart={chart} />).container
    expect(calm.querySelector("path")?.getAttribute("fill")).toBe("var(--info)")
  })
})
