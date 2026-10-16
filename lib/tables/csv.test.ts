import { describe, expect, it } from "vitest"
import { toCsv } from "@/lib/tables/csv"
import type { TableField, TableRow } from "@/services/tableService"

const field = (id: string, name: string, type: TableField["type"], config: Record<string, unknown> = {}): TableField => ({ id, table_id: "t", name, type, config: JSON.stringify(config), position: 0 })
const row = (values: Record<string, unknown>): TableRow => ({ id: "r1", table_id: "t", position: 0, created_at: "", updated_at: "", values: JSON.stringify(values) })

// TAB-BUG-5: a linked item the reader can't open is exported as the grid shows
// it, never by its id.
describe("an exported relation cell", () => {
  it("names what the reader may open, and puts the rest as one phrase", () => {
    const links = field("links", "Links", "relation", { relation_target: "doc" })
    const csv = toCsv([links], [row({ links: [{ id: "d1", type: "doc", label: "Plan" }, { id: "secret-1", type: "doc", hidden: true }, { id: "secret-2", type: "doc", hidden: true }] })])
    expect(csv).toBe('Links\r\n"Plan, 2 things you can\'t open"')
    expect(csv).not.toMatch(/secret/)
  })

  it("never writes an item's id, even one that comes without its name", () => {
    const links = field("links", "Links", "relation", { relation_target: "doc" })
    const csv = toCsv([links], [row({ links: { id: "secret-1", type: "doc" } })])
    expect(csv).toBe("Links\r\nSomething you can't open")
  })
})

// TAB-BUG-11: the guard against spreadsheet formulas caught negative numbers
// too, and wrote -120 as the text '-120, which a sum skips.
describe("exported numbers", () => {
  it("are written as numbers, negatives too, in number columns and in formulas and rollups that give one", () => {
    const fields = [
      field("cost", "Cost", "number"),
      field("net", "Net", "formula", { formula: "{Cost} - 200", result: "number" }),
      field("paid", "Paid", "rollup", { relation: "r", field: "f", aggregate: "sum", result: "number" }),
    ]
    expect(toCsv(fields, [row({ cost: -120, net: -320, paid: "-15.5" })])).toBe("Cost,Net,Paid\r\n-120,-320,-15.5")
  })

  it("leave what isn't a number in a number column as guarded text", () => {
    expect(toCsv([field("cost", "Cost", "number")], [row({ cost: "-TBD" })])).toBe(`Cost\r\n"'-TBD"`)
  })

  it("never unguard text: formulas, a leading minus, a tab or a carriage return", () => {
    const note = field("note", "Note", "text")
    const csv = (v: string) => toCsv([note], [row({ note: v })]).split("\r\n")[1]
    expect(csv("=SUM(A1)")).toBe(`"'=SUM(A1)"`)
    expect(csv("-note")).toBe(`"'-note"`)
    expect(csv("-120")).toBe(`"'-120"`)
    expect(csv("\t=1+1")).toBe(`"'\t=1+1"`)
    expect(csv("\r=1+1")).toBe(`"'\r=1+1"`)
    expect(csv("plain")).toBe("plain")
  })
})
