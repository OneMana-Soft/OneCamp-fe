import { describe, expect, it } from "vitest"
import { applyViewRules, groupRows } from "@/lib/tables/applyRules"
import { groupLabel, groupLayout, toggleShut, type GroupPlace } from "@/lib/tables/groups"
import { NO_RULES, type GroupRule, type ViewRules } from "@/lib/tables/viewRules"
import { pinTestClock } from "@/lib/testing/testClock"
import type { TableField, TableRow } from "@/services/tableService"

// A day's name leaves out its year in the year it is: every test runs on the tests' own today.
pinTestClock()

// Tables V2b: a view's groups. In the browser they mean what the server's do
// (business/RowQuery groups.go): the same keys, the same order, every level's
// groups depth first with their counts.

const field = (id: string, type: TableField["type"], config: object = {}): TableField => ({ id, table_id: "t", name: id, type, config: JSON.stringify(config), position: 0 })
const fields = [
  field("item", "text"),
  field("stage", "select", { options: [{ label: "Won" }, { label: "Lost" }] }),
  field("paid", "checkbox"),
  field("cost", "number"),
  field("due", "date"),
  field("made", "created_time"),
]
const row = (id: string, values: Record<string, unknown>, created_at = ""): TableRow => ({ id, table_id: "t", position: 0, created_at, updated_at: "", values: JSON.stringify(values) })
const ids = (rs: TableRow[]) => rs.map((r) => r.id)
const by = (...groups: GroupRule[]): ViewRules => ({ ...NO_RULES, groups })
const shape = (gs: { key: string[]; count: number }[]) => gs.map((g) => `${g.key.join("/")}=${g.count}`).join(" ")

describe("a view grouped in the browser", () => {
  it("puts its groups first in its order, a choice in its options' order and empty last either way", () => {
    const rows = [row("a", { stage: "Lost" }), row("b", { stage: "Won" }), row("c", {}), row("d", { stage: "won " }), row("e", { stage: "Maybe" })]
    expect(ids(applyViewRules(rows, fields, by({ field: "stage", dir: "asc" })))).toEqual(["b", "d", "a", "e", "c"])
    expect(ids(applyViewRules(rows, fields, by({ field: "stage", dir: "desc" })))).toEqual(["e", "a", "b", "d", "c"])
  })

  it("keys a choice by its option's label as the field names it, and a label no option has by its text in lower case", () => {
    const rows = applyViewRules([row("a", { stage: " won" }), row("b", { stage: "Won" }), row("c", { stage: "MAYBE" }), row("d", { stage: "maybe" })], fields, by({ field: "stage", dir: "asc" }))
    expect(shape(groupRows(rows, fields, [{ field: "stage", dir: "asc" }]) ?? [])).toBe("Won=2 maybe=2")
  })

  it("keys a tick by whether it is one, a number in full and a date by its period where the reader is", () => {
    const rows = [
      row("a", { paid: true, cost: 1e21, due: "2026-10-18" }),
      row("b", { cost: -0, due: "2026-10-19" }),
      row("c", { paid: false, cost: 30.5, due: "2026-08-31" }),
    ]
    const keys = (g: GroupRule) => shape(groupRows(applyViewRules(rows, fields, by(g)), fields, [g]) ?? [])
    expect(keys({ field: "paid", dir: "desc" })).toBe("true=1 false=2")
    expect(keys({ field: "cost", dir: "asc" })).toBe("0=1 30.5=1 1000000000000000000000=1")
    expect(keys({ field: "due", dir: "asc", granularity: "week" })).toBe("2026-08-31=1 2026-10-12=1 2026-10-19=1")
    expect(keys({ field: "due", dir: "desc", granularity: "quarter" })).toBe("2026-10-01=2 2026-07-01=1")
    expect(keys({ field: "due", dir: "asc" })).toBe("2026-08-31=1 2026-10-18=1 2026-10-19=1")
  })

  it("puts a moment in the day it is where the reader is", () => {
    // 20:00 UTC on the 18th is the 19th in India (the zone the query sends the server).
    const at = new Date("2026-10-18T20:00:00Z")
    const local = `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, "0")}-${String(at.getDate()).padStart(2, "0")}`
    const rows = [row("a", {}, "2026-10-18T20:00:00Z")]
    expect(shape(groupRows(rows, fields, [{ field: "made", dir: "asc", granularity: "day" }]) ?? [])).toBe(`${local}=1`)
  })

  it("counts every level's groups, depth first, and the rows' place under them", () => {
    const rows = [row("a", { stage: "Won", paid: true }), row("b", { stage: "Won", paid: true }), row("c", { stage: "Won" }), row("d", { stage: "Lost" }), row("e", {})]
    const groups: GroupRule[] = [{ field: "stage", dir: "asc" }, { field: "paid", dir: "desc" }]
    const held = groupRows(applyViewRules(rows, fields, by(...groups)), fields, groups) ?? []
    // The server's own fold of these rows (groups_test.go).
    expect(shape(held)).toBe("Won=3 Won/true=2 Won/false=1 Lost=1 Lost/false=1 =1 /false=1")
    expect(held.map((g) => g.from)).toEqual([0, 0, 2, 3, 3, 4, 4])
  })

  it("then sorts within a group, and keeps rows that tie in their order", () => {
    const rows = [row("a", { stage: "Won", cost: 5 }), row("b", { stage: "Lost", cost: 9 }), row("c", { stage: "Won", cost: 7 }), row("d", { stage: "Won", cost: 7 })]
    expect(ids(applyViewRules(rows, fields, { ...by({ field: "stage", dir: "asc" }), sort: [{ field: "cost", dir: "desc" }] }))).toEqual(["c", "d", "a", "b"])
  })

  it("answers no groups past a thousand, as the server refuses to count them", () => {
    const rows = Array.from({ length: 1001 }, (_, i) => row(`r${i}`, { cost: i }))
    expect(groupRows(rows, fields, [{ field: "cost", dir: "asc" }])).toBeNull()
    expect(groupRows(rows.slice(1), fields, [{ field: "cost", dir: "asc" }])).toHaveLength(1000)
  })
})

