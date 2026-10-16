import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

// The look of the hand on blocks (content.md D10, small-details V1–V6, perf
// 4.6): read from the editor's stylesheet, where B1's rules are.

const css = readFileSync("components/minimal-tiptap/styles/index.css", "utf8")

/** The body of the block opened at `at` (the text between its braces). */
function bodyAt(at: number): string {
  const open = css.indexOf("{", at)
  let depth = 0
  for (let i = open; i < css.length; i++) {
    if (css[i] === "{") depth++
    else if (css[i] === "}" && --depth === 0) return css.slice(open + 1, i)
  }
  throw new Error("unbalanced braces")
}

/** A rule's declarations, by its exact selector. */
function rule(selector: string): string {
  const at = css.indexOf(`\n${selector} {`)
  if (at < 0) throw new Error(`no rule for ${selector}`)
  return bodyAt(at + 1)
}

/** Everything inside every @media (prefers-reduced-motion: reduce). */
const reduced = (() => {
  const out: string[] = []
  let at = css.indexOf("@media (prefers-reduced-motion: reduce)")
  while (at >= 0) {
    out.push(bodyAt(at))
    at = css.indexOf("@media (prefers-reduced-motion: reduce)", at + 1)
  }
  return out.join("\n")
})()

/** B1's part of the sheet: from the block handle to the reading column. */
const b1 = css.slice(css.indexOf("THE BLOCK HANDLE (B1"), css.indexOf("/* The doc's reading column"))

const ms = (decl: string) => [...decl.matchAll(/(\d+(?:\.\d+)?)(ms|s)\b/g)].map(([, n, unit]) => Number(n) * (unit === "s" ? 1000 : 1))

describe("the block handle", () => {
  it("answers the pointer at once: its buttons' hover in 50 ms or less", () => {
    const transition = /transition:\s*([^;]+);/.exec(rule(".block-handle-btn"))?.[1] ?? ""
    expect(ms(transition).length).toBeGreaterThan(0)
    for (const d of ms(transition)) expect(d).toBeLessThanOrEqual(50)
  })

  it("has a visible focus ring for the keyboard", () => {
    expect(rule(".block-handle-btn:focus-visible")).toMatch(/outline:\s*2px solid var\(--brand\)/)
  })
})

describe("under reduced motion", () => {
  it("nothing glides, tilts or flashes: the handle, the drag's card and line, the dimmed blocks, a linked block", () => {
    for (const selector of [".block-handle-floating", ".block-drag-card", ".block-drop-indicator", ".block-drag-source", ".block-link-flash::after"]) {
      expect(reduced, selector).toContain(selector)
    }
    expect(reduced).toMatch(/\.block-link-flash::after \{\s*animation: none;/)
  })
})

describe("B1's colours", () => {
  it("are the design's tokens, in both themes: no colour written as a value", () => {
    const lines = b1.split("\n").filter((l) => !l.includes("mask-image") && !l.trim().startsWith("/*") && !l.trim().startsWith("*"))
    for (const l of lines) {
      expect(l, l).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
      expect(l, l).not.toMatch(/\brgba?\(\s*\d/)
    }
  })

  it("chosen blocks wear the selection colour, a linked block its sender's hue", () => {
    expect(rule(".minimal-tiptap-editor .ProseMirror .block-selected::after")).toContain("var(--selection)")
    expect(rule(".minimal-tiptap-editor .ProseMirror .block-link-flash::after")).toContain("var(--hue, var(--brand))")
  })
})

describe("columns", () => {
  it("are 48 px apart and stand one above the other in a pane under 768 px", () => {
    expect(rule('.doc-editor .ProseMirror [data-type="column-list"]')).toMatch(/gap: 48px/)
    expect(css).toMatch(/@container \(max-width: 767px\) \{\s*\.doc-editor \.ProseMirror \[data-type="column-list"\] \{\s*flex-direction: column;/)
  })

  it("keep their grip on the side the row reads towards", () => {
    expect(rule(".doc-column-grip")).toContain("inset-inline-end")
  })
})
