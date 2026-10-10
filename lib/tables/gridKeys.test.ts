import { describe, expect, it } from "vitest"
import { nextCell, swallowsAtEdge } from "./gridKeys"

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
