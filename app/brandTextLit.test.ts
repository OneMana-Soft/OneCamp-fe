import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { VALID_COLOR_THEMES } from "@/components/activeTheme/activeTheme"
import { contrastRatio, oklchToRgb, parseOklch, rgbToHex, rgbToOklch } from "@/lib/color/oklch"

/**
 * The accent's text inside a highlighted item, in every theme the picker
 * offers, in both modes (V-955).
 *
 * A menu item's highlight (Radix's data-highlighted: the pointer over it or
 * the keys on it) lays two things over the menu's --pop: --press, and the
 * item's own tint, the accent at --ix-press-a (app/interaction.css). The
 * accent's text read 3.5-4.0:1 on that in the light themes, under AA for the
 * 13px "Remove the 25-person limit" in the workspace menu's plan row, and
 * 4.49:1 in the dark rose theme. Inside a highlighted item the accent leans
 * toward the ink instead: darker in light, lighter in dark. Every theme the
 * picker offers is checked, so a new one can't land under AA.
 */
const GLOBALS = readFileSync(join(__dirname, "globals.css"), "utf8")
const THEMES = readFileSync(join(__dirname, "themes.css"), "utf8")
const INTERACTION = readFileSync(join(__dirname, "interaction.css"), "utf8")

type RGB = { r: number; g: number; b: number }

function colour(raw: string): RGB {
  const v = raw.trim()
  const ok = parseOklch(v)
  if (ok) return oklchToRgb(ok.l, ok.c, ok.h)
  const hex = /^#([0-9a-f]{6})$/i.exec(v)
  if (hex) return { r: parseInt(hex[1].slice(0, 2), 16), g: parseInt(hex[1].slice(2, 4), 16), b: parseInt(hex[1].slice(4, 6), 16) }
  throw new Error(`can't read colour ${v}`)
}

/** A translucent layer, rgba(r, g, b, a), laid over a ground. */
const over = (top: RGB, alpha: number, ground: RGB): RGB => ({
  r: Math.round(top.r * alpha + ground.r * (1 - alpha)),
  g: Math.round(top.g * alpha + ground.g * (1 - alpha)),
  b: Math.round(top.b * alpha + ground.b * (1 - alpha)),
})

/** color-mix(in oklab, a share, b): the straight line between the two in OKLab. */
function mix(a: RGB, share: number, b: RGB): RGB {
  const lab = (c: RGB) => {
    const o = rgbToOklch(c)
    const h = (o.h * Math.PI) / 180
    return [o.l, o.c * Math.cos(h), o.c * Math.sin(h)]
  }
  const [p, q] = [lab(a), lab(b)]
  const [l, x, y] = p.map((v, i) => v * share + q[i] * (1 - share))
  return oklchToRgb(l, Math.hypot(x, y), ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360)
}

