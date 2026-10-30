import { describe, expect, it } from "vitest"
import { closedVotes, noteRows, notesCsv, pdfFrames, type ExportElement } from "./exportBoard"

// A board's exports (miro-36): its notes as CSV, its frames as PDF pages.

const el = (o: Partial<ExportElement> & { id: string; type: string }): ExportElement => ({ x: 0, y: 0, width: 180, height: 180, ...o })

function note(id: string, x: number, y: number, words: string, extra: Record<string, unknown> = {}, frameId: string | null = null): ExportElement[] {
  return [
    el({ id, type: "rectangle", x, y, frameId, backgroundColor: "#E1F5F6", boundElements: [{ type: "text", id: `${id}-t` }], customData: { kind: "note", colour: "teal", ...extra } }),
    el({ id: `${id}-t`, type: "text", x, y, containerId: id, text: words.replace(" ", "\n"), originalText: words, frameId }),
  ]
}

const board: ExportElement[] = [
  ...note("a", 300, 0, "Ship it", { tags: ["launch", "q4"] }, "f2"),
  ...note("b", 0, 0, "Fix =SUM(A1)", { taskUuid: "t-1" }, "f2"),
  ...note("c", 0, 400, "Loose, on its own"),
  ...note("d", 0, 0, "Before", {}, "f1"),
  el({ id: "f1", type: "frame", name: "Went well", x: 1000, y: 0, width: 400, height: 300 }),
  el({ id: "f2", type: "frame", name: "To improve", x: 0, y: 0, width: 600, height: 300 }),
  el({ id: "gone", type: "frame", name: "Deleted", isDeleted: true }),
  el({ id: "shape", type: "ellipse" }),
]

describe("a board's notes as CSV", () => {
  it("lists each note in the Frames panel's order, then those in no frame, each read as typed", () => {
    const rows = noteRows(board, ["f2", "f1"], null, "https://camp.example")
    expect(rows.map((r) => r.id)).toEqual(["b", "a", "d", "c"])
    expect(rows[0]).toMatchObject({ text: "Fix =SUM(A1)", author: "", colour: "Teal", frame: "To improve", task: "https://camp.example/app/task/t-1", votes: null })
    expect(rows[1].tags).toEqual(["launch", "q4"])
    expect(rows[3].frame).toBe("")
  })

  it("is quoted as a spreadsheet reads it, a formula kept as words, with Votes only once a vote has closed", () => {
    const csv = notesCsv(noteRows(board, ["f2", "f1"], null), false)
    const lines = csv.trimEnd().split("\r\n")
    expect(lines[0]).toBe("Note,Author,Colour,Tags,Frame,Task")
    expect(lines[1]).toBe(`Fix =SUM(A1),,Teal,,To improve,/app/task/t-1`)
    expect(lines[2]).toBe("Ship it,,Teal,launch; q4,To improve,")
    expect(lines[4]).toBe(`"Loose, on its own",,Teal,,,`)
    const voted = notesCsv(noteRows(board, null, new Map([["a", 3]])), true)
    expect(voted.split("\r\n")[0]).toBe("Note,Author,Colour,Tags,Frame,Task,Votes")
    expect(voted).toContain("Ship it,,Teal,launch; q4,To improve,,3")
    expect(voted).toContain("Before,,Teal,,Went well,,0")
  })

  it("names each note's maker as the board keeps them, a formula-like name kept as words, and none for a note from before", () => {
    const makers = new Map<string, unknown>([
      ["a", { id: "u-sam", name: "Sam Rivera" }],
      ["b", { id: "u-x", name: "=HYPERLINK(1)" }],
      ["c", "not a maker"],
    ])
    const rows = noteRows(board, ["f2", "f1"], null, "", makers)
    expect(Object.fromEntries(rows.map((r) => [r.id, r.author]))).toEqual({ a: "Sam Rivera", b: "=HYPERLINK(1)", c: "", d: "" })
    const csv = notesCsv(rows, false)
    expect(csv).toContain("Ship it,Sam Rivera,Teal,launch; q4,To improve,")
    // csvLine keeps a cell that a spreadsheet would run as a formula as words.
    expect(csv).toContain(`Fix =SUM(A1),"'=HYPERLINK(1)",Teal,,To improve,/app/task/t-1`)
  })

  it("says a vote's counts only once it has closed, and only for notes still there", () => {
    const votes: [string, unknown][] = [
      ["v1:ann", ["a", "b"]],
      ["v1:sam", ["a", "gone-note"]],
      ["v0:old", ["c"]],
    ]
    const live = new Set(["a", "b", "c"])
    expect(closedVotes({ id: "v1", perPerson: 3 }, votes, live)).toBeNull()
    expect(closedVotes(null, votes, live)).toBeNull()
    const counts = closedVotes({ id: "v1", closedAt: 5 }, votes, live)!
    expect(Object.fromEntries(counts)).toEqual({ a: 2, b: 1 })
  })
})

describe("a board's frames as PDF pages", () => {
  it("prints its live frames in the Frames panel's order", () => {
    expect(pdfFrames(board, ["f1"]).map((f) => f.id)).toEqual(["f1", "f2"])
    expect(pdfFrames(board.filter((e) => e.type !== "frame"), null)).toEqual([])
  })
})
