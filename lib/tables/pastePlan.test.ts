import { describe, expect, it } from "vitest"
import { BATCH_MAX } from "@/lib/tables/batchLimit"
import { fieldKind } from "@/lib/fieldTypes/registry"
import { batchCells, clearPlan, fillPlan, pastePlan, refusalLines, refusedCells, withoutRefused } from "@/lib/tables/pastePlan"
import type { BatchInput } from "@/lib/tables/ledger"
import type { FieldType, TableField } from "@/services/tableService"
import { pinTestClock } from "@/lib/testing/testClock"

pinTestClock()

const f = (id: string, type: FieldType, name = id): TableField => ({ id, table_id: "t", name, type, config: "{}", position: 0 })
const name = f("name", "text", "Name")
const amount = f("amount", "number", "Amount")
const due = f("due", "date", "Due")
const total = f("total", "formula", "Total")
const made = f("made", "created_time", "Created")
/** Which fields people write, as the grid hands it to the plans: the field kinds' stored. */
const writable = (x: TableField) => fieldKind(x.type).stored
const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `r${i}` }))

describe("pastePlan: a block pasted as one change set", () => {
  it("writes the block's cells into the rows from the paste's top, as the text pasted, kind paste", () => {
    const p = pastePlan({ block: [["Ann", "1,234.50"], ["Bob", "7"]], left: 0, rows: rows(2), writable, fields: [name, amount] })
    expect(p.input).toEqual({
      kind: "paste",
      patch: [
        { row: "r0", values: { name: "Ann", amount: "1,234.50" } },
        { row: "r1", values: { name: "Bob", amount: "7" } },
      ],
    })
    expect(p.cells).toBe(4)
    expect(p.tooMany).toBe(false)
  })

  it("starts at the paste's column", () => {
    const p = pastePlan({ block: [["5", "2026-10-31"]], left: 1, rows: rows(1), writable, fields: [name, amount, due] })
    expect(p.input.patch).toEqual([{ row: "r0", values: { amount: "5", due: "2026-10-31" } }])
  })

  it("adds the block's rows past the view's end as new rows, after the last row, and skips blank ones", () => {
    const p = pastePlan({ block: [["Ann"], ["Bob"], ["Cy"], [""]], left: 0, rows: rows(1), writable, fields: [name] })
    expect(p.input.patch).toEqual([{ row: "r0", values: { name: "Ann" } }])
    expect(p.input.create).toEqual([{ values: { name: "Bob" } }, { values: { name: "Cy" } }])
    expect(p.input.at).toBeUndefined()
    expect(p.cells).toBe(3)
  })

  it("empties a cell for an empty one, so a number column takes it", () => {
    const p = pastePlan({ block: [["", "Zed"]], left: 0, rows: rows(1), writable, fields: [amount, name] })
    expect(p.input.patch).toEqual([{ row: "r0", values: { amount: null, name: "Zed" } }])
  })

  it("never names a version: an edit to another cell of the row doesn't refuse it", () => {
    const p = pastePlan({ block: [["x"]], left: 0, rows: [{ id: "r0", version: 4 } as { id: string }], writable, fields: [name] })
    expect(p.input.patch?.[0]).not.toHaveProperty("version")
  })

  it("leaves out fields nobody writes, saying which, and columns past the last field", () => {
    const p = pastePlan({ block: [["Ann", "9", "2026-01-01", "x", "y"]], left: 0, rows: rows(1), writable, fields: [name, total, made, amount] })
    expect(p.input.patch).toEqual([{ row: "r0", values: { name: "Ann", amount: "x" } }])
    expect(p.readOnly).toEqual(["Total", "Created"])
    expect(p.pastRight).toBe(1)
    expect(p.cells).toBe(2)
  })

  it("plans nothing past one batch's rows, so it can say so", () => {
    const block = Array.from({ length: BATCH_MAX + 1 }, (_, i) => [`v${i}`])
    const p = pastePlan({ block, left: 0, rows: rows(10), writable, fields: [name] })
    expect(p.tooMany).toBe(true)
    expect(p.input.patch ?? []).toHaveLength(0)
    expect(p.input.create ?? []).toHaveLength(0)
    expect(pastePlan({ block: block.slice(1), left: 0, rows: rows(10), writable, fields: [name] }).tooMany).toBe(false)
  })
})

