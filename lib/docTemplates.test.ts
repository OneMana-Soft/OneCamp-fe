import { describe, expect, it } from "vitest"

import { FileText } from "@/lib/icons"
import { BUILTIN_DOC_TEMPLATES, QUICK_DOC_TEMPLATES, templateGlyph, templateHue } from "./docTemplates"

// OneCamp's own doc templates, as the browser offers them: the server knows
// them by these ids (business/Marketplace/docTemplatesBuiltin.go, whose test
// pins the same ids) and writes their bodies; the browser never does (N37).
describe("OneCamp's doc templates", () => {
  it("are the server's ten, by their fixed ids, in the gallery's order", () => {
    expect(BUILTIN_DOC_TEMPLATES).toHaveLength(10)
    BUILTIN_DOC_TEMPLATES.forEach((t, i) => {
      expect(t.id).toBe(`b5d0c000-0000-4000-8000-${(i + 1).toString(16).padStart(12, "0")}`)
    })
    expect(QUICK_DOC_TEMPLATES.map((t) => t.name)).toEqual(["Meeting notes", "Project brief", "Decision record"])
  })

  it("carry no body: the server writes it", () => {
    for (const t of BUILTIN_DOC_TEMPLATES) expect(Object.keys(t)).not.toContain("body")
  })

  it("have a glyph each, and a tile in a camp hue", () => {
    // Every glyph is one the app draws: only "file-text" falls to the page.
    for (const t of BUILTIN_DOC_TEMPLATES) expect(templateGlyph(t.glyph) !== FileText || t.glyph === "file-text", t.glyph).toBe(true)
    expect(templateGlyph("nope")).toBe(FileText)
    expect(templateHue("neon")).toBe("sky")
    expect(templateHue("dusk")).toBe("dusk")
  })

  it("say what they're for in sentence case, with no version numbers or claims", () => {
    for (const t of BUILTIN_DOC_TEMPLATES) {
      expect(t.description).toMatch(/^[A-Z]/)
      expect(`${t.name} ${t.description}`).not.toMatch(/complian|certified|v\d/i)
    }
  })
})
