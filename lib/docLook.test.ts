import { describe, expect, it } from "vitest"
import { docCoverOf, docHue, docIconOf } from "./docLook"
import { hueFor } from "./campHue"

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

  // INTERACTION_SPEC D13: a doc wears a hue, its glyph's colour, else its id's.
  it("reads a doc's hue: the colour given its glyph, else its id's; none for grey or a doc with neither", () => {
    expect(docHue("d1", "glyph:rocket:moss")).toBe("moss")
    expect(docHue("d1", "glyph:rocket")).toBe(hueFor("d1"))
    expect(docHue("d1", "📘")).toBe(hueFor("d1"))
    expect(docHue("d1")).toBe(hueFor("d1"))
    expect(docHue("d1", "glyph:rocket:gray")).toBeNull()
    expect(docHue(undefined)).toBeNull()
    expect(docHue("  ", null)).toBeNull()
    expect(docHue(undefined, "glyph:rocket:sky")).toBe("sky")
  })
})
