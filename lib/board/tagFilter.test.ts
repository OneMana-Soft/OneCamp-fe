import { describe, expect, it } from "vitest"
import { notesTagged } from "./tagFilter"

// Filter a board by tag (miro-07 5): the notes it keeps (lib/board/veil.test.ts holds the veil's holes).

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
})
