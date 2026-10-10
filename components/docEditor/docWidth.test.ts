import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"

// A doc's prose keeps the reading measure (37rem column), and what is wide
// breaks out of it to the 48rem the column had before (44rem inside its
// padding), centred. When the column narrowed, tables and embeds in existing
// docs narrowed with it. jsdom lays nothing out, so this reads the rules; the
// widths were measured in a browser with the app's CSS.
const root = join(__dirname, "..", "..")
const css = readFileSync(join(root, "components/minimal-tiptap/styles/index.css"), "utf8")
const doc = readFileSync(join(root, "components/docEditor/docInput.tsx"), "utf8")

const rule = (selectorPart: string) => {
  const at = css.indexOf(selectorPart)
  return at < 0 ? "" : css.slice(at, css.indexOf("}", at))
}

describe("a doc's width", () => {
  it("keeps prose in the 37rem reading column", () => {
    expect(rule(".doc-measure {")).toMatch(/max-width:\s*37rem/)
  })

  it.each(["pre", ".node-tableEmbed", ".node-image", ".node-chartEmbed", ".node-recordingEmbed", ".node-diffEmbed", '[data-type="table-embed"]'])(
    "lets %s break out to 44rem, centred",
    (wide) => {
      const breakout = rule(".doc-measure .doc-editor:not(.full-width) .ProseMirror > :is(")
      expect(breakout.slice(0, breakout.indexOf("{"))).toContain(wide)
      expect(breakout).toMatch(/--doc-wide:\s*min\(44rem, 100cqi - 4rem\)/)
      expect(breakout).toMatch(/margin-inline:\s*calc\(\(100% - var\(--doc-wide\)\) \/ 2\)/)
    },
  )

  it("measures the breakout against the doc's own pane", () => {
    expect(rule(".doc-scroll {")).toMatch(/container-type:\s*inline-size/)
    expect(doc).toMatch(/className="doc-scroll /)
  })
})
