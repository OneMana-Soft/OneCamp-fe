import { describe, expect, it } from "vitest"
import { blockText, exportText } from "@/lib/tables/cellText"
import { toCsv } from "@/lib/tables/csv"
import type { FieldType, TableField, TableRow } from "@/services/tableService"
import { pinTestClock } from "@/lib/testing/testClock"

pinTestClock()

const f = (id: string, type: FieldType, name = id): TableField => ({ id, table_id: "t", name, type, config: "{}", position: 0 })
const name = f("name", "text", "Name")
const amount = f("amount", "number", "Amount")
const paid = f("paid", "checkbox", "Paid")
const stage = f("stage", "select", "Stage")
const due = f("due", "date", "Due")
const row = (id: string, values: Record<string, unknown>): TableRow => ({ id, table_id: "t", position: 0, created_at: "", updated_at: "", values: JSON.stringify(values) })

describe("blockText: a block of the grid's cells as a copy carries them (G1)", () => {
  it("says each cell as the CSV export does, row by row in the fields' order", () => {
    const rows = [row("r1", { name: "Lamp", amount: 1234.5, paid: true, stage: "Won", due: "2026-10-31" }), row("r2", { name: "Desk" })]
    expect(blockText(rows, [name, amount, paid, stage, due])).toEqual([
      ["Lamp", "1234.5", "true", "Won", "2026-10-31"],
      ["Desk", "", "", "", ""],
    ])
  })
  it("reads a row's values through the caller, so a cell still saving copies as it shows", () => {
    expect(blockText([row("r1", { name: "Lamp" })], [name], () => ({ name: "Lamp shade" }))).toEqual([["Lamp shade"]])
  })
  it("is the CSV export's own cell text", () => {
    const r = row("r1", { name: "Lamp", amount: 3, paid: false })
    const csvCells = toCsv([name, amount, paid], [r]).split("\r\n")[1]
    expect(csvCells).toBe([exportText(name, "Lamp"), exportText(amount, 3), exportText(paid, false)].join(","))
  })
})
