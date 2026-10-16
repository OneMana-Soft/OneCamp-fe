import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import { contrastRatio, rgbToHex } from "@/lib/color/oklch"
import { BLOCK_COLOUR_NODES, COLOUR_LABEL, DOC_COLOURS, colourName, inkOf, isDocColour, tintOf, type DocColour } from "./docColours"

// The doc colours (B2, N15): stored by name, drawn by token, so a doc means
// the same in both themes, in the saved body, in an export and on another
// server. WAVE_B_CONTRACTS fixes the list, its order and its words.

describe("the doc colours", () => {
  it("are the seven names, in the grid's order, said as people say them", () => {
    expect(DOC_COLOURS).toEqual(["gray", "sun", "moss", "lake", "sky", "dusk", "berry"])
    expect(DOC_COLOURS.map((c) => COLOUR_LABEL[c])).toEqual(["Grey", "Yellow", "Green", "Teal", "Blue", "Purple", "Red"])
  })

  it("draw grey in ink-2 on the press step, and every other in its camp cuts", () => {
    expect(inkOf("gray")).toBe("var(--ink-2)")
    expect(tintOf("gray")).toBe("var(--press)")
    expect(inkOf("sky")).toBe("var(--camp-sky-ink)")
    expect(tintOf("berry")).toBe("var(--camp-berry-tint)")
  })

  it("are the names the editor stores, read back from a name or an old doc's CSS variable, and nothing else", () => {
    for (const c of DOC_COLOURS) {
      expect(colourName(c), c).toBe(c)
      expect(colourName(`var(--camp-${c}-ink)`), c).toBe(c)
    }
    expect(colourName("sky")).toBe("sky")
    expect(colourName(" Berry ")).toBe("berry")
    expect(colourName("var(--camp-moss-ink)")).toBe("moss")
    expect(colourName("var(--camp-lake-ink)")).toBe("lake")
    // Not ours: a paste's black or red would vanish or glare in one theme.
    for (const v of ["#e5484d", "rgb(0, 0, 0)", "red", "grey", "var(--camp-sky-tint)", "var(--camp-sky", "var(--ink)", "", null, 3]) expect(colourName(v), String(v)).toBeNull()
    expect(isDocColour("gray")).toBe(true)
    expect(isDocColour("grey")).toBe(false)
  })

  it("go on the blocks that have a line of their own", () => {
    expect(BLOCK_COLOUR_NODES).toEqual(["paragraph", "heading", "blockquote", "listItem", "taskItem", "collapsible"])
  })
})

// Every ink on every tint reaches 4.5:1 in both themes (PROGRAM B2's test):
// text colour and a highlight go together, and a coloured line sits on a
// block's background.
const CSS = readFileSync(join(__dirname, "../app/globals.css"), "utf8")

function token(name: string, mode: "light" | "dark"): string {
  const start = mode === "light" ? CSS.indexOf(":root {") : CSS.indexOf(".dark {")
  const block = CSS.slice(start, CSS.indexOf("\n}", start))
  const m = new RegExp(`\\s--${name}:\\s*([^;]+);`).exec(block)
  if (!m) throw new Error(`--${name} is not in the ${mode} theme`)
  const ref = /^var\(--([a-z0-9-]+)\)$/.exec(m[1].trim())
  return ref ? token(ref[1], mode) : m[1].trim()
}

type RGB = { r: number; g: number; b: number }
function paint(name: string, mode: "light" | "dark"): RGB {
  const raw = token(name, mode)
  const hex = /^#([0-9a-f]{6})$/i.exec(raw)
  if (hex) {
    const n = parseInt(hex[1], 16)
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
  }
  const alpha = /^rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)$/.exec(raw)
  if (!alpha) throw new Error(`--${name}: ${raw}`)
  // An alpha step (press) over the sheet, where a block sits.
  const sheet = paint("sheet", mode)
  const a = +alpha[4]
  const mix = (fg: number, bg: number) => Math.round(fg * a + bg * (1 - a))
  return { r: mix(+alpha[1], sheet.r), g: mix(+alpha[2], sheet.g), b: mix(+alpha[3], sheet.b) }
}

const varName = (css: string) => /^var\(--([a-z0-9-]+)\)$/.exec(css)![1]
const INKS: Array<[string, string]> = [["Default", "ink"], ...DOC_COLOURS.map((c: DocColour): [string, string] => [COLOUR_LABEL[c], varName(inkOf(c))])]
const GROUNDS: Array<[string, string]> = [["the page", "sheet"], ...DOC_COLOURS.map((c: DocColour): [string, string] => [`${COLOUR_LABEL[c]} background`, varName(tintOf(c))])]

describe.each(["light", "dark"] as const)("in the %s theme", (mode) => {
  it.each(INKS)("%s text reads on every background", (label, ink) => {
    for (const [ground, tint] of GROUNDS) {
      const ratio = contrastRatio(paint(ink, mode), paint(tint, mode))
      expect(ratio, `${label} (--${ink} ${rgbToHex(paint(ink, mode))}) on ${ground} (--${tint} ${rgbToHex(paint(tint, mode))}): ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5)
    }
  })
})
