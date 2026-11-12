import { describe, expect, it } from "vitest"
import { viewOrder } from "@/lib/tables/applyRules"
import type { ViewRules } from "@/lib/tables/viewRules"
import { pinTestClock } from "@/lib/testing/testClock"
import { byPlace, eachRowOnce, type TableField, type TableRow } from "@/services/tableService"
import { hitsRules, NOT_RULED, planBurst, readById, ruledBy, withCells, type BurstView } from "@/lib/tables/liveRows"
import { nameCells, type Named } from "@/lib/tables/heardRows"
import { liveRun, type RowOrder, type RunHeard } from "@/lib/tables/liveRun"

// Tables L1 (Live Rows #65): what a live message asks of the rows a view
// holds. a: cells outside the rules read alone, no window. b: a delete
// reads nothing; a row made in the table's order is read by id and placed.
// c: a change of a ruled field reads only the windows the row can move.

pinTestClock()

// The run, as useTableRows loads it (its own chunk, handed what it works with).
const { changeRun, placeOf, spliceWindows } = liveRun({ byPlace, eachRowOnce, withCells })

const W = 500
const fields: TableField[] = [
  { id: "item", table_id: "t", name: "Item", type: "text", config: "{}", position: 0 },
  { id: "amount", table_id: "t", name: "Amount", type: "number", config: "{}", position: 1 },
  { id: "note", table_id: "t", name: "Note", type: "text", config: "{}", position: 2 },
  { id: "total", table_id: "t", name: "Total", type: "formula", config: JSON.stringify({ formula: "{Amount} * 2" }), position: 3 },
  { id: "changed", table_id: "t", name: "Changed", type: "modified_time", config: "{}", position: 4 },
  { id: "stage", table_id: "t", name: "Stage", type: "select", config: JSON.stringify({ options: [{ label: "Open" }, { label: "Won" }] }), position: 5 },
]
const key = (i: number) => `k${String(i).padStart(6, "0")}`
const row = (i: number, values: Record<string, unknown> = { item: `Line ${i}`, amount: i }, more: Partial<TableRow> = {}): TableRow => ({
  id: `r${i}`,
  table_id: "t",
  position: i,
  position_key: key(i),
  created_at: "",
  updated_at: "2026-11-06T00:00:00Z",
  version: 1,
  values: JSON.stringify(values),
  ...more,
})
const rules = (r: Partial<ViewRules>): ViewRules => ({ sort: [], filters: [], match: "all", ...r })
const byAmount = rules({ sort: [{ field: "amount", dir: "asc" }] })
const orderOf = (r: ViewRules): RowOrder => viewOrder(fields, r) as RowOrder
const ids = (rs: readonly TableRow[]) => rs.map((r) => r.id)
/** A run of n rows in amount order, from a place. */
const runOf = (n: number, from = 0, next: string | null = null) => ({ rows: Array.from({ length: n }, (_, i) => row(from + i)), from, next, total: next === null ? from + n : from + n + 100 })
const heard = (h: Partial<RunHeard>): RunHeard => ({ fresh: new Map(), narrowed: true, gone: new Set(), made: new Set(), moved: new Set(), ...h })
const fresh = (...rs: TableRow[]) => new Map(rs.map((r) => [r.id, r]))

