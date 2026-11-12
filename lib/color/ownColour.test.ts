import { readFileSync, readdirSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { contrastRatio, hexToRgb, inSrgb, rgbToHex, rgbToOklch, oklchToRgb } from "@/lib/color/oklch"
import { isHex } from "@/lib/color/hex"
import { FILLS, MARK_MIN, OWN_CUT, SHEET, TEXT_AA, hexOf, mixOklab, ownColour } from "@/lib/color/ownColour"
import { ownHueVars } from "@/lib/color/ownHue"
import { PAD_LIGHTNESS, padColour, padPlace, padStep } from "@/lib/color/colourPad"

// More colours (calendar head B, DESIGN-BUILD-112): an event's own colour as a light and a dark cut, its words AA
// on every fill the calendar draws it at, its mark moved only to stand out on the sheet; the grid's CSS cuts it
// by the same numbers.
const rgb = (hex: string) => hexToRgb(hex)!
const ratio = (a: string, b: string) => contrastRatio(rgb(a), rgb(b))

function holds(hex: string): string[] {
  const c = ownColour(hex)
  if (!c) return [`${hex}: no colour`]
  const bad: string[] = []
  for (const theme of ["light", "dark"] as const) {
    const t = c[theme]
    const sheet = SHEET[theme]
    for (const f of FILLS) {
      const fill = mixOklab(t.tint, sheet, f)
      if (ratio(t.ink, fill) < TEXT_AA) bad.push(`${hex} ${theme}: words ${t.ink} on ${Math.round(f * 100)}% fill ${fill} at ${ratio(t.ink, fill).toFixed(2)}`)
    }
    if (ratio(t.ink, sheet) < TEXT_AA) bad.push(`${hex} ${theme}: words ${t.ink} on the sheet at ${ratio(t.ink, sheet).toFixed(2)}`)
    if (ratio(t.solid, sheet) < MARK_MIN) bad.push(`${hex} ${theme}: mark ${t.solid} on the sheet at ${ratio(t.solid, sheet).toFixed(2)}`)
  }
  return bad
}

describe("oklch both ways", () => {
  it("reads a hex and turns sRGB into OKLCH and back", () => {
    expect(hexToRgb("#3b7ddd")).toEqual({ r: 59, g: 125, b: 221 })
    expect(hexToRgb("#3B7DDD")).toEqual({ r: 59, g: 125, b: 221 })
    expect(hexToRgb("3b7ddd")).toBeNull()
    for (const hex of ["#3b7ddd", "#e0a030", "#ffffff", "#000000", "#7a1f5c", "#10b981"]) {
      const o = rgbToOklch(rgb(hex))
      expect(rgbToHex(oklchToRgb(o.l, o.c, o.h)), hex).toBe(hex)
    }
    expect(rgbToOklch(rgb("#ffffff")).l).toBeCloseTo(1, 3)
    expect(rgbToOklch(rgb("#000000")).l).toBeCloseTo(0, 3)
  })
})

describe("hexOf", () => {
  it("writes a typed colour one way, lower case with its #, or refuses it", () => {
    expect(hexOf("#3B7DDD")).toBe("#3b7ddd")
    expect(hexOf(" 3b7ddd ")).toBe("#3b7ddd")
    expect(hexOf("#3b7dd")).toBeNull()
    expect(hexOf("#gg0000")).toBeNull()
    expect(hexOf("red")).toBeNull()
    expect(hexOf("")).toBeNull()
  })
})

describe("a #rrggbb colour", () => {
  // CR-B19 row 2668, L2: the test was written four times (hexToRgb, hexOf, ownColour, ownHueVars); one serves all.
  it("is told by one test in lib/color, lib/color/hex", () => {
    const writers = readdirSync("lib/color")
      .filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f))
      .filter((f) => readFileSync(`lib/color/${f}`, "utf8").includes("[0-9a-f]{6}"))
    expect(writers).toEqual(["hex.ts"])
  })

  it("is six hex digits after a #, in either case, and nothing else", () => {
    expect(["#3b7ddd", "#3B7DDD", "#000000"].filter(isHex)).toEqual(["#3b7ddd", "#3B7DDD", "#000000"])
    expect(["3b7ddd", "#3b7dd", "#3b7ddd0", "#gg0000", " #3b7ddd", "", null, undefined].filter(isHex)).toEqual([])
  })
})

