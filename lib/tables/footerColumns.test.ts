import { describe, expect, it, vi } from "vitest"
import { FooterColumns } from "./footerColumns"
import { parseRowValues, type TableRow } from "@/services/tableService"

const row = (id: string, values: Record<string, unknown>): TableRow => ({ id, table_id: "t", position: 0, created_at: "", updated_at: "", values: JSON.stringify(values) })
const sorted = (vals: readonly unknown[]) => [...vals].map((v) => JSON.stringify(v)).sort()

// The summary bar's columns (tables T6b): each footer is worked out again
// only when its own column's values change.
describe("a table's footer columns", () => {
  const rows = [row("a", { cost: 1, item: "Booth" }), row("b", { cost: 2, item: "Banner" }), row("c", { cost: 3, item: "Lights" })]

  it("are each field's values over the rows", () => {
    const cols = new FooterColumns().read(rows, ["cost", "item"])
    expect(sorted(cols.get("cost")!.values)).toEqual(sorted([1, 2, 3]))
    expect(sorted(cols.get("item")!.values)).toEqual(sorted(["Booth", "Banner", "Lights"]))
  })

  it("read the one row a commit wrote, and change only the column whose value changed", () => {
    const valuesOf = vi.fn(parseRowValues)
    const fc = new FooterColumns(valuesOf)
    const before = fc.read(rows, ["cost", "item"])
    const cost = before.get("cost")
    const item = before.get("item")
    valuesOf.mockClear()
    const next = rows.slice()
    next[1] = row("b", { cost: 20, item: "Banner" })
    const after = fc.read(next, ["cost", "item"])
    expect(valuesOf).toHaveBeenCalledTimes(1)
    expect(after.get("item")).toBe(item)
    expect(after.get("cost")).not.toBe(cost)
    expect(sorted(after.get("cost")!.values)).toEqual(sorted([1, 20, 3]))
    // The column handed out before is as it was.
    expect(sorted(cost!.values)).toEqual(sorted([1, 2, 3]))
  })

  it("change no column for the same rows in another order, and the same rows again", () => {
    const fc = new FooterColumns()
    const before = fc.read(rows, ["cost"])
    const cost = before.get("cost")
    expect(fc.read([rows[2], rows[0], rows[1]], ["cost"]).get("cost")).toBe(cost)
    expect(fc.read(rows.slice(), ["cost"]).get("cost")).toBe(cost)
  })

  it("follow rows added and taken away, and a written row among them", () => {
    const fc = new FooterColumns()
    fc.read(rows, ["cost", "item"])
    const next = [row("c", { cost: 30, item: "Lights" }), rows[0], row("d", { cost: 4, item: "Tent" })]
    const cols = fc.read(next, ["cost", "item"])
    expect(sorted(cols.get("cost")!.values)).toEqual(sorted([30, 1, 4]))
    expect(sorted(cols.get("item")!.values)).toEqual(sorted(["Lights", "Booth", "Tent"]))
    // And back again: every slot moved stays its row's.
    const back = fc.read(rows, ["cost", "item"])
    expect(sorted(back.get("cost")!.values)).toEqual(sorted([1, 2, 3]))
    expect(fc.read([], ["cost"]).get("cost")!.values).toEqual([])
  })

  it("read every row again for another set of fields", () => {
    const fc = new FooterColumns()
    fc.read(rows, ["cost"])
    const cols = fc.read(rows, ["cost", "item"])
    expect(sorted(cols.get("item")!.values)).toEqual(sorted(["Booth", "Banner", "Lights"]))
  })

  it("keep a list's column when a commit leaves the list as it was", () => {
    const fc = new FooterColumns()
    const tags = [row("a", { tags: ["x", "y"], n: 1 })]
    const before = fc.read(tags, ["tags", "n"])
    const after = fc.read([row("a", { tags: ["x", "y"], n: 2 })], ["tags", "n"])
    expect(after.get("tags")).toBe(before.get("tags"))
    expect(after.get("n")).not.toBe(before.get("n"))
  })
})
