import { readFileSync } from "node:fs"
import { join } from "node:path"
import postcss from "postcss"
import { describe, expect, it } from "vitest"

/**
 * IDENTITY MARKS KEEP THEIR COLOURS (INTERACTION_SPEC D13, 15 Oct 2026).
 *
 * A project's tile is a gradient with a white glyph, a channel's a tint with
 * its # in the hue, a doc's glyph its hue's ink. Rows colour their own icons
 * (a nav row's ink-3, the current place's accent, the palette's ink-3), and
 * those rules reached into the marks: every project tile in the sidebar drew
 * its glyph ink-3 on the gradient, and the current project's in the accent.
 * Each rule that colours a row's icons now leaves the marks out; this holds it.
 *
 * Docs & Files (docs F1b) adds a node's mark (a folder's tile in its colour, a
 * file's type in its hue, a link's provider): a mark too. And a nav row that
 * can be chosen holds a box whose check is white on the accent: a control in
 * its own colours, which the row's icon colour turned ink-3 on the orange.
 */

const CSS = readFileSync(join(process.cwd(), "app/globals.css"), "utf8")
const ROW = /\.nav-idle|\.nav-active|\.palette-row/
const MARKS = ["[data-project-tile]", "[data-channel-tile]", "[data-doc-icon]", "[data-node-mark]"]
/** The marks a fill reaches: a doc's glyph and a node's mark. */
const FILLED = ["[data-doc-icon]", "[data-node-mark]"]

function rowIconRules(css: string) {
  const out: { selector: string; props: string[] }[] = []
  postcss.parse(css).walkRules((r) => {
    for (const selector of r.selectors) {
      if (!ROW.test(selector) || !/svg/.test(selector)) continue
      const props = r.nodes.flatMap((n) => (n.type === "decl" && (n.prop === "color" || n.prop === "fill") ? [n.prop] : []))
      if (props.length) out.push({ selector, props })
    }
  })
  return out
}

describe("identity marks inside rows (D13)", () => {
  it("finds the rules that colour a row's icons", () => {
    expect(rowIconRules(CSS).length).toBeGreaterThanOrEqual(5)
  })

  it("leaves a project's tile, a channel's tile, a doc's glyph and a node's mark out of every one", () => {
    const leaks = rowIconRules(CSS)
      .filter(({ selector, props }) => (props.includes("color") ? MARKS : FILLED).some((m) => !selector.includes(m)))
      .map(({ selector }) => selector)
    expect(leaks, `these colour every icon in a row, identity marks too:\n${leaks.join("\n")}`).toEqual([])
  })

  it("leaves a chosen row's check, white on the accent, out of a nav row's icon colour", () => {
    const leaks = rowIconRules(CSS)
      .filter(({ selector, props }) => /\.nav-/.test(selector) && props.includes("color") && !selector.includes("[data-tree-check]"))
      .map(({ selector }) => selector)
    expect(leaks, `these colour a chosen row's check:\n${leaks.join("\n")}`).toEqual([])
  })

  it("bites on a rule that reaches into the marks", () => {
    expect(rowIconRules(".nav-idle svg.lucide { color: var(--ink-3); }")).toHaveLength(1)
    const ok = ".nav-idle svg.lucide:not(:is([data-project-tile], [data-channel-tile], [data-node-mark]) *, [data-doc-icon]) { color: red }"
    const leaky = ".nav-idle svg.lucide { color: red }"
    const leaksIn = (css: string) => rowIconRules(css).filter(({ selector }) => MARKS.some((m) => !selector.includes(m)))
    expect(leaksIn(ok)).toEqual([])
    expect(leaksIn(leaky)).toHaveLength(1)
  })
})