describe("a burst's rows and the cells it names", () => {
  it("adds up each row's named fields, and reads a row whole once a message named none", () => {
    const rows = new Map<string, Named>()
    nameCells(rows, "r1", ["note"])
    nameCells(rows, "r1", ["item"])
    nameCells(rows, "r2", ["note"])
    nameCells(rows, "r2", undefined)
    nameCells(rows, "r2", ["item"])
    nameCells(rows, "r3", [])
    expect(rows.get("r1")).toEqual(new Set(["note", "item"]))
    expect(rows.get("r2")).toBe("row")
    expect(rows.get("r3")).toBe("row")
  })

  it("knows the fields a view's rules read, and that a formula's or a last change's moves with any change", () => {
    const sorted = ruledBy(rules({ sort: [{ field: "amount", dir: "asc" }], filters: [{ match: "any", filters: [{ field: "item", op: "contains", value: "x" }] }], groups: [{ field: "stage", dir: "asc" }] }), fields)
    expect([...sorted.ids].sort()).toEqual(["amount", "item", "stage"])
    expect(sorted.every).toBe(false)
    expect(ruledBy(rules({ sort: [{ field: "total", dir: "desc" }] }), fields).every).toBe(true)
    expect(ruledBy(rules({ sort: [{ field: "changed", dir: "desc" }] }), fields).every).toBe(true)
    expect(ruledBy(rules({ sort: [{ field: "gone", dir: "asc" }] }), fields)).toBe(NOT_RULED)
    expect(ruledBy(rules({}), fields)).toBe(NOT_RULED)
  })

  it("says a change may move a row when it names a ruled field, or the whole row, or a rule reads what every change changes", () => {
    const ruled = ruledBy(byAmount, fields)
    expect(hitsRules(new Set(["note"]), ruled)).toBe(false)
    expect(hitsRules(new Set(["note", "amount"]), ruled)).toBe(true)
    expect(hitsRules("row", ruled)).toBe(true)
    expect(hitsRules("row", NOT_RULED)).toBe(false)
    expect(hitsRules(new Set(["note"]), ruledBy(rules({ sort: [{ field: "changed", dir: "desc" }] }), fields))).toBe(true)
  })
})

describe("the one read by id a burst asks for", () => {
  const held = new Set(["r1", "r2", "r3"])
  it("a: reads held rows' named cells alone, every field named once, and no row not held whose change moves nothing", () => {
    const updated = new Map<string, Named>([
      ["r1", new Set(["note"])],
      ["r2", new Set(["item", "note"])],
      ["r9", new Set(["note"])],
    ])
    expect(readById(updated, new Set(), held, ruledBy(byAmount, fields))).toEqual({ ids: ["r1", "r2"], fields: ["note", "item"] })
  })

  it("reads whole rows in the same read when one is named whole, made, or not held and may come into the view", () => {
    const ruled = ruledBy(byAmount, fields)
    expect(readById(new Map<string, Named>([["r1", new Set(["note"])], ["r2", "row"]]), new Set(), held, ruled)).toEqual({ ids: ["r1", "r2"], fields: null })
    expect(readById(new Map<string, Named>([["r1", new Set(["note"])], ["r9", new Set(["amount"])]]), new Set(), held, ruled)).toEqual({ ids: ["r1", "r9"], fields: null })
    expect(readById(new Map<string, Named>([["r1", new Set(["note"])]]), new Set(["r7", "r1"]), held, NOT_RULED)).toEqual({ ids: ["r1", "r7"], fields: null })
  })

  it("reads a row made and then changed once, whole, and a row made that's held already not at all", () => {
    expect(readById(new Map<string, Named>([["r7", new Set(["note"])]]), new Set(["r7"]), held, NOT_RULED)).toEqual({ ids: ["r7"], fields: null })
    expect(readById(new Map(), new Set(["r1"]), held, NOT_RULED)).toBeNull()
  })

  it("names no more fields than the server reads, reading whole rows past them", () => {
    const many = new Set(Array.from({ length: 501 }, (_, i) => `f${i}`))
    expect(readById(new Map<string, Named>([["r1", many]]), new Set(), held, NOT_RULED)?.fields).toBeNull()
  })

  it("reads nothing for rows deleted, or changed where nothing of them is held or can move", () => {
    expect(readById(new Map<string, Named>([["r9", new Set(["note"])]]), new Set(), held, ruledBy(byAmount, fields))).toBeNull()
    expect(readById(new Map(), new Set(), held, NOT_RULED)).toBeNull()
  })
})

