import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { compareKeys, DIGITS_PAD, KEY_RUNES, naturalKey } from "./sortKey"
import { applyViewRules } from "./applyRules"
import type { TableField, TableRow } from "@/services/tableService"

// The natural sort key, held to the fixture the server's (business/RowQuery
// naturalKey) is held to, copied byte for byte into testdata/sortkey.
const fixture = JSON.parse(readFileSync(path.join(__dirname, "..", "..", "testdata", "sortkey", "natural.json"), "utf8")) as {
  pad: number
  runes: number
  keys: { in: string; key: string }[]
  order: string[]
}

describe("the natural sort key", () => {
  it("is the fixture's for each text", () => {
    expect(DIGITS_PAD).toBe(fixture.pad)
    expect(KEY_RUNES).toBe(fixture.runes)
    for (const c of fixture.keys) expect(naturalKey(c.in), JSON.stringify(c.in)).toBe(c.key)
  })

  it("puts the fixture's texts in its order, by code point", () => {
    const sorted = fixture.keys
      .map((c, i) => ({ c, i, k: naturalKey(c.in) }))
      .sort((a, b) => compareKeys(a.k, b.k) || a.i - b.i)
      .map((x) => x.c.in)
    expect(sorted).toEqual(fixture.order)
  })

  it("compares by code point, past the BMP's last characters", () => {
    expect(compareKeys("\u{1f34e}", "Ａ")).toBeGreaterThan(0)
    expect(compareKeys("a", "ab")).toBeLessThan(0)
    expect(compareKeys("row 2", "row 2")).toBe(0)
  })

  // The grid's own sort, for a table it holds whole: the same order the
  // server gives a table it doesn't.
  it("orders a text column the grid sorts itself", () => {
    const field: TableField = { id: "f", table_id: "t", name: "Item", type: "text", config: "{}", position: 0 }
    const rows: TableRow[] = fixture.keys
      .filter((c) => c.in.trim() !== "")
      .map((c, i) => ({ id: `r${i}`, table_id: "t", position: i, created_at: "", updated_at: "", values: JSON.stringify({ f: c.in }) }))
    const sorted = applyViewRules(rows, [field], { sort: [{ field: "f", dir: "asc" }], filters: [], match: "all" }).map((r) => JSON.parse(r.values).f)
    expect(sorted).toEqual(fixture.order.filter((t) => t.trim() !== ""))
  })
})
