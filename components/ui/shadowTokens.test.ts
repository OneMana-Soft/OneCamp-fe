import { describe, expect, it } from "vitest"
import { readFileSync, readdirSync } from "node:fs"
import { resolve } from "node:path"

/**
 * ELEVATION IS A MATERIAL (design v3, §3.8). It replaces wave 1's elevation
 * guard, which held cards, inputs and buttons flat ("a shadow means the
 * surface floats"): a 1px grey line on white was the wireframe look, and
 * every premium competitor measured on 11 Oct 2026 uses micro-elevation.
 *
 * Every surface sits on one step of a ladder, and every step is a ring plus
 * drops, so no surface needs a border:
 *   shadow-e1     resting: secondary buttons, inputs, cards, chips on canvas
 *   shadow-sel    the selected nav chip
 *   shadow-e2     raised: the composer, a card or secondary button hovered
 *   shadow-e3     floating: menus, popovers, hover toolbars (shadow-overlay)
 *   shadow-e4     modal: dialogs and sheets (shadow-dialog)
 *   shadow-sheet  the main panel
 * plus shadow-primary, the primary button's inner highlight and tinted drop.
 * The app's classes may use these and shadow-none, and nothing else; the few
 * hand-drawn shadows left (a selected tab's inset bar, a recording dot's
 * glow) are counted and may only fall.
 */
const root = resolve(__dirname, "../..")
const css = readFileSync(resolve(root, "app/globals.css"), "utf8")

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = resolve(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".next") continue
      walk(full, out)
    } else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
      out.push(full)
    }
  }
  return out
}

const LADDER = new Set(["e1", "sel", "e2", "e3", "e4", "sheet", "primary", "overlay", "dialog", "none"])
/** Hand-drawn shadows left on 11 Oct 2026: two inset tab bars, three status glows, a focus halo, a black ring, shadow-inner. */
const HAND_DRAWN_BASELINE = 9

/** Shadow classes in a source, without their variants (hover:, dark:, data-[...]:). */
function shadowClasses(src: string): string[] {
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")
  return [...code.matchAll(/(?<![\w-])(?:[a-z-]+:|data-\[[^\]]+\]:|group-[a-z/-]+:)*shadow-((?:\[[^\]]+\])|[a-z0-9-]+)/g)]
    .map((m) => m[1])
    // A colour or opacity for a shadow (shadow-black/5) is not a step.
    .filter((v) => !/^(black|white|transparent|current|inherit)/.test(v))
}

const files = ["components", "app", "lib"].flatMap((d) => walk(resolve(root, d)))

