import { describe, expect, it } from "vitest"
import { rowsText, undoneNote, type UndoResult } from "@/lib/tables/ledger"

const result = (skipped: number): UndoResult => ({ change_set: "u", reversed: "c", kind: "edit", changes: 3, skipped })

describe("an undo's toast", () => {
  it("says it's done, and nothing more when every change came back", () => {
    expect(undoneNote(result(0))).toEqual({ title: "Undone" })
    expect(undoneNote(result(0), true)).toEqual({ title: "Redone" })
  })

  it("says what it left, as it changed again since", () => {
    expect(undoneNote(result(1))).toEqual({ title: "Undone", description: "1 change was left as it is: it changed again since." })
    expect(undoneNote(result(2), true)).toEqual({ title: "Redone", description: "2 changes were left as they are: they changed again since." })
  })
})

describe("a count of rows", () => {
  it("is a row, or rows", () => {
    expect(rowsText(1)).toBe("1 row")
    expect(rowsText(1000)).toBe(`${(1000).toLocaleString()} rows`)
  })
})
