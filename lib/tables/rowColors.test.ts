import { describe, expect, it, vi } from "vitest"
import { pinTestClock } from "@/lib/testing/testClock"
import { applyViewRules, cellTints, readColors, rowHues } from "@/lib/tables/applyRules"
import { drawnAs, sameViewState, type ViewState } from "@/lib/tables/savedViews"
import { DEFAULT_DISPLAY } from "@/lib/tables/display"
import { NO_RULES } from "@/lib/tables/viewRules"
import type { TableField, TableRow } from "@/services/tableService"

// Tables V3: a view colours its rows by a choice field's option hues, or by
// rules, the first a row passes; its filters mean what the view's filters do.

pinTestClock()

const field = (id: string, type: TableField["type"], config: object = {}): TableField => ({ id, table_id: "t", name: id, type, config: JSON.stringify(config), position: 0 })
const fields = [
  field("item", "text"),
  field("stage", "select", { options: [{ label: "Won", color: "moss" }, { label: "Lost", color: "berry" }, { label: "Open" }] }),
  field("cost", "number"),
  field("owner", "people"),
]
const row = (id: string, values: Record<string, unknown>): TableRow => ({ id, table_id: "t", position: 0, created_at: "", updated_at: "", values: JSON.stringify(values) })
const rows = [row("a", { stage: "Won", cost: 900 }), row("b", { stage: "Lost", cost: 50 }), row("c", { stage: "Open", cost: 5000, owner: [{ id: "ME-1" }] }), row("d", {})]
const hues = (kept: unknown, me: string | null = null) => Object.fromEntries(rowHues(rows, fields, kept, me))

