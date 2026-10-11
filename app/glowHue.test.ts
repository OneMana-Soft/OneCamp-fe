import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import { parseOklch } from "@/lib/color/oklch"

/**
 * THE CAMPFIRE GLOW (design v3, §3.2 and §3.4). The frame is neutral graphite,
 * and a theme shows as light on it: --glow, a radial of the theme's hue behind
 * the workspace mark, and --glow2, a fainter second light low down. They are
 * RGB triples so the frame can paint them at its own alphas.
 *
 * The glow has to BE the theme. Blue has to read blue and violet violet
 * (shots-v3/channel-1440-light-blue.png), so each glow's hue sits near its
 * accent's own OKLCH hue: within 20 degrees for the main light, 30 for the
 * second, which the spec lets drift (green's second light leans to teal). The
 * three near-neutral themes (slate, zinc, stone) glow near-neutral too, or a
 * grey accent would come with a coloured frame. And the frame paints them on
 * the .app-frame only, at the spec's alphas, never on the sheet.
 */
const ROOT = join(__dirname, "..")
const THEMES = readFileSync(join(ROOT, "app/themes.css"), "utf8")
const GLOBALS = readFileSync(join(ROOT, "app/globals.css"), "utf8")

const lin = (c: number) => {
  const s = c / 255
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}
function oklch([r, g, b]: number[]): { c: number; h: number } {
  const [R, G, B] = [lin(r), lin(g), lin(b)]
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B)
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B)
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B)
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  const h = (Math.atan2(bb, a) * 180) / Math.PI
  return { c: Math.hypot(a, bb), h: h < 0 ? h + 360 : h }
}
const hueGap = (a: number, b: number) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b))

function block(theme: string, mode: "light" | "dark"): string {
  const head = mode === "light" ? `.theme-${theme} {` : `.dark .theme-${theme},`
  const at = THEMES.indexOf(head)
  return THEMES.slice(at, THEMES.indexOf("}", at))
}
function triple(css: string, name: string): number[] {
  const m = new RegExp(`--${name}:\\s*(\\d+) (\\d+) (\\d+);`).exec(css)
  expect(m, `--${name} is an RGB triple`).not.toBeNull()
  return [Number(m![1]), Number(m![2]), Number(m![3])]
}

const themes = [...THEMES.matchAll(/^\.theme-([a-z-]+) \{/gm)].map((m) => m[1])

describe("the campfire glow", () => {
  it("finds all eleven themes", () => {
    expect(themes).toHaveLength(11)
  })

  it.each(themes)("%s glows in its own accent's hue, in light and dark", (theme) => {
    for (const mode of ["light", "dark"] as const) {
      const css = block(theme, mode)
      const accent = parseOklch(/--brand:\s*(oklch\([^;]+\));/.exec(css)![1])!
      const glow = oklch(triple(css, "glow"))
      const glow2 = oklch(triple(css, "glow2"))
      if (accent.c < 0.05) {
        // A near-neutral accent: a near-neutral light.
        expect(glow.c, `${theme} (${mode}): --glow is coloured for a grey accent`).toBeLessThan(0.05)
        expect(glow2.c, `${theme} (${mode}): --glow2 is coloured for a grey accent`).toBeLessThan(0.05)
        continue
      }
      expect(hueGap(glow.h, accent.h), `${theme} (${mode}): --glow hue ${glow.h.toFixed(0)} vs accent ${accent.h.toFixed(0)}`).toBeLessThanOrEqual(20)
      expect(hueGap(glow2.h, accent.h), `${theme} (${mode}): --glow2 hue ${glow2.h.toFixed(0)} vs accent ${accent.h.toFixed(0)}`).toBeLessThanOrEqual(30)
      expect(glow.c, `${theme} (${mode}): --glow is too grey to show the theme`).toBeGreaterThan(0.1)
    }
  })

  it("is the spec's value for the six themes it names", () => {
    const want: Record<string, [string, string]> = {
      onecamp: ["255 110 30", "255 61 0"],
      blue: ["40 130 230", "40 90 200"],
      green: ["40 170 90", "20 130 110"],
      violet: ["130 90 230", "90 70 200"],
      rose: ["230 80 110", "200 50 90"],
      slate: ["110 120 140", "90 100 120"],
    }
    for (const [theme, [g, g2]] of Object.entries(want)) {
      for (const mode of ["light", "dark"] as const) {
        expect(triple(block(theme, mode), "glow").join(" "), `${theme} --glow`).toBe(g)
        expect(triple(block(theme, mode), "glow2").join(" "), `${theme} --glow2`).toBe(g2)
      }
    }
  })

  it("is painted on the frame only, at the spec's alphas, and the grain gives way to reduced transparency", () => {
    const rule = (sel: string) => {
      const at = GLOBALS.indexOf(`${sel} {`)
      expect(at, `${sel} is defined`).toBeGreaterThan(-1)
      return GLOBALS.slice(at, GLOBALS.indexOf("}", GLOBALS.indexOf(";", at) + 1) + 1)
    }
    const light = GLOBALS.slice(GLOBALS.indexOf("  .app-frame::before {"), GLOBALS.indexOf("  .dark .app-frame::before {"))
    expect(light).toMatch(/radial-gradient\(760px 520px at -80px -100px, rgb\(var\(--glow\) \/ 0\.24\), transparent 68%\)/)
    expect(light).toMatch(/radial-gradient\(480px 340px at 80px 1000px, rgb\(var\(--glow2\) \/ 0\.09\), transparent 70%\)/)
    expect(light).toMatch(/linear-gradient\(180deg, rgb\(var\(--glow\) \/ 0\.045\), transparent 55%\)/)
    const dark = rule("  .dark .app-frame::before")
    expect(dark).toMatch(/rgb\(var\(--glow\) \/ 0\.17\)/)
    expect(dark).toMatch(/rgb\(var\(--glow2\) \/ 0\.08\)/)
    expect(dark).toMatch(/rgb\(var\(--glow\) \/ 0\.03\)/)
    expect(GLOBALS).toMatch(/@media \(prefers-reduced-transparency: reduce\) \{\s*\.app-frame::after \{\s*display: none;/)
    expect(GLOBALS).toMatch(/--grain-opacity: 0\.035;/)
    // Only the frame glows: nothing else reads --glow.
    const readers = [...GLOBALS.matchAll(/^\s*([^{}\n]+)\s*\{[^}]*var\(--glow/gm)].map((m) => m[1].trim())
    expect(readers.every((sel) => sel.includes(".app-frame")), `--glow painted outside the frame: ${readers.join(", ")}`).toBe(true)
  })

  it("is what the app's frame wears", () => {
    const shell = readFileSync(join(ROOT, "components/navigationBar/desktop/desktopNavigationBar.tsx"), "utf8")
    expect(shell).toMatch(/data-app-viewport=""[^>]*className="app-frame /)
    // The page's sheet sits on it, drawn in LayoutContent (design v3: each
    // view is its own sheet).
    expect(readFileSync(join(ROOT, "app/app/LayoutContent.tsx"), "utf8")).toMatch(/"app-sheet /)
  })
})
