import { readFileSync } from "node:fs"
import { join } from "node:path"
import postcss, { type Rule } from "postcss"
import { describe, expect, it } from "vitest"

// The doc's type scale (PROGRAM D-1), read from the editor's CSS the way the
// cascade resolves it: a later rule for the same selector wins. The title
// reads as a page (40/48 at 650; 30/36 on a phone), and each heading level
// reads as its own: H3 was body size.

const root = join(__dirname, "..", "..")
const sheet = postcss.parse(readFileSync(join(root, "components/minimal-tiptap/styles/partials/doc.css"), "utf8"))
const tokens = readFileSync(join(root, "app/content.css"), "utf8")

function value(selector: string, prop: string, media = ""): string | undefined {
  let out: string | undefined
  sheet.walkRules((rule: Rule) => {
    const m = rule.parent?.type === "atrule" ? (rule.parent as unknown as { params: string }).params : ""
    if (m !== media || !rule.selectors.map((s) => s.trim()).includes(selector)) return
    rule.walkDecls(prop, (d) => {
      out = d.value
    })
  })
  return out
}
const token = (name: string) => tokens.match(new RegExp(`${name}:\\s*([^;]+);`))?.[1].trim()
const px = (rem?: string) => (rem ? parseFloat(rem) * 16 : NaN)
const pm = (h: string) => `.minimal-tiptap-editor.doc-editor .ProseMirror ${h}`
const PHONE = "(max-width: 767px)"

describe("the doc's type scale", () => {
  it("sets the title at 40/48, weight 650; 30/36 on a phone", () => {
    expect([px(value(".doc-title", "font-size")), px(value(".doc-title", "line-height")), value(".doc-title", "font-weight")]).toEqual([40, 48, "650"])
    expect([px(value(".doc-title", "font-size", PHONE)), px(value(".doc-title", "line-height", PHONE))]).toEqual([30, 36])
  })

  it("sets H1 30/38, H2 24/32, H3 20/28 and H4 16/24 at 650 in ink-2", () => {
    expect([px(value(pm("h1"), "font-size")), px(value(pm("h1"), "line-height"))]).toEqual([30, 38])
    expect([px(value(pm("h2"), "font-size")), px(value(pm("h2"), "line-height"))]).toEqual([24, 32])
    expect([px(value(pm("h3"), "font-size")), px(value(pm("h3"), "line-height"))]).toEqual([20, 28])
    const h4 = pm(":is(h4, h5, h6)")
    expect([px(value(h4, "font-size")), px(value(h4, "line-height")), value(h4, "font-weight"), value(h4, "color")]).toEqual([16, 24, "650", "var(--ink-2)"])
  })

  it("keeps the body at 16/26", () => {
    expect([px(value(".minimal-tiptap-editor.doc-editor .ProseMirror", "font-size")), px(value(".minimal-tiptap-editor.doc-editor .ProseMirror", "line-height"))]).toEqual([16, 26])
  })

  it("steps headings down on a phone, under its title", () => {
    const sizes = ["h1", "h2", "h3"].map((h) => px(value(pm(h), "font-size", PHONE)))
    expect(sizes).toEqual([24, 20, 18])
    expect(Math.max(...sizes)).toBeLessThan(30)
  })

  it("tracks each size as Inter's metrics say", () => {
    const formula = (size: number) => -0.0223 + 0.185 * Math.exp(-0.1745 * size)
    for (const [name, size] of [["--doc-tracking-title", 40], ["--doc-tracking-h1", 30], ["--doc-tracking-h2", 24], ["--doc-tracking-h3", 20], ["--doc-tracking-body", 16]] as const) {
      expect(Math.abs(parseFloat(token(name)!) - formula(size)), name).toBeLessThanOrEqual(0.0015)
    }
  })

  it("gives one caret colour to title and body, and lets right-to-left lines sit right", () => {
    expect(value(".minimal-tiptap-editor.doc-editor .ProseMirror", "caret-color")).toBe("var(--brand)")
    expect(value(".doc-title", "caret-color")).toBe("var(--brand)")
    const bidi = pm(":is(p, h1, h2, h3, h4, h5, h6, li, blockquote)")
    expect([value(bidi, "unicode-bidi"), value(bidi, "text-align")]).toEqual(["plaintext", "start"])
  })

  it("names an empty heading away from the caret", () => {
    const css = sheet.toString()
    for (const n of [1, 2, 3, 4]) expect(css).toContain(`content: "Heading ${n}"`)
  })
})
