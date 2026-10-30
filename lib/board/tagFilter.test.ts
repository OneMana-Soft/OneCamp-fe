import { describe, expect, it } from "vitest"
import { notesTagged, veilHoles } from "./tagFilter"

// Filter a board by tag (miro-07 5): the notes it keeps, and the veil's holes for them.

const note = (id: string, tags: string[] | null, o: Partial<{ x: number; y: number; width: number; height: number; angle: number; isDeleted: boolean; type: string }> = {}) => ({
  id,
  type: "rectangle",
  x: 0,
  y: 0,
  width: 100,
  height: 100,
  customData: { kind: "note", colour: "yellow", ...(tags ? { tags } : {}) },
  ...o,
})

describe("filtering a board by tag", () => {
  it("keeps the notes with any of the tags, whatever their case, in the board's order", () => {
    const els = [note("a", ["Risk"]), note("b", ["ux"]), note("c", null), note("d", ["risk", "Later"])]
    expect(notesTagged(els, ["risk"]).map((n) => n.id)).toEqual(["a", "d"])
    expect(notesTagged(els, ["UX", "later"]).map((n) => n.id)).toEqual(["b", "d"])
    expect(notesTagged(els, [])).toEqual([])
  })

  it("leaves out what isn't a note: deleted notes, and shapes with tags in their data", () => {
    const els = [note("gone", ["risk"], { isDeleted: true }), note("shape", ["risk"], { type: "ellipse" }), note("kept", ["risk"])]
    expect(notesTagged(els, ["risk"]).map((n) => n.id)).toEqual(["kept"])
  })

  it("gives the veil a hole for each kept note, its own shape, in canvas pixels, a little past its edges", () => {
    const view = { scrollX: 10, scrollY: 20, zoom: 2, width: 800, height: 600 }
    // The note at scene (0, 0), 100 square: on the canvas (0+10)*2 = 20 to (100+10)*2 = 220 across, 40 to 240 down,
    // and 6px past each edge, whatever the zoom.
    expect(veilHoles(view, [note("a", ["risk"])])).toEqual(["M14 34L226 34L226 246L14 246Z"])
    expect(veilHoles(view, [])).toEqual([])
  })

  it("turns a hole as its note is turned, about the note's middle", () => {
    const view = { scrollX: 0, scrollY: 0, zoom: 1, width: 400, height: 400 }
    // A quarter turn of a 100 by 50 note at (100, 100): its middle stays at (150, 125), and it stands 50 wide, 100 tall.
    const [hole] = veilHoles(view, [note("a", ["risk"], { x: 100, y: 100, width: 100, height: 50, angle: Math.PI / 2 })], 0)
    expect(hole).toBe("M175 75L175 175L125 175L125 75Z")
  })
})
