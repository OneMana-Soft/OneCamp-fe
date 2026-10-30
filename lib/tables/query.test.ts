import { describe, expect, it } from "vitest"
import { rulesToSpec, summariesToSpec } from "@/lib/tables/query"
import { NO_RULES, type ViewRules } from "@/lib/tables/viewRules"
import type { TableField } from "@/services/tableService"
import { pinTestClock } from "@/lib/testing/testClock"

// A date formula filters by a day (2026-10-29): the clock is pinned, as the guard asks.
pinTestClock()

const field = (id: string, type: TableField["type"], config: object = {}): TableField => ({ id, table_id: "t", name: id, type, config: JSON.stringify(config), position: 0 })
const fields = [
  field("item", "text"),
  field("cost", "number"),
  field("who", "people"),
  field("vendor", "relation", { relation_target: "table", table_id: "v" }),
  field("total", "formula", { formula: "1", result: "number" }),
  field("tags", "multi_select"),
  field("by", "created_by"),
  field("old", "person"),
]
const rules = (r: Partial<ViewRules>): ViewRules => ({ ...NO_RULES, ...r })
const all = { indexed: true, sorts_text: true }

describe("a view's rules the server can't answer yet stay in the browser", () => {
  it("when the table's index isn't whole, or nothing says", () => {
    expect(rulesToSpec(NO_RULES, fields, undefined)).toBeNull()
    expect(rulesToSpec(NO_RULES, fields, { indexed: false, sorts_text: false })).toBeNull()
    expect(rulesToSpec(NO_RULES, fields, all)).toEqual({})
  })

  it("a sort on text, until its index holds the sort keys", () => {
    const byItem = rules({ sort: [{ field: "item", dir: "asc" }] })
    expect(rulesToSpec(byItem, fields, { indexed: true, sorts_text: false })).toBeNull()
    expect(rulesToSpec(byItem, fields, all)).toEqual({ sorts: [{ field: "field:item" }] })
    expect(rulesToSpec(rules({ sort: [{ field: "cost", dir: "desc" }] }), fields, { indexed: true, sorts_text: false })).toEqual({ sorts: [{ field: "field:cost", desc: true }] })
  })

  it("sorts by a list, people or a link", () => {
    for (const id of ["tags", "who", "vendor", "by"]) expect(rulesToSpec(rules({ sort: [{ field: id, dir: "asc" }] }), fields, all)).toBeNull()
  })

  it("filters naming people or rows", () => {
    for (const id of ["who", "vendor", "by", "old"]) expect(rulesToSpec(rules({ filters: [{ field: id, op: "contains", value: "Sam" }] }), fields, all)).toBeNull()
    expect(rulesToSpec(rules({ filters: [{ field: "who", op: "empty" }] }), fields, all)).toBeNull()
  })

  it("but not a rule on a field that's gone, which the browser ignores too", () => {
    expect(rulesToSpec(rules({ sort: [{ field: "gone", dir: "asc" }], filters: [{ field: "gone", op: "is", value: "x" }] }), fields, all)).toEqual({})
  })
})

