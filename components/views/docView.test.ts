import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

// The doc page's own chrome, read from its source: what a screen reader is
// told, what floats, and where a dead end leads.
const src = readFileSync(join(__dirname, "DocView.tsx"), "utf8")
const header = readFileSync(join(__dirname, "../docEditor/DocHeader.tsx"), "utf8")

describe("the doc page", () => {
  it("names its icon buttons: comments with their count, More, and the focus-mode exit", () => {
    expect(header).toMatch(/aria-label=\{`Comments, \$\{commentCount \|\| 0\}`\}/)
    expect(header).toMatch(/aria-label="More doc actions"/)
    expect(src).toMatch(/aria-label="Exit focus mode"/)
  })

  it("keeps the occasional actions in More, and Share as the one secondary button", () => {
    for (const item of ["Save for later", "Focus mode", "Full width", "Version history", "Viewed by", "Export as Markdown", "Keyboard shortcuts"]) {
      expect(header).toContain(item)
    }
    expect(header).toMatch(/<Button variant="secondary" size="sm" onClick=\{onShare\}/)
  })

  it("shows its header hairline only once the body has scrolled", () => {
    expect(header).toMatch(/after:opacity-0/)
    expect(header).toMatch(/scrolled && "after:opacity-100"/)
  })

  it("says how it is saving with a dot, not a footer or a banner", () => {
    expect(header).toMatch(/<SaveDot /)
    expect(src).not.toMatch(/Connecting to the live editor/)
    expect(src).toMatch(/<ConnectionPill /)
  })

  it("offers a way back from a doc that isn't there, instead of a bare sentence", () => {
    expect(src).not.toMatch(/Document not found or access denied/)
    const missing = src.slice(src.indexOf("if (!docInfo)"), src.indexOf("const editorCollaborationProp"))
    expect(missing).toMatch(/<EmptyState/)
    expect(missing).toMatch(/href="\/app\/doc"/)
  })

  it("floats the focus-mode exit on e3, fading while the pointer rests", () => {
    expect(src).not.toMatch(/shadow-lg/)
    expect(src).toMatch(/className="bg-pop shadow-e3"/)
    expect(src).toMatch(/focusChrome \? "opacity-100" : "opacity-0"/)
    expect(src).not.toMatch(/transition duration-300/)
  })
})
