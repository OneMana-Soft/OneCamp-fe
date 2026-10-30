import { afterEach, describe, expect, it } from "vitest"
import {
  filterCount,
  filterDepth,
  filterRules,
  fitRules,
  groupingOf,
  keepInSight,
  loadViewRules,
  ME,
  namesMe,
  NO_RULES,
  readViewRules,
  saveViewRules,
  searchRows,
  type FilterEntry,
  type FilterGroup,
  type FilterRule,
  type ViewRules,
  withGroups,
} from "@/lib/tables/viewRules"
import { applyViewRules, keptReason } from "@/lib/tables/applyRules"
import { filterKind } from "@/lib/fieldTypes/registry"
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
  field("vendor", "relation", { relation_target: "table", table_id: "v" }),
]
const row = (id: string, values: Record<string, unknown>): TableRow => ({
  id,
  table_id: "t",
  position: 0,
  created_at: "",
  updated_at: "",
  values: JSON.stringify(values),
})
const ref = (label: string, type = "row") => ({ id: type === "more" ? "" : label, label, type, table_id: "v" })
const rows = [
  row("film", { vendor: [ref("Acme"), ref("250 more", "more")], item: "Launch film", cost: 1200, due: "2026-10-06", paid: true, tags: ["Video"], status: "Paid", total: 1200 }),
  row("booth", { vendor: [ref("Globex")], item: "Booth", cost: 850, due: "2026-10-08", tags: ["Events", "Print"], status: "Overdue", total: 1700 }),
  row("ads", { vendor: [ref("12 links", "more")], item: "ads", cost: 40, due: "2026-10-09", tags: [], status: "Due today", total: 280 }),
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

  it("reads a link cell by the names it shows, not its count of the rest", () => {
    expect(only({ filters: [{ field: "vendor", op: "contains", value: "acme" }] })).toEqual(["film"])
    expect(only({ filters: [{ field: "vendor", op: "contains", value: "250 more" }] })).toEqual([])
    // A cell counting links it doesn't name still has links.
    expect(only({ filters: [{ field: "vendor", op: "empty" }] })).toEqual(["kit"])
    expect(ids(applyViewRules(rows, fields, rules({ sort: [{ field: "vendor", dir: "asc" }] })))).toEqual(["film", "booth", "ads", "kit"])
  })

  it("ignores a filter not filled in yet, and one on a field that's gone", () => {
    expect(only({ filters: [{ field: "item", op: "contains", value: " " }] })).toHaveLength(4)
    expect(only({ filters: [{ field: "deleted", op: "empty" }], sort: [{ field: "deleted", dir: "asc" }] })).toHaveLength(4)
  })
})