// airtable-03: the server sorts, filters and groups by a formula or a rollup
// as what it gives (the Computed Store keeps most of them; the rest it works
// out per read, up to 10,000 rows, and past that refuses in its own words,
// which the table shows). One that can't be worked out stays in the browser,
// which shows its error.
describe("a formula's and a rollup's rules go to the server as what they give", () => {
  const given = [
    field("sum", "formula", { formula: "1", result: "number" }),
    field("label", "formula", { formula: '"a"', result: "text" }),
    field("late", "formula", { formula: "TRUE()", result: "checkbox" }),
    field("next", "formula", { formula: "TODAY()", result: "date" }),
    field("paid", "rollup", { relation: "vendor", field: "amount", aggregate: "sum", result: "number" }),
    field("broken", "formula", { formula: "1 +", result: "number", error: "The formula ends early" }),
  ]
  it("sorts by a number or a date, and by text once the index holds the sort keys", () => {
    expect(rulesToSpec(rules({ sort: [{ field: "sum", dir: "desc" }, { field: "paid", dir: "asc" }, { field: "next", dir: "asc" }] }), given, all)).toEqual({
      sorts: [{ field: "field:sum", desc: true }, { field: "field:paid" }, { field: "field:next" }],
    })
    const byLabel = rules({ sort: [{ field: "label", dir: "asc" }] })
    expect(rulesToSpec(byLabel, given, { indexed: true, sorts_text: false })).toBeNull()
    expect(rulesToSpec(byLabel, given, all)).toEqual({ sorts: [{ field: "field:label" }] })
  })
  it("groups by a number, a tick or a date", () => {
    expect(rulesToSpec(rules({ groups: [{ field: "paid", dir: "desc" }, { field: "late", dir: "asc" }] }), given, all)).toEqual({
      groups: [{ field: "field:paid", desc: true }, { field: "field:late" }],
    })
  })
  it("filters each as what it gives", () => {
    const filters = [
      { field: "sum", op: "gt", value: "3" },
      { field: "late", op: "checked" },
      { field: "next", op: "is", value: "2026-10-29" },
      { field: "label", op: "contains", value: "a" },
      { field: "paid", op: "empty" },
    ] as ViewRules["filters"]
    expect(rulesToSpec(rules({ filters }), given, all)).toEqual({
      filter: {
        op: "and",
        filters: [
          { field: "field:sum", operator: "gt", values: [{ number: 3 }] },
          { field: "field:late", operator: "checked" },
          { field: "field:next", operator: "is", values: [{ text: "2026-10-29" }] },
          { field: "field:label", operator: "contains", values: [{ text: "a" }] },
          { field: "field:paid", operator: "empty" },
        ],
      },
    })
  })
  it("but not by one that can't be worked out", () => {
    expect(rulesToSpec(rules({ sort: [{ field: "broken", dir: "asc" }] }), given, all)).toBeNull()
    expect(rulesToSpec(rules({ filters: [{ field: "broken", op: "gt", value: "1" }] }), given, all)).toBeNull()
  })
})

