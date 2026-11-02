import { describe, expect, it } from "vitest"
import { placeOfRow, rowAtPlace, rowMoved } from "@/lib/tables/viewPlaces"

// A view's places: the rows read start at `from` (0, or where the view
// jumped), the rows added here are its last, and a place between is a row on
// its way. A row given keeps its place as the rows given change.

describe("a view's places", () => {
  it("finds the rows read from the first, then the rows added here at the end", () => {
    // 500 read, 1 added here, 5,000 in all.
    expect(rowAtPlace(0, 501, 5000, 1)).toBe(0)
    expect(rowAtPlace(499, 501, 5000, 1)).toBe(499)
    expect(rowAtPlace(500, 501, 5000, 1)).toBe(-1)
    expect(rowAtPlace(4999, 501, 5000, 1)).toBe(500)
    expect(placeOfRow(500, 501, 5000, 1)).toBe(4999)
  })

  it("finds the rows read where the view jumped, and none before them", () => {
    // 266 read from place 4,734 (the view's end), none added here.
    expect(rowAtPlace(4733, 266, 5000, 0, 4734)).toBe(-1)
    expect(rowAtPlace(4734, 266, 5000, 0, 4734)).toBe(0)
    expect(rowAtPlace(4999, 266, 5000, 0, 4734)).toBe(265)
    expect(rowAtPlace(0, 266, 5000, 0, 4734)).toBe(-1)
    expect(placeOfRow(0, 266, 5000, 0, 4734)).toBe(4734)
    // A row added here stays last.
    expect(rowAtPlace(5000, 267, 5001, 1, 4734)).toBe(266)
    expect(placeOfRow(266, 267, 5001, 1, 4734)).toBe(5000)
  })

  it("keeps a row's place as rows are read before it, and loses it when the view jumps away", () => {
    const was = { given: 500, count: 5000, tail: 0, from: 2250 }
    // 500 read back before them: every row is 500 further down the rows given.
    expect(rowMoved(10, was, { given: 1000, count: 5000, tail: 0, from: 1750 })).toBe(510)
    // A jump to the end: the row's place isn't given any more.
    expect(rowMoved(10, was, { given: 266, count: 5000, tail: 0, from: 4734 })).toBe(-1)
    // A row added here keeps its place at the end, whatever is read before it.
    expect(rowMoved(500, { given: 501, count: 5001, tail: 1, from: 0 }, { given: 1001, count: 5001, tail: 1, from: 0 })).toBe(1000)
    expect(rowMoved(-1, was, was)).toBe(-1)
  })
})