describe("a formula field", () => {
  it("is sorted and filtered by what it gives", () => {
    expect(filterKind(fields[6])).toBe("number")
    expect(filterKind(field("late", "formula", { result: "checkbox" }))).toBe("checkbox")
    expect(filterKind(field("when", "formula", { result: "date" }))).toBe("date")
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

// Tables V4: a view's filters nest in groups, three deep and fifty in all, as
// the server's spec takes them (business/QuerySpec MaxFilterDepth, MaxConditions).
describe("groups of filters, as a browser or a saved view keeps them", () => {
  const has = (value: string): FilterRule => ({ field: "item", op: "contains", value })

  it("reads the flat filters kept before there were groups as they were", () => {
    const flat = { sort: [{ field: "cost", dir: "asc" }], filters: [has("a"), { field: "paid", op: "checked" }], match: "any" }
    expect(readViewRules(flat, fields)).toEqual(flat)
  })

  it("keeps groups three deep, the view's own list the first, and drops any deeper", () => {
    const kept = { match: "any", filters: [has("1"), { match: "all", filters: [has("2"), { match: "any", filters: [has("3")] }] }] }
    expect(readViewRules({ filters: [kept] }, fields).filters).toEqual([
      { match: "any", filters: [has("1"), { match: "all", filters: [has("2")] }] },
    ])
    // A group that says neither matches all.
    expect(readViewRules({ filters: [{ match: "most", filters: [has("1")] }] }, fields).filters).toEqual([{ match: "all", filters: [has("1")] }])
  })

  it("keeps fifty filters, every group's together, in the order they're kept", () => {
    const thirty = Array.from({ length: 30 }, (_, i) => has(String(i)))
    const read = readViewRules({ filters: [...thirty, { match: "any", filters: thirty }] }, fields).filters
    expect(read).toHaveLength(31)
    expect(read.slice(0, 30)).toEqual(thirty)
    expect(read[30]).toEqual({ match: "any", filters: thirty.slice(0, 20) })
  })

  it("keeps rules that fit as they were, and drops a group none of whose filters fits any more", () => {
    const either: FilterGroup = { match: "any", filters: [has("booth"), { field: "paid", op: "checked" }] }
    const costly: FilterGroup = { match: "all", filters: [{ field: "cost", op: "gt", value: "500" }] }
    const r = rules({ filters: [either, costly] })
    expect(fitRules(r, fields)).toBe(r)
    // Item becomes a number, which has no "contains": the group keeps the filter that still fits.
    const retyped = fields.map((f) => (f.id === "item" ? { ...f, type: "number" as const } : f))
    const fitted = fitRules(r, retyped)
    expect(fitted.filters).toEqual([{ match: "any", filters: [{ field: "paid", op: "checked" }] }, costly])
    expect(fitted.filters[1]).toBe(costly)
    // Paid goes too: the group is left with no filter, so it goes.
    expect(fitRules(r, retyped.filter((f) => f.id !== "paid")).filters).toEqual([costly])
  })

  it("finds every filter in its groups: how many, how deep they go, and whether one names me", () => {
    const deep: FilterEntry[] = [has("1"), { match: "any", filters: [has("2"), { match: "all", filters: [has("3"), { field: "owners", op: "contains", value: ME }] }] }]
    expect(filterRules(deep).map((r) => r.value)).toEqual(["1", "2", "3", ME])
    expect(filterCount(deep)).toBe(4)
    expect(filterDepth(deep)).toBe(3)
    expect(namesMe(deep)).toBe(true)
    expect(filterDepth([has("1")])).toBe(1)
    expect(filterDepth([])).toBe(1)
    expect(namesMe([has("1"), { match: "any", filters: [has("me")] }])).toBe(false)
  })
})

// TAB-BUG-14: a row added where the view's rules hide it, or sort it away from
// where it was added, stays in sight, last, until the person moves on.
describe("a new row the view would hide or move", () => {
  // Named (a board's card, a duplicate): a blank row sorts last anyway.
  const added = row("new", { item: "Aardvark" })
  const held = [...rows, added]

  it("stays last, and says the filter would hide it", () => {
    const ruled = applyViewRules(held, fields, rules({ filters: [{ field: "item", op: "contains", value: "o" }] }))
    expect(ids(ruled)).not.toContain("new")
    expect(keepInSight(ruled, ruled, held, "new")).toEqual({ rows: [...ruled, added], kept: "filter" })
  })

  it("tells a search from a filter", () => {
    const shown = searchRows(held, "booth")
    expect(keepInSight(shown, held, held, "new")).toEqual({ rows: [...shown, added], kept: "search" })
  })

  it("stays where it was added when the sort puts it elsewhere", () => {
    const sorted = applyViewRules(held, fields, rules({ sort: [{ field: "item", dir: "asc" }] }))
    expect(sorted.at(-1)?.id).not.toBe("new")
    const kept = keepInSight(sorted, sorted, held, "new")
    expect(kept.kept).toBe("sort")
    expect(ids(kept.rows)).toEqual([...ids(sorted).filter((id) => id !== "new"), "new"])
  })

  it("changes nothing for a row already last, one not held, or none", () => {
    expect(keepInSight(held, held, held, "new")).toEqual({ rows: held, kept: null })
    expect(keepInSight(rows, rows, rows, "gone")).toEqual({ rows, kept: null })
    expect(keepInSight(rows, rows, rows, null)).toEqual({ rows, kept: null })
  })
})

// Tables T5c: a view read in windows comes ruled from the server and keeps a
// row added here at its end, so why that row is out of place is read from
// the row alone, with applyViewRules' meaning.
describe("why a row kept at a windowed view's end is out of place", () => {
  it("says the filter would hide it, before anything a sort says", () => {
    const r = rules({ filters: [{ field: "item", op: "contains", value: "o" }], sort: [{ field: "item", dir: "asc" }] })
    expect(keptReason(row("new", { item: "Aardvark" }), fields, r)).toBe("filter")
    expect(keptReason(row("new", { item: "Oboe" }), fields, r)).toBe("sort")
  })

  it("says a sort puts it elsewhere, unless every key it sorts by is blank: blanks sort last, where it is", () => {
    const r = rules({ sort: [{ field: "item", dir: "asc" }, { field: "cost", dir: "desc" }] })
    expect(keptReason(row("new", { item: "Aardvark" }), fields, r)).toBe("sort")
    expect(keptReason(row("new", { cost: 5 }), fields, r)).toBe("sort")
    expect(keptReason(row("new", { item: " \u00a0 " }), fields, r)).toBeNull()
    expect(keptReason(row("new", {}), fields, r)).toBeNull()
  })

  it("says nothing with no rules, or with rules on fields gone", () => {
    expect(keptReason(row("new", { item: "x" }), fields, NO_RULES)).toBeNull()
    expect(keptReason(row("new", { item: "x" }), fields, rules({ sort: [{ field: "gone", dir: "asc" }], filters: [{ field: "gone", op: "contains", value: "z" }] }))).toBeNull()
  })
})

// TAB-BUG-8 in the filter box: a typed filter value was read by deleting its
// commas, so "Cost is 1,5" filtered for 15. It's read now as a number cell
// reads what's typed, in the reader's locale (en-US in these tests).
describe("a number filter's typed value", () => {
  const costs = [row("a", { cost: 1200 }), row("b", { cost: 15 }), row("c", { cost: 1.5 })]
  const where = (value: string) => ids(applyViewRules(costs, fields, rules({ filters: [{ field: "cost", op: "is", value }] })))

  it("takes a currency sign and digit groups", () => {
    expect(where("€1,200")).toEqual(["a"])
  })

  it("never reads a decimal comma as a digit group: what isn't a number in the reader's locale filters nothing", () => {
    expect(where("1,5")).toEqual(["a", "b", "c"])
    expect(where("1.5")).toEqual(["c"])
  })
})


// Tables V2b: up to three levels of groups lead a view's order. A view without
// groups has none at all, so a saved view and the rules shown compare alike.
describe("a view's groups, as a browser or a saved view keeps them", () => {
  afterEach(() => localStorage.clear())
  const withStage = [...fields, field("stage", "select", { options: [{ label: "Won" }] }), field("made", "created_time")]

  it("keeps three groups by fields that group, a date's period, and nothing else", () => {
    const read = readViewRules(
      {
        groups: [
          { field: "stage", dir: "asc" },
          { field: "due", dir: "desc", granularity: "week" },
          { field: "cost", dir: "asc", granularity: "fortnight" },
          { field: "paid", dir: "asc" },
        ],
      },
      withStage,
    )
    expect(read.groups).toEqual([{ field: "stage", dir: "asc" }, { field: "due", dir: "desc", granularity: "week" }, { field: "cost", dir: "asc" }])
    // Text, a list, a link, people and a formula giving text don't group yet; a period fits a date alone.
    for (const g of [{ field: "item" }, { field: "tags" }, { field: "vendor" }, { field: "status" }, { field: "cost", granularity: "month" }])
      expect(readViewRules({ groups: [{ dir: "asc", ...g }] }, withStage)).toEqual(NO_RULES)
    expect(readViewRules({ groups: [{ field: "total", dir: "asc" }, { field: "made", dir: "asc", granularity: "year" }] }, withStage).groups).toHaveLength(2)
    expect(readViewRules({ groups: "stage" }, withStage)).toEqual(NO_RULES)
  })

  it("drops a group whose field is gone or no longer groups, and keeps rules that fit as they were", () => {
    const r = rules({ groups: [{ field: "stage", dir: "asc" }, { field: "paid", dir: "desc" }] })
    expect(fitRules(r, withStage)).toBe(r)
    expect(fitRules(r, withStage.filter((f) => f.id !== "stage"))).toEqual(rules({ groups: [{ field: "paid", dir: "desc" }] }))
    expect(fitRules(r, withStage.map((f) => (f.id === "paid" || f.id === "stage" ? { ...f, type: "text" as const } : f)))).toEqual(NO_RULES)
  })

  it("remembers them, and forgets the rules once groups are cleared too", () => {
    const grouped = rules({ groups: [{ field: "stage", dir: "desc" }] })
    saveViewRules("t", grouped)
    expect(loadViewRules("t", withStage)).toEqual(grouped)
    saveViewRules("t", withGroups(grouped, []))
    expect(localStorage.getItem("onecamp:tableView:t")).toBeNull()
  })

  it("leaves no groups behind when the last goes, and names a grouping by its fields and periods", () => {
    expect(withGroups(rules({ groups: [{ field: "stage", dir: "asc" }] }), [])).toEqual(NO_RULES)
    expect(groupingOf([{ field: "stage", dir: "asc" }, { field: "due", dir: "desc", granularity: "month" }])).toBe("stage|due:month")
  })
})
