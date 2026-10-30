import { describe, expect, it } from "vitest"
import type { TableField } from "@/services/tableService"
import { choicesOf, matchColumns, readPreview, rowsToCome, SHEET_EXTENSIONS, withColumn, type SheetPreview } from "./sheetImport"

const preview: SheetPreview = {
  signs: { decimal: ".", group: "," },
  day_first: true,
  zone: "Asia/Kolkata",
  sheets: [
    {
      index: 0,
      name: "Deals",
      rows: 12,
      fields: [
        { key: "item", name: "Item", type: "text", field: "f_item" },
        { key: "amount", name: "Amount", type: "number" },
        { key: "stage", name: "Stage", type: "select", field: "f_stage" },
      ],
      sample: [["Booth", "1200", "To do"]],
    },
    { index: 1, name: "Lists", hidden: true, rows: 4, fields: [{ key: "a", name: "A", type: "text" }], sample: [] },
  ],
}
const field = (id: string, type: TableField["type"]) => ({ id, table_id: "t1", name: id, type, config: "{}", position: 0 }) as TableField

describe("a spreadsheet's choices", () => {
  it("bring every sheet the file shows, each column as it was guessed", () => {
    const c = choicesOf(preview)
    expect(c).toMatchObject({ signs: { decimal: "." }, day_first: true, zone: "Asia/Kolkata" })
    expect(c.sheets[0]).toEqual({
      index: 0,
      bring: true,
      fields: [
        { key: "item", name: "Item", type: "text", leave: false },
        { key: "amount", name: "Amount", type: "number", leave: false },
        { key: "stage", name: "Stage", type: "select", leave: false },
      ],
    })
    // A sheet hidden in the file stays out until it's chosen.
    expect(c.sheets[1].bring).toBe(false)
    expect(rowsToCome(preview, c)).toBe(12)
  })

  it("into a table, bring only the sheet chosen there, each column into its field or left out", () => {
    const c = choicesOf(preview, { table: "t1", sheet: 0 })
    expect(c.sheets[0]).toEqual({
      index: 0,
      bring: true,
      into: "t1",
      match_by: "",
      fields: [
        { key: "item", field: "f_item", leave: false },
        { key: "amount", field: "", leave: true },
        { key: "stage", field: "f_stage", leave: false },
      ],
    })
    expect(c.sheets[1]).toEqual({ index: 1, bring: false, fields: [{ key: "a", leave: true }] })
  })

  it("match rows only by a column into a field whose kind keeps a value whole, and forget it once it changes", () => {
    const fields = [field("f_item", "text"), field("f_stage", "select")]
    const c = choicesOf(preview, { table: "t1", sheet: 0 }).sheets[0]
    expect(matchColumns(c, fields).map((f) => f.key)).toEqual(["item"])
    const keyed = { ...c, match_by: "item" }
    expect(withColumn(keyed, "stage", { leave: true }).match_by).toBe("item")
    expect(withColumn(keyed, "item", { field: "f_stage" }).match_by).toBe("")
  })

  it("count no rows of a sheet whose every column is left out", () => {
    const c = choicesOf(preview)
    const none = { ...c, sheets: c.sheets.map((s) => ({ ...s, fields: s.fields.map((f) => ({ ...f, leave: true })) })) }
    expect(rowsToCome(preview, none)).toBe(0)
  })

  it("read a preview whole, and nothing that isn't one", () => {
    expect(readPreview({ sheets: [{ index: 0, name: "S", rows: 1 }] })?.sheets[0]).toMatchObject({ fields: [], sample: [], notes: [] })
    expect(readPreview({ day_first: false, sheets: [] })?.day_first).toBe(false)
    expect(readPreview(null)).toBeNull()
    expect(readPreview({ sheets: "no" })).toBeNull()
  })
})

// The import dialog offers these files, and the server's sheet readers read exactly these (business/ContentIO
// sheets_test.go TestSheetReadersReadTheFilesTheWebOffers pins the same five). On 26 Oct the dialog filtered them by
// the doc importers' extensions and refused every sheet.
describe("the files a spreadsheet import offers", () => {
  it("are the five the server's sheet readers read", () => {
    expect([...SHEET_EXTENSIONS].sort()).toEqual([".csv", ".ods", ".tsv", ".xlsm", ".xlsx"])
  })
})