describe("what a burst asks of a view (V-693: in the runner's chunk)", () => {
  const view = (v: Partial<BurstView>): BurstView => ({ held: new Set(["r1", "r2", "r3"]), pinned: new Set(), rules: byAmount, fields, sums: [], fixed: false, ...v })
  it("a: a cell no rule reads is read alone by id, moves nothing, and asks no sums the bar doesn't read", () => {
    const p = planBurst({ rows: new Map<string, Named>([["r1", new Set(["note"])]]) }, view({ sums: [{ field: "field:amount" }] }))
    expect(p).toEqual({ moved: new Set(), unplaced: false, made: new Set(), ask: { ids: ["r1"], fields: ["note"] }, resum: false })
    expect(planBurst({ rows: new Map<string, Named>([["r1", new Set(["amount"])]]) }, view({ rules: null, sums: [{ field: "field:amount" }] })).resum).toBe(true)
  })
  it("b: a delete reads nothing and asks the sums again; a row made in the table's order is read by id", () => {
    expect(planBurst({ rows: new Map(), gone: new Set(["r2"]) }, view({ rules: null }))).toEqual({ moved: new Set(), unplaced: false, made: new Set(), ask: null, resum: true })
    expect(planBurst({ rows: new Map(), made: new Set(["r9"]) }, view({ rules: null })).ask).toEqual({ ids: ["r9"], fields: null })
  })
  it("c: a ruled field's change may move its row, but one kept at the view's end; where it can't be placed, or a row is made in a ruled view, the windows are read again", () => {
    const amount = new Map<string, Named>([["r1", new Set(["amount"])], ["r2", new Set(["amount"])]])
    const p = planBurst({ rows: amount }, view({ pinned: new Set(["r2"]) }))
    expect([p.moved, p.unplaced, p.ask]).toEqual([new Set(["r1"]), false, { ids: ["r1", "r2"], fields: ["amount"] }])
    expect(planBurst({ rows: amount }, view({ fixed: true }))).toEqual({ moved: new Set(["r1", "r2"]), unplaced: true, made: new Set(), ask: null, resum: false })
    expect(planBurst({ rows: new Map(), made: new Set(["r9"]) }, view({})).unplaced).toBe(true)
  })
})

describe("cells put in a held row", () => {
  it("puts each cell answered in, clears one answered null, takes the row's stamps, and keeps its comments and page", () => {
    const held = row(1, { item: "Old", amount: 5, note: "keep me" }, { comments: 3, page: "doc-1", version: 4 })
    const cells = row(1, { item: "New", note: null, total: 10 }, { version: 5, updated_at: "2026-11-06T01:00:00Z", updated_by: "u2" })
    const out = withCells(held, cells)
    expect(JSON.parse(out.values)).toEqual({ item: "New", amount: 5, total: 10 })
    expect(out).toMatchObject({ version: 5, updated_at: "2026-11-06T01:00:00Z", updated_by: "u2", comments: 3, page: "doc-1" })
  })

  it("keeps the row held when nothing it holds changed", () => {
    const held = row(1, { item: "Same", amount: 5 })
    expect(withCells(held, row(1, { item: "Same" }))).toBe(held)
  })
})

describe("a row's place in a run", () => {
  const run = runOf(10)
  it("in the table's own order, by its place", () => {
    const made = row(4, { item: "Made" }, { id: "rx", position_key: `${key(4)}m` })
    expect(placeOf(run.rows, made, run, null)).toEqual({ at: 5 })
    expect(placeOf(run.rows, row(20), { from: 0, next: "c" }, null)).toBe("after")
    expect(placeOf(run.rows, row(20), { from: 0, next: null }, null)).toEqual({ at: 10 })
  })

  it("in a view's order, by applyRules' comparator; out where its filter drops it; before a run past the view's first row", () => {
    const order = orderOf(rules({ sort: [{ field: "amount", dir: "asc" }], filters: [{ field: "amount", op: "lt", value: "100" }] }))
    expect(placeOf(run.rows, row(3, { amount: 7.5 }, { id: "rx" }), run, order)).toEqual({ at: 8 })
    expect(placeOf(run.rows, row(3, { amount: 500 }, { id: "rx" }), run, order)).toBe("out")
    expect(placeOf(run.rows, row(3, { amount: -1 }, { id: "rx" }), { from: 40, next: null }, order)).toBe("before")
    expect(placeOf(run.rows, row(3, { amount: -1 }, { id: "rx" }), run, order)).toEqual({ at: 0 })
  })
})

