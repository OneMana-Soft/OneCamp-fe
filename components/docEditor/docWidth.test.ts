import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"

// A doc's prose keeps the 720 px reading measure (content.md D07), and what is
// wide breaks out of it to 960 px, centred, so tables and embeds in existing
// docs keep their width. jsdom lays nothing out, so this reads the rules; the
// widths were measured in a browser with the app's CSS.
const root = join(__dirname, "..", "..")
const css = readFileSync(join(root, "components/minimal-tiptap/styles/index.css"), "utf8")
const doc = readFileSync(join(root, "components/docEditor/docInput.tsx"), "utf8")

const rule = (selectorPart: string) => {
  const at = css.indexOf(selectorPart)
  return at < 0 ? "" : css.slice(at, css.indexOf("}", at))
}

describe("a doc's width", () => {
  it("keeps prose in the 720 px measure, and opens to 1,040 px at full width", () => {
    expect(rule(".doc-measure {")).toMatch(/max-width:\s*calc\(var\(--doc-measure\) \+ 64px\)/)
    expect(rule(".doc-measure-full {")).toMatch(/max-width:\s*calc\(var\(--doc-measure-full\) \+ 96px\)/)
  })

  it.each(["pre", ".node-tableEmbed", ".node-image", ".node-chartEmbed", ".node-recordingEmbed", ".node-diffEmbed", '[data-type="table-embed"]'])(
    "lets %s break out to 960 px, centred",
    (wide) => {
      const breakout = rule(".doc-measure .doc-editor:not(.full-width) .ProseMirror > :is(")
      expect(breakout.slice(0, breakout.indexOf("{"))).toContain(wide)
      expect(breakout).toMatch(/--doc-wide:\s*min\(960px, 100cqi - 64px\)/)
      expect(breakout).toMatch(/margin-inline:\s*calc\(\(100% - var\(--doc-wide\)\) \/ 2\)/)
    },
  )

  it("measures the breakout against the doc's own pane", () => {
    expect(rule(".doc-scroll {")).toMatch(/container-type:\s*inline-size/)
    expect(doc).toMatch(/className="doc-scroll /)
  })
})
