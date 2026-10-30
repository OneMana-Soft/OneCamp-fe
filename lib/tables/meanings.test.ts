// A view's rules mean the same on either side of the rows the browser sorts
// itself (tables T5c): testdata/rowquery/meanings.json, the same bytes in
// both repos, holds one table, cases of a view's rules, the spec each maps
// to, and the rows each shows in order as the server's evaluator answers
// (business/RowQuery meanings_test.go). rulesToSpec must write that spec,
// and applyViewRules show those rows, in the fixture's zone.

import { readFileSync } from "fs"
import path from "path"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import type { ViewRules } from "@/lib/tables/viewRules"
import { applyViewRules } from "@/lib/tables/applyRules"
import { rulesToSpec, type RowSpec } from "@/lib/tables/query"
import type { TableField, TableRow } from "@/services/tableService"

const fixture = JSON.parse(readFileSync(path.join(__dirname, "..", "..", "testdata", "rowquery", "meanings.json"), "utf8")) as {
  zone: string
  /** Who asks: @me. */
  me: string
  fields: TableField[]
  rows: TableRow[]
  cases: { name: string; rules: ViewRules; spec: RowSpec; ids: string[] }[]
}

const original = process.env.TZ
beforeAll(() => {
  process.env.TZ = fixture.zone
})
afterAll(() => {
  if (original === undefined) delete process.env.TZ
  else process.env.TZ = original
})

describe("a view's rules, as the server answers them", () => {
  it("holds cases", () => {
    expect(fixture.cases.length).toBeGreaterThan(40)
  })
  for (const c of fixture.cases) {
    it(c.name, () => {
      expect(rulesToSpec(c.rules, fixture.fields, { indexed: true, sorts_text: true })).toEqual(c.spec)
      expect(applyViewRules(fixture.rows, fixture.fields, c.rules, fixture.me).map((r) => r.id)).toEqual(c.ids)
    })
  }
})
