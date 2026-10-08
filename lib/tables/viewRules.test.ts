import { afterEach, describe, expect, it } from "vitest"
import { applyViewRules, fitRules, kindOfField, loadViewRules, NO_RULES, saveViewRules, type ViewRules } from "@/lib/tables/viewRules"
import type { TableField, TableRow } from "@/services/tableService"

const field = (id: string, type: TableField["type"], config: object = {}): TableField => ({
  id,
  table_id: "t",
  name: id,
  type,
  config: JSON.stringify(config),
  position: 0,
})
const fields = [
  field("item", "text"),
  field("cost", "number"),
  field("due", "date"),
  field("paid", "checkbox"),
  field("tags", "multi_select"),
  field("status", "formula", { formula: "...", result: "text" }),
  field("total", "formula", { formula: "...", result: "number" }),
]
const row = (id: string, values: Record<string, unknown>): TableRow => ({
  id,
  table_id: "t",
  position: 0,
  created_at: "",
  updated_at: "",
  values: JSON.stringify(values),
})
const rows = [
  row("film", { item: "Launch film", cost: 1200, due: "2026-10-06", paid: true, tags: ["Video"], status: "Paid", total: 1200 }),
  row("booth", { item: "Booth", cost: 850, due: "2026-10-08", tags: ["Events", "Print"], status: "Overdue", total: 1700 }),
  row("ads", { item: "ads", cost: 40, due: "2026-10-09", tags: [], status: "Due today", total: 280 }),
  row("kit", { item: "Press kit", due: "", status: { error: "Divided by zero" } }),
]
const ids = (rs: TableRow[]) => rs.map((r) => r.id)
const rules = (r: Partial<ViewRules>): ViewRules => ({ ...NO_RULES, ...r })

describe("sorting a table", () => {
  it("leaves the rows as they are without rules", () => {
    expect(applyViewRules(rows, fields, NO_RULES)).toBe(rows)
  })

  it("orders by the field's kind, with blanks last either way", () => {
    expect(ids(applyViewRules(rows, fields, rules({ sort: [{ field: "cost", dir: "asc" }] })))).toEqual(["ads", "booth", "film", "kit"])
    expect(ids(applyViewRules(rows, fields, rules({ sort: [{ field: "cost", dir: "desc" }] })))).toEqual(["film", "booth", "ads", "kit"])
    expect(ids(applyViewRules(rows, fields, rules({ sort: [{ field: "due", dir: "desc" }] })))).toEqual(["ads", "booth", "film", "kit"])
    // Text ignores case.
    expect(ids(applyViewRules(rows, fields, rules({ sort: [{ field: "item", dir: "asc" }] })))).toEqual(["ads", "booth", "film", "kit"])
    // A formula by what it gives; an error has no value, so it goes last.
    expect(ids(applyViewRules(rows, fields, rules({ sort: [{ field: "total", dir: "desc" }] })))).toEqual(["booth", "film", "ads", "kit"])
    expect(ids(applyViewRules(rows, fields, rules({ sort: [{ field: "status", dir: "asc" }] })))).toEqual(["ads", "booth", "film", "kit"])
  })

  it("breaks ties with the next rule, then keeps the rows' order", () => {
    const tied = [row("a", { paid: true, cost: 2 }), row("b", { paid: false, cost: 9 }), row("c", { paid: true, cost: 5 }), row("d", { paid: false, cost: 9 })]
    const sort = rules({ sort: [{ field: "paid", dir: "desc" }, { field: "cost", dir: "desc" }] })
    expect(ids(applyViewRules(tied, fields, sort))).toEqual(["c", "a", "b", "d"])
  })
})