function rgba(raw: string): { rgb: RGB; a: number } {
  const m = /rgba\(\s*(\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\s*\)/.exec(raw)
  if (!m) throw new Error(`can't read ${raw}`)
  return { rgb: { r: +m[1], g: +m[2], b: +m[3] }, a: +m[4] }
}

/** A token's value in the first block of a selector that sets it. */
function tokenIn(css: string, selector: RegExp, name: string): string {
  for (const block of css.matchAll(new RegExp(`${selector.source}\\s*\\{([^}]*)\\}`, "gm"))) {
    const v = new RegExp(`--${name}:\\s*([^;]+);`).exec(block[1])?.[1]
    if (v) return v
  }
  throw new Error(`no --${name} in ${selector}`)
}

type Theme = { name: string; dark: boolean; brand: string }

/** Every theme the picker offers, in both modes, and the house values the page has before a theme class lands. */
function themes(): Theme[] {
  const out: Theme[] = []
  for (const dark of [false, true]) {
    for (const t of VALID_COLOR_THEMES) {
      const selector = dark ? new RegExp(`^\\.dark \\.theme-${t},\\s*\\.theme-${t}\\.dark`) : new RegExp(`^\\.theme-${t}`)
      out.push({ name: t, dark, brand: tokenIn(THEMES, selector, "brand") })
    }
    out.push({ name: "house default", dark, brand: tokenIn(GLOBALS, dark ? /^\.dark/ : /^:root/, "brand") })
  }
  return out
}

/** One mode's ink, and the highlight's ground: the menu, --press over it, the accent's tint over that. */
function modeOf(dark: boolean, brand: RGB) {
  const mode = dark ? /^\.dark/ : /^:root/
  const pop = colour(tokenIn(GLOBALS, mode, "pop"))
  const press = rgba(tokenIn(GLOBALS, mode, "press"))
  const tint = parseFloat(tokenIn(INTERACTION, mode, "ix-press-a")) / 100
  const pressed = over(press.rgb, press.a, pop)
  return { ink: colour(tokenIn(GLOBALS, mode, "ink")), pop, pressed, lit: over(brand, tint, pressed) }
}

/**
 * The rule: inside a highlighted item, in both modes, --brand-text is the
 * accent leaning toward the ink. Bare: it starts the file or follows a block's
 * "{", a rule's "}" or ";", or a comment, so a scoped selector can't pass.
 */
const RULE = /(?:^|[{};]|\*\/)\s*\[data-highlighted\]\s*\{\s*--brand-text:\s*color-mix\(in oklab, var\(--brand\) (\d+(?:\.\d+)?)%, var\(--ink\)\);\s*\}/

/** The heads of the blocks open at `at` ("@layer components", ".dark"), comments blanked. */
function blocksAt(css: string, at: number): string[] {
  const text = css.slice(0, at).replace(/\/\*[\s\S]*?\*\//g, (c) => " ".repeat(c.length))
  const open: number[] = []
  for (let i = 0; i < text.length; i++) if (text[i] === "{") open.push(i); else if (text[i] === "}") open.pop()
  return open.map((i) => text.slice(Math.max(text.lastIndexOf("{", i - 1), text.lastIndexOf("}", i - 1), text.lastIndexOf(";", i - 1)) + 1, i).trim())
}

/** The rule's share of the accent (%), when it is bare: matched, and only at-rules (@layer, @media) around it, no selector it nests in. */
function bareShare(css: string): number | undefined {
  const m = RULE.exec(css)
  return m && blocksAt(css, m.index + m[0].indexOf("[")).every((head) => head.startsWith("@")) ? parseFloat(m[1]) : undefined
}

describe("the accent's text inside a highlighted item", () => {
  const all = themes()

  it("checks every theme the picker offers, and the house default, in light and dark", () => {
    for (const dark of [false, true]) {
      expect(all.filter((t) => t.dark === dark).map((t) => t.name)).toEqual([...VALID_COLOR_THEMES, "house default"])
    }
  })

  it("leans the accent toward the ink inside a highlighted item, in both modes", () => {
    expect(GLOBALS).toMatch(RULE)
    expect(bareShare(GLOBALS)).toBeGreaterThan(0)
  })

  // CR-299: a scoped rule (":root:not(.dark) ...", the shape before V-955)
  // holds in one mode or one part only, and still matched. Only the bare rule
  // counts: at the start, or after a rule, a block or a comment.
  it("takes only the bare rule, never one scoped to a mode, a part or a list", () => {
    const bare = "[data-highlighted] { --brand-text: color-mix(in oklab, var(--brand) 80%, var(--ink)); }"
    for (const before of ["", "}\n", "@layer components {\n  ", "*/\n  "]) expect(before + bare).toMatch(RULE)
    for (const scope of [":root:not(.dark) ", ".dark ", ".shell-menu-item", "a,\n  ", ":root:not(.dark)\n  "]) {
      expect(`}\n  ${scope}${bare}`).not.toMatch(RULE)
    }
    // Nested in a selector's block (globals.css nests), it is scoped too.
    expect(bareShare(`@layer components {\n  /* { */\n  ${bare}\n}`)).toBe(80)
    expect(bareShare(`@layer components {\n  .dark {\n    ${bare}\n  }\n}`)).toBeUndefined()
  })

  it.each(all.map((t): [string, Theme] => [`${t.name}, ${t.dark ? "dark" : "light"}`, t]))("%s: reads at AA on the highlight, the press and the menu", (name, t) => {
    const share = (bareShare(GLOBALS) ?? 100) / 100
    const brand = colour(t.brand)
    const { ink: towards, pop, pressed, lit } = modeOf(t.dark, brand)
    const ink = mix(brand, share, towards)
    for (const [where, ground] of [["the highlight", lit], ["--press", pressed], ["the menu", pop]] as const) {
      const ratio = contrastRatio(ink, ground)
      expect(ratio, `${name}: ${rgbToHex(ink)} on ${where} ${rgbToHex(ground)} is ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5)
    }
  })
})