describe("a view's row colours", () => {
  it("by a choice field: each row its option's hue, none for a row without one", () => {
    expect(hues({ field: "stage" })).toEqual({ a: "moss", b: "berry" })
  })

  it("by a status: the hue its chip shows, its own or its group's (none to do)", () => {
    const state = field("state", "status", { options: [{ label: "Doing", group: "doing" }, { label: "Shipped", group: "done", color: "berry" }, { label: "Done", group: "done" }, { label: "New" }] })
    const by = rowHues([row("a", { state: "Doing" }), row("b", { state: "Shipped" }), row("c", { state: "Done" }), row("d", { state: "New" })], [...fields, state], { field: "state" }, null)
    expect(Object.fromEntries(by)).toEqual({ a: "sun", b: "berry", c: "moss" })
  })

  it("by rules: the first rule a row passes, as the view's filters read it", () => {
    const kept = {
      rules: [
        { hue: "sun", match: "all", filters: [{ field: "cost", op: "gt", value: "1000" }] },
        { hue: "sky", match: "any", filters: [{ field: "stage", op: "contains", value: "won" }, { match: "all", filters: [{ field: "cost", op: "lt", value: "100" }] }] },
        { hue: "dusk", match: "all", filters: [{ field: "owner", op: "contains", value: "@me" }] },
      ],
    }
    expect(hues(kept, "me-1")).toEqual({ a: "sky", b: "sky", c: "sun" })
    expect(hues({ rules: [kept.rules[2]] }, "me-1")).toEqual({ c: "dusk" })
  })

  it("reads a row once while the colours, the fields and the reader stay: a page more reads only its own rows", () => {
    let reads = 0
    const counted = (id: string, values: Record<string, unknown>): TableRow => {
      const r = row(id, values)
      const text = r.values
      Object.defineProperty(r, "values", { get: () => (reads++, text) })
      return r
    }
    const kept = { field: "stage" }
    const held = [counted("a", { stage: "Won" }), counted("b", { stage: "Lost" })]
    rowHues(held, fields, kept, null)
    expect(reads).toBe(2)
    const more = [...held, counted("c", { stage: "Won" })]
    expect(Object.fromEntries(rowHues(more, fields, kept, null))).toEqual({ a: "moss", b: "berry", c: "moss" })
    expect(reads).toBe(3)
    // Other colours read every row again.
    expect(Object.fromEntries(rowHues(more, fields, { rules: [{ hue: "sun", match: "all", filters: [{ field: "stage", op: "is", value: "Lost" }] }] }, null))).toEqual({ b: "sun" })
    expect(reads).toBe(6)
  })

  // CR-63 (V3 SF3): hues followed the server's copy, so an edit's new colour
  // showed only once its save landed.
  it("reads a row with edits its copy doesn't show yet as its cells show it, and keeps no hue of it", () => {
    const kept = { field: "stage" }
    const held = [row("a", { stage: "Won" }), row("b", { stage: "Lost" })]
    expect(Object.fromEntries(rowHues(held, fields, kept, null))).toEqual({ a: "moss", b: "berry" })
    const edits = new Map([["a", { saving: { stage: "Lost" }, saved: {}, copy: null }]])
    expect(Object.fromEntries(rowHues(held, fields, kept, null, edits))).toEqual({ a: "berry", b: "berry" })
    // The edit gone (the row read again, as it was), its copy's hue again.
    expect(Object.fromEntries(rowHues(held, fields, kept, null))).toEqual({ a: "moss", b: "berry" })
  })

  // CR-63's midnight note: a rule on "today" kept a row's hue past midnight.
  it("reads its rows again on a new day, as a rule on today means another day", () => {
    vi.setSystemTime(new Date(2026, 9, 27, 23, 59))
    let reads = 0
    const r = row("a", { stage: "Won" })
    const text = r.values
    Object.defineProperty(r, "values", { get: () => (reads++, text) })
    const kept = { field: "stage" }
    rowHues([r], fields, kept, null)
    rowHues([r], fields, kept, null)
    expect(reads).toBe(1)
    vi.setSystemTime(new Date(2026, 9, 28, 0, 1))
    rowHues([r], fields, kept, null)
    expect(reads).toBe(2)
  })

  it("colours nothing by a rule none of whose filters is filled in yet", () => {
    expect(hues({ rules: [{ hue: "sun", match: "all", filters: [{ field: "item", op: "contains", value: " " }] }] })).toEqual({})
    expect(hues({ rules: [{ hue: "sun", match: "all", filters: [{ field: "cost", op: "empty" }] }] })).toEqual({ d: "sun" })
  })

  it("keeps colours made good: a field gone or not a choice, a hue not the camp's, a filter that no longer fits, ten rules at most", () => {
    expect(readColors({ field: "item" }, fields)).toBeNull()
    expect(readColors({ field: "gone" }, fields)).toBeNull()
    expect(readColors({ rules: [{ hue: "red", match: "all", filters: [] }] }, fields)).toBeNull()
    expect(readColors({ rules: [{ hue: "sky", match: "all", filters: [{ field: "gone", op: "is", value: "x" }] }] }, fields)).toEqual({ rules: [{ hue: "sky", match: "all", filters: [] }] })
    const many = Array.from({ length: 12 }, () => ({ hue: "lake", match: "all", filters: [] }))
    expect((readColors({ rules: many }, fields) as { rules: unknown[] }).rules).toHaveLength(10)
    expect(readColors("stage", fields)).toBeNull()
  })

  it("are a view's own: kept with it, and a change marks it changed", () => {
    const state = (colors: ViewState["display"]["colors"]): ViewState => ({ layout: "grid", rules: NO_RULES, display: drawnAs({ ...DEFAULT_DISPLAY, colors }) })
    expect(state({ field: "stage" }).display.colors).toEqual({ field: "stage" })
    expect(sameViewState(state({ field: "stage" }), state(null))).toBe(false)
  })
})