describe("filtering a table", () => {
  const only = (r: Partial<ViewRules>) => ids(applyViewRules(rows, fields, rules(r)))

  it("matches text without minding capitals", () => {
    expect(only({ filters: [{ field: "item", op: "contains", value: "LAUNCH" }] })).toEqual(["film"])
    expect(only({ filters: [{ field: "item", op: "is", value: "booth" }] })).toEqual(["booth"])
    expect(only({ filters: [{ field: "status", op: "is_not", value: "Paid" }] })).toEqual(["booth", "ads", "kit"])
  })

  it("compares numbers and days", () => {
    expect(only({ filters: [{ field: "cost", op: "gt", value: "500" }] })).toEqual(["film", "booth"])
    expect(only({ filters: [{ field: "total", op: "lte", value: "1,200" }] })).toEqual(["film", "ads"])
    expect(only({ filters: [{ field: "due", op: "before", value: "2026-10-08" }] })).toEqual(["film"])
    expect(only({ filters: [{ field: "due", op: "is", value: "2026-10-08" }] })).toEqual(["booth"])
  })

  it("finds empty cells, ticks and list items", () => {
    expect(only({ filters: [{ field: "cost", op: "empty" }] })).toEqual(["kit"])
    expect(only({ filters: [{ field: "due", op: "not_empty" }] })).toEqual(["film", "booth", "ads"])
    expect(only({ filters: [{ field: "paid", op: "unchecked" }] })).toEqual(["booth", "ads", "kit"])
    expect(only({ filters: [{ field: "tags", op: "contains", value: "print" }] })).toEqual(["booth"])
    expect(only({ filters: [{ field: "tags", op: "empty" }] })).toEqual(["ads", "kit"])
  })

  it("needs every filter to pass, or any one", () => {
    const both = [
      { field: "paid", op: "checked" as const },
      { field: "cost", op: "lt" as const, value: "100" },
    ]
    expect(only({ filters: both })).toEqual([])
    expect(only({ filters: both, match: "any" })).toEqual(["film", "ads"])
  })

  it("ignores a filter not filled in yet, and one on a field that's gone", () => {
    expect(only({ filters: [{ field: "item", op: "contains", value: " " }] })).toHaveLength(4)
    expect(only({ filters: [{ field: "deleted", op: "empty" }], sort: [{ field: "deleted", dir: "asc" }] })).toHaveLength(4)
  })
})

describe("a formula field", () => {
  it("is sorted and filtered by what it gives", () => {
    expect(kindOfField(fields[6])).toBe("number")
    expect(kindOfField(field("late", "formula", { result: "checkbox" }))).toBe("checkbox")
    expect(kindOfField(field("when", "formula", { result: "date" }))).toBe("date")
  })
})

describe("remembering a table's rules", () => {
  afterEach(() => localStorage.clear())

  it("keeps them for the table, without rules on fields deleted since", () => {
    saveViewRules("t", {
      sort: [{ field: "cost", dir: "desc" }, { field: "gone", dir: "asc" }],
      filters: [{ field: "paid", op: "checked" }, { field: "cost", op: "nonsense" as never }],
      match: "any",
    })
    expect(loadViewRules("t", fields)).toEqual({ sort: [{ field: "cost", dir: "desc" }], filters: [{ field: "paid", op: "checked" }], match: "any" })
    expect(loadViewRules("other", fields)).toEqual(NO_RULES)
  })

  it("forgets them when they're all cleared", () => {
    saveViewRules("t", { sort: [{ field: "cost", dir: "asc" }], filters: [], match: "all" })
    saveViewRules("t", NO_RULES)
    expect(localStorage.getItem("onecamp:tableView:t")).toBeNull()
  })
})

describe("a field whose type changes", () => {
  // Item was text, filtered "contains Booth"; now it's a number, which has no
  // "contains". The filter stopped working while the menu showed another
  // condition; now it goes.
  it("drops filters that no longer fit it, and keeps the rest", () => {
    const retyped = fields.map((f) => (f.id === "item" ? { ...f, type: "number" as const } : f))
    const r = rules({ filters: [{ field: "item", op: "contains", value: "Booth" }, { field: "paid", op: "checked" }], sort: [{ field: "item", dir: "asc" }] })
    expect(fitRules(r, retyped)).toEqual({ ...r, filters: [{ field: "paid", op: "checked" }] })
    expect(ids(applyViewRules(rows, retyped, r))).toEqual(["film"])
    // Rules that fit come back as they were.
    expect(fitRules(r, fields)).toBe(r)
  })
})
