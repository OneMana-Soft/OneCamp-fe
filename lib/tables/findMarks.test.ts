import { describe, expect, it } from "vitest"
import { matchesByRow } from "@/lib/tables/findMarks"

// G2b-2: what a find marks, by row, in the grid (its cells) and the phone's list (its rows and their values).
describe("a find's matches by row", () => {
  it("lists each row's matched fields in the order found, and a match without a field marks its row alone", () => {
    const byRow = matchesByRow([
      { row: "a", field: "x", at: 0 },
      { row: "b", field: "y", at: 1 },
      { row: "a", field: "z", at: 0 },
      { row: "c", at: 2 },
    ])
    expect([...byRow]).toEqual([
      ["a", ["x", "z"]],
      ["b", ["y"]],
      ["c", []],
    ])
    expect(matchesByRow(undefined).size).toBe(0)
  })
})
