// The browser's view rules mean what the server's do (business/RowQuery
// eval.go and order.go), so a table never changes its order, or the rows its
// filters show, as it passes the rows the browser sorts itself (tables T5c).
// Text is blank when it holds only Go's spaces, and is trimmed and
// lower-cased as Go does it; a choice sorts by its option's place, then its
// label; a date by its instant (a day at its midnight in UTC), and a row's
// stamp by the row's own time; a number counts only when it is one; a filter
// on a date reads a moment's day where the reader is.

import { afterEach, describe, expect, it } from "vitest"
import { NO_RULES, type FilterRule, type ViewRules } from "@/lib/tables/viewRules"
import { applyViewRules } from "@/lib/tables/applyRules"
import type { TableField, TableRow } from "@/services/tableService"
import { pinTestClock } from "@/lib/testing/testClock"

// The rows' dates are fixed, and today stands still too (app/testClock.test).
pinTestClock()

const field = (id: string, type: TableField["type"], config: object = {}): TableField => ({
  id,
  table_id: "t",
  name: id,
  type,
  config: JSON.stringify(config),
  position: 0,
})
const row = (id: string, values: Record<string, unknown>, extra: Partial<TableRow> = {}): TableRow => ({
  id,
  table_id: "t",
  position: 0,
  created_at: "",
  updated_at: "",
  values: JSON.stringify(values),
  ...extra,
})
const ids = (rs: TableRow[]) => rs.map((r) => r.id)
const rules = (r: Partial<ViewRules>): ViewRules => ({ ...NO_RULES, ...r })
const sorted = (rows: TableRow[], fields: TableField[], by: string, dir: "asc" | "desc" = "asc") => ids(applyViewRules(rows, fields, rules({ sort: [{ field: by, dir }] })))
const shown = (rows: TableRow[], fields: TableField[], filters: FilterRule[]) => ids(applyViewRules(rows, fields, rules({ filters })))

const original = process.env.TZ
afterEach(() => {
  if (original === undefined) delete process.env.TZ
  else process.env.TZ = original
})

describe("text, as the server reads it", () => {
  const item = field("item", "text")
  const cells = [
    row("ws", { item: " \t " }),
    row("apple", { item: "Apple" }),
    row("none", { item: "" }),
    row("nbsp", { item: "\u00a0" }),
    row("bom", { item: "\ufeff" }),
    row("nel", { item: "\u0085" }),
  ]

  it("is blank when it holds only Go's spaces: last either way, and empty", () => {
    // U+FEFF isn't a space to Go: it is text, whose key is "" (it sorts first).
    expect(sorted(cells, [item], "item")).toEqual(["bom", "apple", "ws", "none", "nbsp", "nel"])
    expect(sorted(cells, [item], "item", "desc")).toEqual(["apple", "bom", "ws", "none", "nbsp", "nel"])
    expect(shown(cells, [item], [{ field: "item", op: "empty" }])).toEqual(["ws", "none", "nbsp", "nel"])
    expect(shown(cells, [item], [{ field: "item", op: "not_empty" }])).toEqual(["apple", "bom"])
  })

  it("compares trimmed and lower-cased as Go does it", () => {
    const note = field("note", "text")
    const notes = [row("paid", { note: "  Paid " }), row("city", { note: "\u0130STANBUL" }), row("road", { note: "ΟΔΟΣ" })]
    expect(shown(notes, [note], [{ field: "note", op: "is", value: "paid" }])).toEqual(["paid"])
    expect(shown(notes, [note], [{ field: "note", op: "is_not", value: "paid" }])).toEqual(["city", "road"])
    // Go lowers İ to i, and a final Σ to σ, one letter at a time.
    expect(shown(notes, [note], [{ field: "note", op: "contains", value: "istanbul" }])).toEqual(["city"])
    expect(shown(notes, [note], [{ field: "note", op: "is", value: "οδοσ" }])).toEqual(["road"])
  })
})

describe("a choice, as the server sorts it", () => {
  const stage = field("stage", "select", {
    options: [
      { id: "o1", label: "Todo" },
      { id: "o2", label: "Doing" },
      { id: "o3", label: "Done" },
      { id: "o4", label: "\u0130stanbul" },
    ],
  })
  const cells = [
    row("done", { stage: "Done" }),
    row("todo", { stage: "todo " }),
    row("arch", { stage: "Archived" }),
    row("doing", { stage: "Doing" }),
    row("none", { stage: "" }),
    row("num", { stage: 5 }),
    row("ist", { stage: "istanbul" }),
    row("zz", { stage: "Zebra" }),
  ]

  it("sorts by its option's place, then its label; a label no option has after them all; a cell that isn't text is blank", () => {
    expect(sorted(cells, [stage], "stage")).toEqual(["todo", "doing", "done", "ist", "arch", "zz", "none", "num"])
    expect(sorted(cells, [stage], "stage", "desc")).toEqual(["zz", "arch", "ist", "done", "doing", "todo", "none", "num"])
  })
})