describe("a run of windows after a burst", () => {
  const order = orderOf(byAmount)

  it("a: puts the cells in where the rows are held, and reads no window", () => {
    const run = runOf(1500, 0, "1500")
    const out = changeRun(run, heard({ fresh: fresh(row(700, { note: "Seen" })) }), order, false, W)
    expect(out.windows).toBeNull()
    expect(JSON.parse(out.rows[700].values)).toEqual({ item: "Line 700", amount: 700, note: "Seen" })
    expect(out.rows[699]).toBe(run.rows[699])
    expect(out.total).toBe(run.total)
  })

  it("b: drops rows deleted and counts one fewer each, reading nothing", () => {
    const run = runOf(1500, 0, "1500")
    const out = changeRun(run, heard({ gone: new Set(["r3", "r1200", "r9999"]) }), order, false, W)
    expect(out.rows).toHaveLength(1498)
    expect(ids(out.rows)).not.toContain("r3")
    expect(out.total).toBe(run.total - 2)
    expect(out.windows).toBeNull()
  })

  it("b: reads the run again when a row not held is deleted before it (every place in it moves)", () => {
    const out = changeRun(runOf(500, 2000, "2500"), heard({ gone: new Set(["r10"]) }), null, false, W)
    expect(out.windows).toBe("run")
  })

  it("b: puts a row made in the table's order in its place, counts it, and counts one past the run alone", () => {
    const run = runOf(1000, 0, "1000")
    const made = row(0, { item: "Made" }, { id: "rx", position_key: `${key(399)}m` })
    const out = changeRun(run, heard({ fresh: fresh(made), narrowed: false, made: new Set(["rx"]) }), null, false, W)
    expect(ids(out.rows).slice(399, 402)).toEqual(["r399", "rx", "r400"])
    expect(out.total).toBe(run.total + 1)
    expect(out.windows).toBeNull()
    const past = row(0, {}, { id: "ry", position_key: key(5000) })
    const after = changeRun(run, heard({ fresh: fresh(past), narrowed: false, made: new Set(["ry"]) }), null, false, W)
    expect(after.rows).toHaveLength(1000)
    expect(after.total).toBe(run.total + 1)
    const before = changeRun(runOf(500, 2000, "2500"), heard({ fresh: fresh({ ...past, position_key: key(1) }), narrowed: false, made: new Set(["ry"]) }), null, false, W)
    expect(before.from).toBe(2001)
    expect(before.rows).toHaveLength(500)
  })

  it("c: reads only the window a row moved within", () => {
    const run = runOf(1500, 0, "1500")
    const out = changeRun(run, heard({ fresh: fresh(row(600, { amount: 650.5 }, { id: "r600" })), moved: new Set(["r600"]) }), order, false, W)
    expect(out.windows).toEqual({ first: 1, last: 1 })
  })

  it("c: reads no window when a row's new value keeps its place", () => {
    const run = runOf(1500, 0, "1500")
    const out = changeRun(run, heard({ fresh: fresh(row(600, { amount: 600.5 })), moved: new Set(["r600"]) }), order, false, W)
    expect(out.windows).toBeNull()
  })

  it("c: reads the windows between where a row was and where it goes, never every one held", () => {
    const run = runOf(1500, 0, "1500")
    expect(changeRun(run, heard({ fresh: fresh(row(100, { amount: 700.5 })), moved: new Set(["r100"]) }), order, false, W).windows).toEqual({ first: 0, last: 1 })
    expect(changeRun(run, heard({ fresh: fresh(row(1200, { amount: 20.5 })), moved: new Set(["r1200"]) }), order, false, W).windows).toEqual({ first: 0, last: 2 })
  })

  it("c: reads from where a row was to the run's end when it goes past the run, or out of the view (one fewer)", () => {
    const run = runOf(1500, 0, "1500")
    expect(changeRun(run, heard({ fresh: fresh(row(1100, { amount: 99999 })), moved: new Set(["r1100"]) }), order, false, W).windows).toEqual({ first: 2, last: 2 })
    const filtered = orderOf(rules({ sort: [{ field: "amount", dir: "asc" }], filters: [{ field: "amount", op: "lt", value: "5000" }] }))
    const out = changeRun(run, heard({ fresh: fresh(row(700, { amount: 9000 })), moved: new Set(["r700"]) }), filtered, true, W)
    expect(out.windows).toEqual({ first: 1, last: 2 })
    expect(out.total).toBe(run.total - 1)
  })

  it("c: reads from the run's first place to where a row was when it goes before a run past the view's first row", () => {
    const run = runOf(1500, 2000, "3500")
    expect(changeRun(run, heard({ fresh: fresh(row(2600, { amount: 3 })), moved: new Set(["r2600"]) }), order, false, W).windows).toEqual({ first: 0, last: 1 })
  })

  it("c: reads from where a row not held comes in to the run's end, and counts a filtered view again", () => {
    const run = runOf(1500, 0, "1500")
    const comes = row(9000, { amount: 1000.5 })
    const out = changeRun(run, heard({ fresh: fresh(comes), narrowed: false, moved: new Set(["r9000"]) }), order, true, W)
    expect(out.windows).toEqual({ first: 2, last: 2 })
    expect(out.recount).toBe(true)
    const stays = changeRun(run, heard({ fresh: fresh(row(9000, { amount: 99999 })), narrowed: false, moved: new Set(["r9000"]) }), order, false, W)
    expect(stays.windows).toBeNull()
    expect(stays.recount).toBe(false)
    expect(changeRun(runOf(500, 2000, "2500"), heard({ fresh: fresh(comes), narrowed: false, moved: new Set(["r9000"]) }), order, false, W).windows).toBe("run")
  })

  it("c: reads the windows over every row that moved, a place either side for each other", () => {
    const run = runOf(1500, 0, "1500")
    const out = changeRun(run, heard({ fresh: fresh(row(10, { amount: 20.5 }), row(499, { amount: 300.5 })), moved: new Set(["r10", "r499"]) }), order, false, W)
    expect(out.windows).toEqual({ first: 0, last: 1 })
  })
})