describe("the elevation ladder", () => {
  it("scans the app", () => {
    expect(files.length).toBeGreaterThan(100)
  })

  it("is the spec's values, light and dark", () => {
    const light = css.slice(css.indexOf(":root {"), css.indexOf("\n}", css.indexOf(":root {")))
    const dark = css.slice(css.indexOf(".dark {"), css.indexOf("\n}", css.indexOf(".dark {")))
    expect(light).toMatch(/--e1: 0 0 0 1px rgb\(16 18 26 \/ 0\.09\), 0 1px 2px rgb\(16 18 26 \/ 0\.05\);/)
    expect(light).toMatch(/--e-sel: 0 0 0 1px rgb\(16 18 26 \/ 0\.07\), 0 1px 2px rgb\(16 18 26 \/ 0\.06\), 0 2px 6px -2px rgb\(16 18 26 \/ 0\.06\);/)
    expect(light).toMatch(/--e2: 0 0 0 1px rgb\(16 18 26 \/ 0\.07\), 0 1px 2px rgb\(16 18 26 \/ 0\.05\), 0 4px 12px -4px rgb\(16 18 26 \/ 0\.08\);/)
    expect(light).toMatch(/--e3: 0 0 0 1px rgb\(16 18 26 \/ 0\.08\), 0 4px 8px -2px rgb\(16 18 26 \/ 0\.07\), 0 16px 32px -8px rgb\(16 18 26 \/ 0\.16\);/)
    expect(light).toMatch(/--e4: 0 0 0 1px rgb\(16 18 26 \/ 0\.08\), 0 8px 16px -4px rgb\(16 18 26 \/ 0\.08\), 0 32px 64px -16px rgb\(16 18 26 \/ 0\.24\);/)
    expect(light).toMatch(/--e-sheet: 0 0 0 1px rgb\(16 18 26 \/ 0\.06\), 0 1px 3px rgb\(16 18 26 \/ 0\.04\), 0 12px 32px -16px rgb\(16 18 26 \/ 0\.10\);/)
    // Dark adds a top highlight to every step: light catches the upper edge.
    for (const step of ["e1", "e-sel", "e2", "e3", "e4", "e-sheet"]) {
      expect(dark, `--${step} in dark`).toMatch(new RegExp(`--${step}: inset 0 1px 0 rgb\\(255 255 255 \\/ 0\\.0\\d+\\),`))
    }
  })

  it("maps every step to a utility, and folds Tailwind's own steps onto it", () => {
    const theme = css.slice(css.indexOf("@theme inline {"), css.indexOf("\n}", css.indexOf("@theme inline {")))
    for (const [util, step] of [["e1", "e1"], ["sel", "e-sel"], ["e2", "e2"], ["e3", "e3"], ["e4", "e4"], ["sheet", "e-sheet"]]) {
      expect(theme).toMatch(new RegExp(`--shadow-${util}: var\\(--${step}\\);`))
    }
    for (const [util, step] of [["sm", "e1"], ["md", "e3"], ["lg", "e3"], ["xl", "e4"], ["2xl", "e4"]]) {
      expect(theme, `shadow-${util}`).toMatch(new RegExp(`--shadow-${util}: var\\(--${step}\\);`))
    }
    expect(css).toMatch(/@utility shadow-overlay \{\s*@apply shadow-e3;/)
    expect(css).toMatch(/@utility shadow-dialog \{\s*@apply shadow-e4;/)
  })

  it("gives the primary button an inner highlight, not a gradient", () => {
    const at = css.indexOf("@utility shadow-primary {")
    expect(at).toBeGreaterThan(-1)
    const body = css.slice(at, css.indexOf("\n}", at))
    expect(body).toMatch(/inset 0 1px 0 rgb\(255 255 255 \/ 0\.2\)/)
    expect(body).toMatch(/0 0 0 1px color-mix\(in oklab, var\(--brand\) 82%, black\)/)
    expect(body).not.toMatch(/gradient/)
  })

  it("uses only the ladder in the app's classes", () => {
    const offenders: string[] = []
    let handDrawn = 0
    for (const f of files) {
      for (const v of shadowClasses(readFileSync(f, "utf8"))) {
        if (LADDER.has(v)) continue
        if (v.startsWith("[") || v === "inner") {
          handDrawn++
          continue
        }
        offenders.push(`${f.slice(root.length + 1)}: shadow-${v}`)
      }
    }
    expect(offenders, `off the ladder (use shadow-e1, e2, e3, e4, sel or sheet):\n${offenders.join("\n")}`).toEqual([])
    expect(handDrawn, `hand-drawn shadows went up (${handDrawn} > ${HAND_DRAWN_BASELINE}); use a step of the ladder`).toBeLessThanOrEqual(HAND_DRAWN_BASELINE)
  })

  it("lets a card lift one pixel to e2 on purpose, and stand still for reduced motion", () => {
    const at = css.indexOf("@utility hover-lift {")
    expect(at, "hover-lift is defined as a utility").toBeGreaterThan(-1)
    const body = css.slice(at, css.indexOf("\n}", at))
    expect(body).toMatch(/box-shadow: var\(--e2\);/)
    expect(body).toMatch(/@media \(hover: hover\)/)
    expect(body).toMatch(/translate:\s*0 -1px;/)
    expect(body).not.toMatch(/-2px|-0\.5|translate-y/)
    expect(body).toMatch(/@media \(prefers-reduced-motion: reduce\)\s*\{\s*&:hover\s*\{\s*translate:\s*none;/)
  })

  it("keeps menus, popovers and dialogs off the page: floating or modal", () => {
    const source = (file: string) => readFileSync(resolve(__dirname, file), "utf8")
    for (const file of ["dropdown-menu.tsx", "popover.tsx"]) {
      expect(source(file), file).toMatch(/shadow-(?:overlay|e3)\b/)
    }
    expect(source("dialog.tsx")).toMatch(/shadow-(?:dialog|e4)\b/)
  })
})