// gsheets-formatting-01: a rule colours a cell, a scale shades a number's
// cells, and a rule compares a field with another of its row ("Amount >
// Budget"), which Sheets needs a custom formula for.
describe("a view's cell colours", () => {
  const all = [...fields, field("budget", "number"), field("due", "date"), field("done", "date")]
  const deals = [
    row("a", { cost: 900, budget: 1000, due: "2026-10-20", done: "2026-10-25" }),
    row("b", { cost: 50, budget: 40, due: "2026-10-20", done: "2026-10-18" }),
    row("c", { cost: 5000, budget: 5000 }),
    row("d", { budget: 100 }),
  ]
  const spread = [0, 30, 60, 100].map((n, i) => row(`r${i}`, { cost: n }))
  const tints = (kept: unknown, rs = deals, served?: Parameters<typeof cellTints>[5]) => Object.fromEntries(cellTints(rs, all, kept, null, undefined, served))
  const scale = { rules: [], scales: [{ field: "cost", hue: "moss" }] }

  it("colours a rule's cell, not its row: for each field, the first of its rules a row passes", () => {
    const kept = {
      rules: [
        { hue: "berry", match: "all", filters: [{ field: "cost", op: "gt", value: "1000" }], cell: "cost" },
        { hue: "sun", match: "all", filters: [{ field: "cost", op: "gt", value: "10" }], cell: "cost" },
        { hue: "sky", match: "all", filters: [{ field: "cost", op: "lt", value: "100" }] },
      ],
    }
    expect(tints(kept)).toEqual({ a: { cost: "sun" }, b: { cost: "sun" }, c: { cost: "berry" } })
    // The row's own rule colours the row alone.
    expect(Object.fromEntries(rowHues(deals, all, kept, null))).toEqual({ b: "sky" })
  })

  it("compares a number with another field of its row, and a date with another by its day; a blank on either side never matches", () => {
    const over = { rules: [{ hue: "berry", match: "all", filters: [{ field: "cost", op: "gt", of: "budget" }], cell: "cost" }] }
    expect(tints(over)).toEqual({ b: { cost: "berry" } })
    const within = { rules: [{ hue: "moss", match: "all", filters: [{ field: "cost", op: "lte", of: "budget" }], cell: "cost" }] }
    expect(tints(within)).toEqual({ a: { cost: "moss" }, c: { cost: "moss" } })
    const late = { rules: [{ hue: "sun", match: "all", filters: [{ field: "done", op: "after", of: "due" }] }] }
    expect(Object.fromEntries(rowHues(deals, all, late, null))).toEqual({ a: "sun" })
  })

  // The row's to_win: "a vendor turns red when its invoices pass the budget" (a rollup of its lines' totals).
  it("reads a rollup as the number it adds up: a vendor's spend past its budget colours the spend", () => {
    const vendors = [field("vendor", "text"), field("spend", "rollup", { relation: "lines", field: "total", aggregate: "sum", result: "number" }), field("budget", "number")]
    const rs = [row("north", { vendor: "Northwind", spend: 5200, budget: 5000 }), row("expo", { vendor: "Expo", spend: 1800, budget: 4000 }), row("merch", { vendor: "Merch Co", spend: 900 })]
    const kept = { rules: [{ hue: "berry", match: "all", filters: [{ field: "spend", op: "gt", of: "budget" }], cell: "spend" }] }
    expect(readColors(kept, vendors)).toEqual(kept)
    expect(Object.fromEntries(cellTints(rs, vendors, kept, null))).toEqual({ north: { spend: "berry" } })
  })

  it("keeps a comparison only where it fits: the other field there and read alike, and a condition that compares", () => {
    const kept = (f: object) => (readColors({ rules: [{ hue: "sky", match: "all", filters: [f] }] }, all) as { rules: { filters: unknown[] }[] }).rules[0].filters[0]
    expect(kept({ field: "cost", op: "gt", of: "budget" })).toEqual({ field: "cost", op: "gt", of: "budget" })
    expect(kept({ field: "cost", op: "gt", of: "gone" })).toEqual({ field: "cost", op: "gt" })
    expect(kept({ field: "cost", op: "gt", of: "due" })).toEqual({ field: "cost", op: "gt" })
    expect(kept({ field: "cost", op: "gt", of: "cost" })).toEqual({ field: "cost", op: "gt" })
    expect(kept({ field: "cost", op: "empty", of: "budget" })).toEqual({ field: "cost", op: "empty" })
    // A view's own filters never compare two fields: the server reads them too, by value.
    const filters = [{ field: "cost", op: "gt", of: "budget" } as never]
    expect(applyViewRules(deals, all, { ...NO_RULES, filters }).map((r) => r.id)).toEqual(["a", "b", "c", "d"])
  })

  it("shades a scale's cells in four steps from the lowest to the highest of the rows held", () => {
    expect(tints(scale, spread)).toEqual({ r0: { cost: "moss-1" }, r1: { cost: "moss-2" }, r2: { cost: "moss-3" }, r3: { cost: "moss-4" } })
    // A row without a number has no step; one value alone is the lightest.
    expect(tints(scale)).toEqual({ a: { cost: "moss-1" }, b: { cost: "moss-1" }, c: { cost: "moss-4" } })
    expect(tints(scale, [row("x", { cost: 7 })])).toEqual({ x: { cost: "moss-1" } })
  })

  it("shades a view read in windows by the server's lowest and highest of the whole view, not the rows held", () => {
    expect(tints(scale, spread, { "field:cost": { min: 0, max: 400 } })).toEqual({ r0: { cost: "moss-1" }, r1: { cost: "moss-1" }, r2: { cost: "moss-1" }, r3: { cost: "moss-2" } })
    // Not yet worked out: the rows held.
    expect(tints(scale, spread, { "field:cost": { min: null, max: null } })).toEqual(tints(scale, spread))
  })

  it("lets a cell's rule win over its scale", () => {
    const both = { rules: [{ hue: "berry", match: "all", filters: [{ field: "cost", op: "gte", value: "100" }], cell: "cost" }], scales: scale.scales }
    expect(tints(both, spread)).toEqual({ r0: { cost: "moss-1" }, r1: { cost: "moss-2" }, r2: { cost: "moss-3" }, r3: { cost: "berry" } })
  })

  it("reads a row once while the colours stay, reads an edit as its cells show it, and hands a row with the same tints the same record", () => {
    let reads = 0
    const counted = spread.map((r) => {
      const text = r.values
      return Object.defineProperty({ ...r }, "values", { get: () => (reads++, text) }) as TableRow
    })
    const first = cellTints(counted, all, scale, null)
    const again = cellTints([...counted], all, scale, null)
    expect(reads).toBe(4)
    expect(again.get("r1")).toBe(first.get("r1"))
    // An edit not saved yet makes r0 the highest: every step moves.
    const edits = new Map([["r0", { saving: { cost: 500 }, saved: {}, copy: null }]])
    expect(Object.fromEntries(cellTints(counted, all, scale, null, edits))).toEqual({ r0: { cost: "moss-4" }, r1: { cost: "moss-1" }, r2: { cost: "moss-1" }, r3: { cost: "moss-1" } })
  })

  it("keeps scales made good: a number field's, a camp hue, one a field, five at most; beside a choice field's colours or alone", () => {
    const nums = Array.from({ length: 7 }, (_, i) => field(`n${i}`, "number"))
    const scales = [...nums.map((f) => ({ field: f.id, hue: "lake" })), { field: "item", hue: "sky" }, { field: "n0", hue: "sun" }, { field: "budget", hue: "red" }]
    expect(readColors({ rules: [], scales }, [...all, ...nums])?.scales?.map((s) => s.field)).toEqual(["n0", "n1", "n2", "n3", "n4"])
    expect(readColors({ field: "stage", scales: [{ field: "cost", hue: "sky" }] }, all)).toEqual({ field: "stage", scales: [{ field: "cost", hue: "sky" }] })
    expect(readColors({ field: "gone", scales: [{ field: "cost", hue: "sky" }] }, all)).toEqual({ rules: [], scales: [{ field: "cost", hue: "sky" }] })
    expect(readColors({ rules: [], scales: [] }, all)).toBeNull()
    // A rule for a cell whose field is gone colours nothing.
    expect(readColors({ rules: [{ hue: "sky", match: "all", filters: [], cell: "gone" }] }, all)).toBeNull()
  })
})