describe("dates, as the server reads them", () => {
  const due = field("due", "date")
  const cells = [
    row("m1", { due: "2026-10-18T20:00:00+05:30" }),
    row("day", { due: "2026-10-18" }),
    row("m2", { due: "2026-10-17T23:00:00-05:00" }),
    row("bad", { due: "2026-02-30" }),
    row("local", { due: "2026-10-18T20:00" }),
    row("soon", { due: "soon" }),
    row("frac", { due: "2026-10-18T14:30:00.5Z" }),
  ]

  it("sort by their instant, a day at its midnight in UTC; what isn't a date is blank", () => {
    expect(sorted(cells, [due], "due")).toEqual(["day", "m2", "m1", "frac", "bad", "local", "soon"])
    expect(sorted(cells, [due], "due", "desc")).toEqual(["frac", "m1", "m2", "day", "bad", "local", "soon"])
  })

  it("filter by the day a moment falls on where the reader is", () => {
    process.env.TZ = "Asia/Kolkata"
    const days = [row("night", { due: "2026-10-18T20:00:00Z" }), row("day", { due: "2026-10-18" }), row("morning", { due: "2026-10-18T03:00:00Z" })]
    expect(shown(days, [due], [{ field: "due", op: "is", value: "2026-10-19" }])).toEqual(["night"])
    expect(shown(days, [due], [{ field: "due", op: "is", value: "2026-10-18" }])).toEqual(["day", "morning"])
    expect(shown(days, [due], [{ field: "due", op: "before", value: "2026-10-19" }])).toEqual(["day", "morning"])
    expect(shown(days, [due], [{ field: "due", op: "after", value: "2026-10-18" }])).toEqual(["night"])
  })

  it("leave every row when the day asked for isn't one", () => {
    expect(shown(cells, [due], [{ field: "due", op: "is", value: "2026-02-30" }])).toEqual(ids(cells))
  })

  it("sort and filter a row's stamp by the row's own time, not the second its cell shows", () => {
    process.env.TZ = "Asia/Kolkata"
    const made = field("made", "created_time")
    const stamped = [
      row("late", { made: "2026-10-18T10:00:00Z" }, { created_at: "2026-10-18T10:00:00.25Z" }),
      row("early", { made: "2026-10-18T09:00:00Z" }, { created_at: "2026-10-18T09:00:00Z" }),
      row("same", { made: "2026-10-18T10:00:00Z" }, { created_at: "2026-10-18T10:00:00.1Z" }),
      row("night", { made: "2026-10-18T20:00:00Z" }, { created_at: "2026-10-18T20:00:00Z" }),
    ]
    expect(sorted(stamped, [made], "made")).toEqual(["early", "same", "late", "night"])
    expect(shown(stamped, [made], [{ field: "made", op: "is", value: "2026-10-19" }])).toEqual(["night"])
  })
})

describe("numbers, as the server reads them", () => {
  const cost = field("cost", "number")
  const cells = [row("text", { cost: "1,200" }), row("n900", { cost: 900 }), row("word", { cost: "abc" }), row("n1500", { cost: 1500 })]

  it("count only when the cell holds a number", () => {
    expect(sorted(cells, [cost], "cost")).toEqual(["n900", "n1500", "text", "word"])
    expect(shown(cells, [cost], [{ field: "cost", op: "gt", value: "1000" }])).toEqual(["n1500"])
  })
})

describe("lists, as the server reads them", () => {
  const tags = field("tags", "multi_select", { options: [{ id: "v", label: "Video" }, { id: "p", label: "Print" }] })
  const cells = [row("video", { tags: [" Video "] }), row("blankish", { tags: ["  "] }), row("print", { tags: ["Print"] })]

  it("compare trimmed labels, and drop the blank ones", () => {
    expect(shown(cells, [tags], [{ field: "tags", op: "contains", value: "video" }])).toEqual(["video"])
    expect(shown(cells, [tags], [{ field: "tags", op: "empty" }])).toEqual(["blankish"])
    expect(shown(cells, [tags], [{ field: "tags", op: "not_contains", value: "video" }])).toEqual(["blankish", "print"])
  })
})