describe("windows read again, put in the run", () => {
  const run = runOf(1500, 0, "c1500").rows
  const window = (from: number, n: number, next?: string) => ({ rows: Array.from({ length: n }, (_, i) => row(from + i, { item: "again" })), ...(next ? { next } : {}) })

  it("puts a middle window's rows in its place, the rest as held", () => {
    const out = spliceWindows(run, "c1500", 1, 1, [window(500, 500, "c1000")], W)
    expect(out.rows).toHaveLength(1500)
    expect(JSON.parse(out.rows[500].values).item).toBe("again")
    expect(out.rows[1000]).toBe(run[1000])
    expect(out.next).toBe("c1500")
  })

  it("takes the run's end from its last window read again", () => {
    const out = spliceWindows(run, "c1500", 1, 2, [window(500, 500, "c1000"), window(1000, 500, "c1500b")], W)
    expect(out.next).toBe("c1500b")
    const ended = spliceWindows(run, "c1500", 2, 2, [window(1000, 499)], W)
    expect(ended.rows).toHaveLength(1499)
    expect(ended.next).toBeNull()
  })

  it("keeps each row once where the view changed again between reads", () => {
    const out = spliceWindows(run, "c1500", 0, 0, [{ rows: [...run.slice(1, 500), run[500]], next: "c500" }], W)
    expect(ids(out.rows).filter((id) => id === "r500")).toHaveLength(1)
  })
})
