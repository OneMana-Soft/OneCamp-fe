import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

// The doc page's own chrome, read from its source: what a screen reader is
// told, what floats, and where a dead end leads.
const src = readFileSync(join(__dirname, "DocView.tsx"), "utf8")

describe("the doc page", () => {
  it("names its icon buttons: focus mode, and comments with their count", () => {
    expect(src).toMatch(/aria-label=\{focusMode \? 'Exit focus mode' : 'Focus mode'\}/)
    expect(src).toMatch(/aria-label=\{`Comments, \$\{docCommentCount \|\| 0\}`\}/)
  })

  it("offers a way back from a doc that isn't there, instead of a bare sentence", () => {
    expect(src).not.toMatch(/Document not found or access denied/)
    const missing = src.slice(src.indexOf("if (!docInfo)"), src.indexOf("const editorCollaborationProp"))
    expect(missing).toMatch(/<EmptyState/)
    expect(missing).toMatch(/href="\/app\/doc"/)
  })

  it("floats the focus-mode exit on the overlay shadow, and animates nothing with a bare transition", () => {
    expect(src).not.toMatch(/shadow-lg/)
    expect(src).toMatch(/className="border shadow-overlay"/)
    expect(src).not.toMatch(/transition duration-300/)
  })
})