describe("a grouped view's places", () => {
  // Won (3: true 2, false 1), Lost (1: false 1), every row held in order.
  const counts = [
    { key: ["Won"], count: 3 },
    { key: ["Won", "true"], count: 2 },
    { key: ["Won", "false"], count: 1 },
    { key: ["Lost"], count: 1 },
    { key: ["Lost", "false"], count: 1 },
  ]
  const places = (ps: GroupPlace[]) => ps.map((p) => ("group" in p ? `${p.shut ? "+" : "-"}${p.group.key.join("/")}` : p.row)).join(" ")
  const all = (l: ReturnType<typeof groupLayout>) => Array.from({ length: l.length }, (_, i) => l.at(i))

  it("are each group's header, then the rows of the groups at its last level", () => {
    const l = groupLayout(counts, 2, [], [], 4, 0)
    expect(l.length).toBe(9)
    expect(places(all(l))).toBe("-Won -Won/true 0 1 -Won/false 2 -Lost -Lost/false 3")
    expect(l.at(1)).toMatchObject({ depth: 2 })
    expect([l.header(0), l.header(2)]).toEqual([true, false])
  })

  it("leave out a collapsed group's rows and groups, never its header", () => {
    expect(places(all(groupLayout(counts, 2, [["Won"]], [], 4, 0)))).toBe("+Won -Lost -Lost/false 3")
    expect(places(all(groupLayout(counts, 2, [["Won", "true"]], [], 4, 0)))).toBe("-Won +Won/true -Won/false 2 -Lost -Lost/false 3")
  })

  it("read under windows: the rows of groups collapsed when they were read aren't there, and a row not read yet is on its way", () => {
    // Read without Won's rows: Lost's row is the first read.
    const read = groupLayout(counts, 2, [["Won"]], [["Won"]], 1, 0)
    expect(places(all(read))).toBe("+Won -Lost -Lost/false 0")
    // Won opened again since: its rows are on their way until the windows are read again; Lost's row is still the one read.
    expect(places(all(groupLayout(counts, 2, [], [["Won"]], 1, 0)))).toBe("-Won -Won/true -1 -1 -Won/false -1 -Lost -Lost/false 0")
    // Only two rows read so far.
    expect(places(all(groupLayout(counts, 2, [], [], 2, 0)))).toBe("-Won -Won/true 0 1 -Won/false -1 -Lost -Lost/false -1")
  })

  it("say how far the windows must be read to draw a place", () => {
    const l = groupLayout(counts, 2, [], [], 4, 0)
    expect([0, 2, 3, 4, 5, 8].map((p) => l.readTo(p))).toEqual([0, 1, 2, 2, 3, 4])
  })

  it("keep the rows added here last, after every group", () => {
    const l = groupLayout(counts, 2, [], [], 5, 1)
    expect(l.length).toBe(10)
    expect(l.at(9)).toEqual({ row: 4, n: 4 })
    expect(l.readTo(9)).toBe(4)
  })
})

describe("collapsing a group", () => {
  it("opens one collapsed, collapses one open, and forgets groups the view no longer has", () => {
    const groups = [{ key: ["Won"] }, { key: ["Lost"] }]
    expect(toggleShut([["Gone"]], ["Won"], groups)).toEqual([["Won"]])
    expect(toggleShut([["Won"], ["Lost"]], ["Won"], groups)).toEqual([["Lost"]])
  })
})

describe("a group's name", () => {
  const now = new Date()
  it("says a choice's label, a tick, a number as its field writes it, a date's period and an empty group", () => {
    expect(groupLabel(fields[1], "Won")).toBe("Won")
    expect(groupLabel(fields[2], "true")).toBe("Ticked")
    expect(groupLabel(fields[2], "false")).toBe("Not ticked")
    expect(groupLabel(field("price", "number", { format: { currency: "USD" } }), "1200")).toMatch(/1,200/)
    expect(groupLabel(fields[4], `${now.getFullYear()}-10-19`, "day")).toBe("19 Oct")
    expect(groupLabel(fields[4], "2026-10-19", "week")).toMatch(/^Week of 19 Oct/)
    expect(groupLabel(fields[4], "2026-10-01", "month")).toBe("October 2026")
    expect(groupLabel(fields[4], "2026-10-01", "quarter")).toBe("Q4 2026")
    expect(groupLabel(fields[4], "2026-01-01", "year")).toBe("2026")
    expect(groupLabel(fields[1], "")).toBe("Empty")
  })
})