describe("fillPlan: the fill handle as one change set", () => {
  it("continues each column's series over the target rows, kind fill", () => {
    const p = fillPlan({
      source: [{ values: { amount: 1, due: "2026-10-30", name: "Open" } }, { values: { amount: 2, due: "2026-10-31", name: "Done" } }],
      targets: rows(2),
      writable, fields: [amount, due, name],
    })
    expect(p.input).toEqual({
      kind: "fill",
      patch: [
        { row: "r0", values: { amount: 3, due: "2026-11-01", name: "Open" } },
        { row: "r1", values: { amount: 4, due: "2026-11-02", name: "Done" } },
      ],
    })
    expect(p.cells).toBe(6)
  })

  it("fills upwards in top-to-bottom order, and skips fields nobody writes", () => {
    const p = fillPlan({ source: [{ values: { amount: 3, total: 9 } }, { values: { amount: 4, total: 9 } }], targets: rows(2), writable, fields: [amount, total], up: true })
    expect(p.input.patch).toEqual([
      { row: "r0", values: { amount: 1 } },
      { row: "r1", values: { amount: 2 } },
    ])
    expect(p.readOnly).toEqual(["Total"])
  })
})

describe("clearPlan: Delete on a range as one change set", () => {
  it("empties every writable cell of the range and says which fields it couldn't", () => {
    const p = clearPlan({ rows: rows(2), writable, fields: [name, total, amount] })
    expect(p.input).toEqual({
      kind: "edit",
      patch: [
        { row: "r0", values: { name: null, amount: null } },
        { row: "r1", values: { name: null, amount: null } },
      ],
    })
    expect(p.cells).toBe(4)
    expect(p.readOnly).toEqual(["Total"])
  })
})

describe("fillPlan copy: Ctrl+D copies down as it is (Sheets), no series", () => {
  it("writes the top row's values into every target, kind fill", () => {
    const p = fillPlan({ source: [{ values: { amount: 1, due: "2026-10-31", name: "Item 1" } }], targets: rows(2), writable, fields: [amount, due, name], copy: true })
    expect(p.input).toEqual({
      kind: "fill",
      patch: [
        { row: "r0", values: { amount: 1, due: "2026-10-31", name: "Item 1" } },
        { row: "r1", values: { amount: 1, due: "2026-10-31", name: "Item 1" } },
      ],
    })
  })
})

describe("a refused paste (G1): its cells said, and the rest sent", () => {
  const ZERO = "00000000-0000-0000-0000-000000000000"
  it("reads a refused batch's cells from its answer, and nothing from any other failure", () => {
    const errors = [
      { row: "r2", field: "amount", msg: '"abc" isn\'t a number' },
      { row: ZERO, index: 0, field: "amount", msg: '"x" isn\'t a number' },
    ]
    expect(refusedCells({ response: { status: 400, data: { msg: "2 rows can't be written", errors } } })).toEqual(errors)
    expect(refusedCells({ response: { status: 403, data: { msg: "you don't have access to this table" } } })).toBeNull()
    expect(refusedCells({ response: { status: 400, data: { msg: "name the rows to make, change or delete" } } })).toBeNull()
    expect(refusedCells(new Error("Network Error"))).toBeNull()
  })
  it("sends the rest: each refused cell left out, and a row left with nothing dropped", () => {
    const input: BatchInput = {
      kind: "paste",
      patch: [
        { row: "r1", values: { name: "A", amount: "1" } },
        { row: "r2", values: { amount: "abc" } },
      ],
      create: [{ values: { name: "B", amount: "x" } }, { values: { amount: "y" } }],
    }
    const refused = [
      { row: "r2", field: "amount", msg: "" },
      { row: ZERO, index: 0, field: "amount", msg: "" },
      { row: ZERO, index: 1, field: "amount", msg: "" },
    ]
    expect(withoutRefused(input, refused)).toEqual({
      kind: "paste",
      patch: [{ row: "r1", values: { name: "A", amount: "1" } }],
      create: [{ values: { name: "B" } }],
    })
  })
  it("leaves out a whole row when its refusal names no field", () => {
    const input: BatchInput = { kind: "fill", patch: [{ row: "r1", values: { name: "A" } }, { row: "r2", values: { name: "B" } }] }
    expect(withoutRefused(input, [{ row: "r1", msg: "row not found" }])).toEqual({ kind: "fill", patch: [{ row: "r2", values: { name: "B" } }] })
  })
  it("says each refused cell by its row's place in the view and its field's name", () => {
    const lines = refusalLines(
      [
        { row: "r2", field: "amount", msg: '"abc" isn\'t a number' },
        { row: ZERO, index: 1, msg: "Name is required" },
        { row: "gone", field: "nope", msg: "row not found" },
      ],
      { fields: [name, amount], placeOf: (id) => (id === "r2" ? 4 : null) },
    )
    expect(lines).toEqual(['Row 5, Amount: "abc" isn\'t a number', "New row 2: Name is required", "A row: row not found"])
  })
  it("counts the cells a batch writes", () => {
    expect(batchCells({ kind: "paste", patch: [{ row: "r1", values: { name: "A", amount: "1" } }], create: [{ values: { name: "B" } }] })).toBe(3)
    expect(batchCells({ kind: "edit" })).toBe(0)
  })
})