// The summary bar of a view read in windows (QUERY_STACK_CONTRACT item 8):
// what it shows is asked of the server, which sums every row the view keeps.
describe("the summary bar's choices as the server's summaries", () => {
  const f = (id: string, type: TableField["type"], config = "{}"): TableField => ({ id, table_id: "t", name: id, type, config, position: 0 })
  const fields = [
    f("item", "text"),
    f("cost", "number"),
    f("hours", "duration"),
    f("paid", "checkbox"),
    f("due", "date"),
    f("stage", "status"),
    f("made", "created_time"),
    f("calc", "formula", JSON.stringify({ result: "number" })),
    f("note", "text"),
  ]
  it("asks each shown field's, by the server's names, numbers summing and ticks counting until chosen", () => {
    expect(summariesToSpec(fields, { hours: "average", due: "filled", stage: "pct_filled", note: "filled" }, ["note"])).toEqual([
      { field: "field:cost", fns: ["sum"] },
      { field: "field:hours", fns: ["average"] },
      { field: "field:paid", fns: ["checked", "count"] },
      { field: "field:due", fns: ["filled"] },
      { field: "field:stage", fns: ["pct_filled"] },
      { field: "field:made", fns: ["range"] },
      { field: "field:calc", fns: ["sum"] },
    ])
  })
  it("leaves to the rows loaded a status's groups and a choice its field doesn't offer", () => {
    expect(summariesToSpec(fields, { stage: "groups", calc: "none", item: "sum", cost: "none", hours: "none", paid: "none", made: "none" }, [])).toEqual([])
  })
  // airtable-03 (main's call, 29 Oct): a formula's or a rollup's summaries are
  // the server's, over every row the reader may see, as a stored field's are,
  // and never the loaded window's. One that can't be worked out shows its error.
  it("asks a formula's and a rollup's by what they give, numbers summing and ticks counting until chosen, and none of one with an error", () => {
    const computed = [
      f("calc", "formula", JSON.stringify({ result: "number" })),
      f("owed", "rollup", JSON.stringify({ result: "number", aggregate: "sum" })),
      f("late", "formula", JSON.stringify({ result: "checkbox" })),
      f("label", "formula", JSON.stringify({ result: "text" })),
      f("when", "rollup", JSON.stringify({ result: "date" })),
      f("broken", "formula", JSON.stringify({ result: "number", error: "Unknown field {Nope}" })),
    ]
    expect(summariesToSpec(computed, { owed: "average", label: "filled", when: "count", broken: "sum" }, [])).toEqual([
      { field: "field:calc", fns: ["sum"] },
      { field: "field:owed", fns: ["average"] },
      { field: "field:late", fns: ["checked", "count"] },
      { field: "field:label", fns: ["filled"] },
      { field: "field:when", fns: ["count"] },
    ])
  })
  // gsheets-formatting-01: a colour scale shades a number's cells from the whole view's lowest to its highest.
  it("asks a colour scale's field for its least and most beside its summary, a formula's that gives a number too, and none of a field that isn't a shown number", () => {
    const none = { stage: "groups" as const, cost: "none" as const, hours: "min" as const, paid: "none" as const, made: "none" as const, calc: "none" as const }
    const colors = { rules: [], scales: [{ field: "cost" }, { field: "hours" }, { field: "note" }, { field: "calc" }, { field: "due" }, null] }
    expect(summariesToSpec(fields, none, [], colors)).toEqual([
      { field: "field:cost", fns: ["min", "max"] },
      { field: "field:hours", fns: ["min", "max"] },
      { field: "field:calc", fns: ["min", "max"] },
    ])
    expect(summariesToSpec(fields, none, ["cost"], colors)).toEqual([
      { field: "field:hours", fns: ["min", "max"] },
      { field: "field:calc", fns: ["min", "max"] },
    ])
    expect(summariesToSpec(fields, none, [], { scales: "cost" })).toEqual([{ field: "field:hours", fns: ["min"] }])
  })
  // CR-67's colours should-fix: a view with no summary bar of its own still asks its scales' range, and nothing else.
  it("asks a scale's least and most when the view has no summaries chosen, and no summary besides", () => {
    const colors = { rules: [], scales: [{ field: "cost" }, { field: "note" }] }
    expect(summariesToSpec(fields, null, [], colors)).toEqual([{ field: "field:cost", fns: ["min", "max"] }])
    expect(summariesToSpec(fields, null, [], { rules: [] })).toEqual([])
    expect(summariesToSpec(fields, null, ["cost"], colors)).toEqual([])
  })
})

// Tables V2b: a view's groups lead the server's order (business/RowQuery
// groups.go answers a choice, a tick, a number or a date).
describe("a view's groups as the server's", () => {
  const grouped = [...fields, field("stage", "select", { options: [{ label: "Won" }] }), field("due", "date"), field("paid", "checkbox"), field("made", "created_time")]
  const by = (...groups: NonNullable<ViewRules["groups"]>) => rules({ groups })

  it("go ahead of its sorts, with a date's period", () => {
    const r = { ...by({ field: "stage", dir: "desc" }, { field: "due", dir: "asc", granularity: "month" }, { field: "paid", dir: "asc" }), sort: [{ field: "cost", dir: "asc" as const }] }
    expect(rulesToSpec(r, grouped, all)).toEqual({
      groups: [{ field: "field:stage", desc: true }, { field: "field:due", granularity: "month" }, { field: "field:paid" }],
      sorts: [{ field: "field:cost" }],
    })
    expect(rulesToSpec(by({ field: "made", dir: "asc", granularity: "week" }, { field: "cost", dir: "desc" }), grouped, all)).toEqual({
      groups: [{ field: "field:made", granularity: "week" }, { field: "field:cost", desc: true }],
    })
  })

  it("stay in the browser by a choice until the index holds its sort keys; a formula goes as what it gives", () => {
    expect(rulesToSpec(by({ field: "stage", dir: "asc" }), grouped, { indexed: true, sorts_text: false })).toBeNull()
    expect(rulesToSpec(by({ field: "total", dir: "asc" }), grouped, all)).toEqual({ groups: [{ field: "field:total" }] })
  })
})
