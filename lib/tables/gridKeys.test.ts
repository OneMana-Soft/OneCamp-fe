import { describe, expect, it } from "vitest"
import { nextCell, swallowsAtEdge } from "./gridKeys"
import { movesBetweenCells, type CellKind, type KeyInput } from "./gridKeyKinds"

const size = { rows: 5, cols: 4 }
const mid = { row: 2, col: 1 }

describe("moving around a table's grid", () => {
  it("goes up and down a row from any cell", () => {
    for (const kind of ["text", "number", "date", "select", "checkbox", "button", "computed"] as const) {
      expect(nextCell({ key: "ArrowDown" }, mid, size, { kind })).toEqual({ row: 3, col: 1 })
      expect(nextCell({ key: "ArrowUp" }, mid, size, { kind })).toEqual({ row: 1, col: 1 })
    }
  })

  it("leaves left and right to the caret inside text, and moves from its edges", () => {
    expect(nextCell({ key: "ArrowLeft" }, mid, size, { kind: "text", atStart: false, atEnd: false })).toBeNull()
    expect(nextCell({ key: "ArrowLeft" }, mid, size, { kind: "text", atStart: true })).toEqual({ row: 2, col: 0 })
    expect(nextCell({ key: "ArrowRight" }, mid, size, { kind: "number", atEnd: false })).toBeNull()
    expect(nextCell({ key: "ArrowRight" }, mid, size, { kind: "number", atEnd: true })).toEqual({ row: 2, col: 2 })
    // A select or a checkbox has no caret: it moves at once.
    expect(nextCell({ key: "ArrowRight" }, mid, size, { kind: "select" })).toEqual({ row: 2, col: 2 })
  })

  it("leaves left and right in a date to its day, month and year", () => {
    expect(nextCell({ key: "ArrowLeft" }, mid, size, { kind: "date" })).toBeNull()
    expect(nextCell({ key: "ArrowRight" }, mid, size, { kind: "date" })).toBeNull()
  })

  it("saves and goes down on Enter in a typed cell, up on Shift+Enter, and leaves Enter alone elsewhere", () => {
    expect(nextCell({ key: "Enter" }, mid, size, { kind: "text" })).toEqual({ row: 3, col: 1 })
    expect(nextCell({ key: "Enter", shiftKey: true }, mid, size, { kind: "date" })).toEqual({ row: 1, col: 1 })
    expect(nextCell({ key: "Enter" }, mid, size, { kind: "button" })).toBeNull()
    expect(nextCell({ key: "Enter" }, mid, size, { kind: "checkbox" })).toBeNull()
  })

  it("stays inside the grid and leaves modified keys alone", () => {
    expect(nextCell({ key: "ArrowUp" }, { row: 0, col: 0 }, size, { kind: "text" })).toBeNull()
    expect(nextCell({ key: "ArrowDown" }, { row: 4, col: 0 }, size, { kind: "text" })).toBeNull()
    expect(nextCell({ key: "ArrowLeft" }, { row: 0, col: 0 }, size, { kind: "select" })).toBeNull()
    expect(nextCell({ key: "ArrowDown", altKey: true }, mid, size, { kind: "select" })).toBeNull()
    expect(nextCell({ key: "ArrowDown", metaKey: true }, mid, size, { kind: "text" })).toBeNull()
  })

  it("swallows up and down at the edge where the cell would otherwise change its value", () => {
    expect(swallowsAtEdge({ key: "ArrowDown" }, "select")).toBe(true)
    expect(swallowsAtEdge({ key: "ArrowUp" }, "date")).toBe(true)
    expect(swallowsAtEdge({ key: "ArrowDown" }, "text")).toBe(false)
    expect(swallowsAtEdge({ key: "ArrowDown", altKey: true }, "select")).toBe(false)
  })
})

// TAB-BUG-7: a text cell is a text area, whose lines its keys move through.
describe("moving around from a text area's lines", () => {
  const lines = (first: boolean, last: boolean) => ({ kind: "text" as const, lines: { first, last } })

  it("leaves up and down to the caret until it's on the first or last line", () => {
    expect(nextCell({ key: "ArrowUp" }, mid, size, lines(false, true))).toBeNull()
    expect(nextCell({ key: "ArrowDown" }, mid, size, lines(true, false))).toBeNull()
    expect(nextCell({ key: "ArrowUp" }, mid, size, lines(true, false))).toEqual({ row: 1, col: 1 })
    expect(nextCell({ key: "ArrowDown" }, mid, size, lines(false, true))).toEqual({ row: 3, col: 1 })
  })

  it("leaves Shift+Enter to the text area, for a line break, and still goes down on Enter", () => {
    expect(nextCell({ key: "Enter", shiftKey: true }, mid, size, lines(true, true))).toBeNull()
    expect(nextCell({ key: "Enter" }, mid, size, lines(true, true))).toEqual({ row: 3, col: 1 })
  })
})

// V-148: the keys come with the live cells' chunk, and the grid holds what
// movesBetweenCells names until it lands. It holds exactly the keys the grid
// takes from a cell at rest (no caret, no lines) away from the edges: each
// that nextCell moves by, or swallowsAtEdge takes, and Shift+Space (a row's
// selection). A key it missed would do the browser's thing before the chunk,
// and one it took for nothing would be lost.
describe("the keys the grid holds until its keys land", () => {
  const KINDS: CellKind[] = ["text", "number", "date", "select", "checkbox", "button", "computed"]
  const KEYS = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Enter", " ", "a", "F2", "Tab", "Escape", "Home", "Delete"]
  const MODS: Omit<KeyInput, "key">[] = [{}, { shiftKey: true }, { altKey: true }, { ctrlKey: true }, { metaKey: true }, { shiftKey: true, ctrlKey: true }]

  it.each(KINDS)("holds from a %s cell at rest just the keys the grid takes there", (kind) => {
    for (const key of KEYS)
      for (const mods of MODS) {
        const e = { key, ...mods }
        const takes = nextCell(e, mid, size, { kind, atStart: true, atEnd: true }) !== null || swallowsAtEdge(e, kind) || (key === " " && !!mods.shiftKey)
        expect([kind, key, mods, movesBetweenCells(e, kind)]).toEqual([kind, key, mods, takes])
      }
  })
})
