import { describe, expect, it } from "vitest"
import { tablePath, tablesPath } from "@/lib/tables/route"

// Every link into tables comes from one rule (PROGRAM.md §5), and it builds
// exactly the addresses the ten link builders built by hand before it, so no
// link anyone kept changes.
describe("the one rule for links into tables", () => {
  const id = "6f1d2c3b-4a59-4e6f-8a7b-9c0d1e2f3a4b"
  const row = "0a1b2c3d-4e5f-4a6b-8c7d-8e9f0a1b2c3d"

  it("builds the addresses the link builders built", () => {
    expect(tablesPath()).toBe("/app/tables")
    expect(tablePath(id)).toBe(`/app/tables/${id}`)
    expect(tablePath(id, { row })).toBe(`/app/tables/${id}?row=${encodeURIComponent(row)}`)
    expect(tablePath(id, { made: "ai" })).toBe(`/app/tables/${id}?made=ai`)
  })

  it("names a view the page reads from its address", () => {
    expect(tablePath(id, { view: "board", row })).toBe(`/app/tables/${id}?view=board&row=${row}`)
  })

  it("encodes what it's given, so an id can't change the path", () => {
    expect(tablePath("a/../b", { row: "x&view=chart" })).toBe("/app/tables/a%2F..%2Fb?row=x%26view%3Dchart")
  })
})
