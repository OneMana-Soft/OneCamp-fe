import { describe, expect, it } from "vitest"
import { withSharedHistory } from "@/lib/conversation/sharedHistory"
import type { FlatItem } from "@/types/virtual"

interface Row { id: string; copy?: string }
const item = (r: Row): FlatItem<Row> => ({ type: "item", data: r, key: r.id })
const isCopy = (r: Row) => !!r.copy

describe("a shared history's heading", () => {
  it("sits once, above the first copy loaded", () => {
    const items: FlatItem<Row>[] = [
      { type: "separator", date: "6 Oct", key: "s1" },
      item({ id: "c1", copy: "o1" }),
      item({ id: "c2", copy: "o2" }),
      { type: "separator", date: "16 Oct", key: "s2" },
      item({ id: "line" }),
      item({ id: "m1" }),
    ]
    const out = withSharedHistory(items, isCopy)
    expect(out.map((i) => i.key)).toEqual(["s1", "shared-history", "c1", "c2", "s2", "line", "m1"])
    expect(out.filter((i) => i.type === "shared")).toHaveLength(1)
  })

  it("isn't there when nothing was shared, and the list is left as it was", () => {
    const items = [item({ id: "m1" }), item({ id: "m2" })]
    expect(withSharedHistory(items, isCopy)).toBe(items)
  })
})
