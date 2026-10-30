import { describe, expect, it } from "vitest"
import { copyElements, templateElements, type CopyableElement } from "./copyElements"

// A board's elements copied elsewhere (a saved template laid on another
// board): new ids everywhere, every reference following.

const el = (id: string, type: string, x: number, y: number, more: Partial<CopyableElement> = {}): CopyableElement => ({ id, type, x, y, width: 100, height: 100, version: 7, ...more })

const board: CopyableElement[] = [
  el("frame", "frame", -20, -20, { width: 500, height: 300 }),
  el("note", "rectangle", 0, 0, { frameId: "frame", boundElements: [{ id: "words", type: "text" }, { id: "arrow", type: "arrow" }], groupIds: ["g1"], customData: { kind: "note", colour: "teal", taskUuid: "t-1" }, link: "/app/task/t-1" }),
  el("words", "text", 10, 10, { containerId: "note", frameId: "frame", groupIds: ["g1"] }),
  el("other", "ellipse", 300, 0, { boundElements: [{ id: "arrow", type: "arrow" }], groupIds: ["g1"] }),
  el("arrow", "arrow", 100, 50, { startBinding: { elementId: "note" }, endBinding: { elementId: "other" } }),
  el("picture", "image", 0, 200, { frameId: "frame" }),
  el("gone", "rectangle", 0, 400, { isDeleted: true }),
]

describe("a template from a board", () => {
  it("keeps what a person sees, without pictures, and without links into the board's work", () => {
    const t = templateElements(board)
    expect(t.map((e) => e.id)).toEqual(["frame", "note", "words", "other", "arrow"])
    const note = t.find((e) => e.id === "note")!
    expect(note.customData).toEqual({ kind: "note", colour: "teal" })
    expect(note.link).toBeNull()
    // The source board is untouched.
    expect(board[1].customData).toMatchObject({ taskUuid: "t-1" })
  })

  it("drops references to what it left out", () => {
    const t = templateElements([el("note", "rectangle", 0, 0, { boundElements: [{ id: "picture", type: "arrow" }] }), el("arrow", "arrow", 0, 0, { startBinding: { elementId: "picture" } })])
    expect(t[0].boundElements).toEqual([])
    expect(t[1].startBinding).toBeNull()
  })
})

describe("a copy of a board's elements", () => {
  const copy = copyElements(templateElements(board), "t1", 1000, 500)
  const byOld = (old: string) => copy[templateElements(board).findIndex((e) => e.id === old)]

  it("has new ids, its references following, and starts its versions again", () => {
    const [frame, note, words, other, arrow] = ["frame", "note", "words", "other", "arrow"].map(byOld)
    expect(new Set(copy.map((e) => e.id)).size).toBe(copy.length)
    expect(copy.every((e) => e.id.startsWith("t1-"))).toBe(true)
    expect(note.frameId).toBe(frame.id)
    expect(words.containerId).toBe(note.id)
    expect(note.boundElements).toEqual([{ id: words.id, type: "text" }, { id: arrow.id, type: "arrow" }])
    expect(arrow.startBinding?.elementId).toBe(note.id)
    expect(arrow.endBinding?.elementId).toBe(other.id)
    expect(note.groupIds).toEqual(other.groupIds)
    expect(note.groupIds![0]).not.toBe("g1")
    expect(copy.every((e) => e.version === 1)).toBe(true)
  })

  it("lands with its middle where it's asked, shapes keeping their places to one another", () => {
    const xs = copy.filter((e) => !(e.type === "text" && e.containerId))
    const x0 = Math.min(...xs.map((e) => e.x)), x1 = Math.max(...xs.map((e) => e.x + e.width))
    const y0 = Math.min(...xs.map((e) => e.y)), y1 = Math.max(...xs.map((e) => e.y + e.height))
    expect((x0 + x1) / 2).toBeCloseTo(1000)
    expect((y0 + y1) / 2).toBeCloseTo(500)
    expect(byOld("other").x - byOld("note").x).toBe(300)
  })

  it("never collides with a second copy", () => {
    const again = new Set(copyElements(templateElements(board), "t2", 0, 0).map((e) => e.id))
    expect(copy.filter((e) => again.has(e.id))).toEqual([])
  })

  it("centres a pasted line by its points, which run left of and above where it starts", () => {
    // Drawn up and to the left: its x, y is where it starts, and its points go negative, so its box
    // runs from (-200, -100) to (0, 0). Its width and height would put the box at (0, 0)-(200, 100).
    const line = el("line", "line", 0, 0, { width: 200, height: 100, points: [[0, 0], [-120, -30], [-200, -100]] })
    const [c] = copyElements([line], "t3", 1000, 500)
    expect(c.x - 100).toBeCloseTo(1000)
    expect(c.y - 50).toBeCloseTo(500)
    expect(c.points).toEqual(line.points)
  })
})