describe("ownColour", () => {
  it("keeps a colour that already reads in both themes as it is, its tint and words in its hue", () => {
    const c = ownColour("#3b7ddd")!
    expect(c.clamped).toEqual({ light: false, dark: false })
    expect(c.light.solid).toBe("#3b7ddd")
    expect(c.dark.solid).toBe("#3b7ddd")
    const hue = rgbToOklch(rgb("#3b7ddd")).h
    for (const t of [c.light.tint, c.light.ink, c.dark.tint, c.dark.ink]) expect(Math.abs(rgbToOklch(rgb(t)).h - hue), t).toBeLessThan(8)
    expect(holds("#3b7ddd")).toEqual([])
  })

  it("clamps a near white in the light theme and a near black in the dark one, and says so", () => {
    const white = ownColour("#fafafa")!
    expect(white.clamped.light).toBe(true)
    expect(white.light.solid).not.toBe("#fafafa")
    expect(ratio(white.light.solid, SHEET.light)).toBeGreaterThanOrEqual(MARK_MIN)
    const black = ownColour("#0a0a0a")!
    expect(black.clamped.dark).toBe(true)
    expect(black.dark.solid).not.toBe("#0a0a0a")
    expect(ratio(black.dark.solid, SHEET.dark)).toBeGreaterThanOrEqual(MARK_MIN)
    expect([...holds("#fafafa"), ...holds("#0a0a0a"), ...holds("#ffffff"), ...holds("#000000")]).toEqual([])
  })

  it("keeps AA for its words on every fill in both themes across the whole pad, greys and the corners", () => {
    const bad: string[] = []
    for (let hue = 0; hue < 360; hue += 10) {
      for (let l = PAD_LIGHTNESS.bottom; l <= PAD_LIGHTNESS.top + 1e-9; l += 0.05) bad.push(...holds(padColour(hue, l)))
    }
    for (const hex of ["#808080", "#ffff00", "#00ffff", "#ff00ff", "#0000ff", "#ff0000", "#00ff00", "#f5c518", "#1e3a8a"]) bad.push(...holds(hex))
    expect(bad).toEqual([])
  })

  it("has nothing for what isn't a colour", () => {
    expect(ownColour("sky")).toBeNull()
    expect(ownColour("")).toBeNull()
    expect(ownColour(undefined)).toBeNull()
    expect(ownHueVars("moss")).toBeNull()
  })

  it("hands the grid the colour alone, the one variable the hue-own class cuts both themes from", () => {
    expect(ownHueVars("#10B981")).toEqual({ "--own": "#10b981" })
  })

  it("cuts its tint and its ink inside sRGB for every hue, so no browser's gamut mapping moves them", () => {
    const out: string[] = []
    for (let h = 0; h < 360; h += 2) {
      for (const t of ["light", "dark"] as const) {
        const cut = OWN_CUT[t]
        if (!inSrgb(cut.tintL, cut.tintC, h)) out.push(`${t} tint at ${h}`)
        if (!inSrgb(cut.inkL, cut.inkC, h)) out.push(`${t} ink at ${h}`)
      }
    }
    expect(out).toEqual([])
  })

  it("is the rule the grid's CSS draws: app/globals.css cuts hue-own by OWN_CUT", () => {
    const css = readFileSync("app/globals.css", "utf8").replace(/\s+/g, " ")
    const { light: L, dark: D } = OWN_CUT
    const light = `.hue-own { --hue: oklch(from var(--own) min(l, ${L.solidMax}) c h); --hue-tint: oklch(from var(--own) ${L.tintL} min(c, ${L.tintC}) h); --hue-ink: oklch(from var(--own) ${L.inkL} min(c, ${L.inkC}) h); }`
    const dark = `.dark .hue-own { --hue: oklch(from var(--own) max(l, ${D.solidMin}) c h); --hue-tint: oklch(from var(--own) ${D.tintL} min(c, ${D.tintC}) h); --hue-ink: oklch(from var(--own) ${D.inkL} min(c, ${D.inkC}) h); }`
    expect(css).toContain(light)
    expect(css).toContain(dark)
  })
})

describe("the colour pad", () => {
  it("is light at the top and dark at the foot, in the hue across, and finds a colour's place again", () => {
    const top = rgbToOklch(rgb(padColour(250, PAD_LIGHTNESS.top)))
    const foot = rgbToOklch(rgb(padColour(250, PAD_LIGHTNESS.bottom)))
    expect(top.l).toBeGreaterThan(foot.l + 0.5)
    expect(Math.abs(rgbToOklch(rgb(padColour(250, 0.6))).h - 250)).toBeLessThan(4)
    const at = padPlace(padColour(140, 0.55))
    expect(Math.abs(at.hue - 140)).toBeLessThan(4)
    expect(at.lightness).toBeCloseTo(0.55, 1)
  })

  it("moves by the arrow keys, a bigger step with Shift, and stays on the pad", () => {
    const at = { hue: 200, lightness: 0.6 }
    expect(padStep(at, "ArrowRight")).toEqual({ hue: 205, lightness: 0.6 })
    expect(padStep(at, "ArrowLeft", true)).toEqual({ hue: 170, lightness: 0.6 })
    expect(padStep(at, "ArrowUp")!.lightness).toBeCloseTo(0.62, 5)
    expect(padStep(at, "ArrowDown", true)!.lightness).toBeCloseTo(0.5, 5)
    expect(padStep({ hue: 358, lightness: 0.6 }, "ArrowRight")).toEqual({ hue: 3, lightness: 0.6 })
    expect(padStep({ hue: 10, lightness: PAD_LIGHTNESS.top }, "ArrowUp")!.lightness).toBe(PAD_LIGHTNESS.top)
    expect(padStep(at, "Enter")).toBeNull()
  })
})
