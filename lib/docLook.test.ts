import { describe, expect, it } from "vitest"
import { docCoverOf, docIconOf } from "./docLook"

describe("a doc's icon and cover, as stored (D-2)", () => {
  it("reads an icon as an emoji or a glyph, in its colour", () => {
    expect(docIconOf("📘")).toEqual({ emoji: "📘" })
    expect(docIconOf(" 🚀 ")).toEqual({ emoji: "🚀" })
    expect(docIconOf("glyph:rocket")).toEqual({ glyph: "rocket", hue: undefined })
    expect(docIconOf("glyph:rocket:sky")).toEqual({ glyph: "rocket", hue: "sky" })
    for (const none of [undefined, null, "", "  ", "glyph:", "x:y"]) expect(docIconOf(none)).toBeNull()
  })

  it("reads a cover as the gallery's or a doc's file", () => {
    expect(docCoverOf("gallery:dusk")).toEqual({ gallery: "dusk" })
    expect(docCoverOf("d1/f1")).toEqual({ doc: "d1", file: "f1" })
    for (const none of [undefined, null, "", "d1", "/f1", "d1/"]) expect(docCoverOf(none)).toBeNull()
  })
})
