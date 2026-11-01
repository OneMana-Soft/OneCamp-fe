import { describe, expect, it } from "vitest"
import { boxOf, boxSize, extendRange, inBox, pasteBox, tileBlock, type CellRange } from "@/lib/tables/cellRange"

const size = { rows: 10, cols: 4 }
const at = (row: number, col: number): CellRange => ({ anchor: { row, col }, focus: { row, col } })

describe("cellRange: a block of the grid's cells", () => {
  it("is the same box whichever way it was drawn", () => {
    expect(boxOf({ anchor: { row: 5, col: 3 }, focus: { row: 2, col: 1 } })).toEqual({ top: 2, left: 1, bottom: 5, right: 3 })
    expect(boxOf({ anchor: { row: 2, col: 1 }, focus: { row: 5, col: 3 } })).toEqual({ top: 2, left: 1, bottom: 5, right: 3 })
  })

  it("knows its cells and its size", () => {
    const b = { top: 2, left: 1, bottom: 5, right: 3 }
    expect(inBox(b, { row: 2, col: 1 })).toBe(true)
    expect(inBox(b, { row: 5, col: 3 })).toBe(true)
    expect(inBox(b, { row: 6, col: 3 })).toBe(false)
    expect(inBox(b, { row: 3, col: 0 })).toBe(false)
    expect(boxSize(b)).toEqual({ rows: 4, cols: 3 })
  })

  it("grows and shrinks from its anchor by Shift and the arrows", () => {
    let r = extendRange(at(1, 1), "ArrowDown", size)
    expect(r).toEqual({ anchor: { row: 1, col: 1 }, focus: { row: 2, col: 1 } })
    r = extendRange(r!, "ArrowRight", size)
    expect(r).toEqual({ anchor: { row: 1, col: 1 }, focus: { row: 2, col: 2 } })
    r = extendRange(r!, "ArrowUp", size)
    r = extendRange(r!, "ArrowUp", size)
    expect(r).toEqual({ anchor: { row: 1, col: 1 }, focus: { row: 0, col: 2 } })
  })

  it("stops at the grid's edges and leaves other keys alone", () => {
    expect(extendRange(at(0, 0), "ArrowUp", size)).toEqual(at(0, 0))
    expect(extendRange(at(9, 3), "ArrowRight", size)).toEqual(at(9, 3))
    expect(extendRange(at(9, 3), "ArrowDown", size)).toEqual(at(9, 3))
    expect(extendRange(at(3, 3), "Enter", size)).toBeNull()
  })

  it("pastes a block at a lone cell at the block's own size", () => {
    expect(pasteBox({ top: 4, left: 1, bottom: 4, right: 1 }, { rows: 3, cols: 2 })).toEqual({ top: 4, left: 1, bottom: 6, right: 2 })
  })

  it("fills a range that is a whole multiple of the block, as Sheets tiles it", () => {
    expect(pasteBox({ top: 0, left: 0, bottom: 3, right: 1 }, { rows: 2, cols: 1 })).toEqual({ top: 0, left: 0, bottom: 3, right: 1 })
    // One value fills every cell of the range.
    expect(pasteBox({ top: 2, left: 0, bottom: 6, right: 2 }, { rows: 1, cols: 1 })).toEqual({ top: 2, left: 0, bottom: 6, right: 2 })
  })

  it("pastes at the block's own size from the top-left of a range it doesn't divide", () => {
    expect(pasteBox({ top: 1, left: 1, bottom: 3, right: 1 }, { rows: 2, cols: 1 })).toEqual({ top: 1, left: 1, bottom: 2, right: 1 })
  })

  it("repeats a block to fill a box", () => {
    expect(tileBlock([["a", "b"]], 3, 4)).toEqual([
      ["a", "b", "a", "b"],
      ["a", "b", "a", "b"],
      ["a", "b", "a", "b"],
    ])
    expect(tileBlock([["x"], ["y"]], 2, 1)).toEqual([["x"], ["y"]])
  })
})
