import { describe, expect, it, vi } from "vitest"

// V-529 (4): ONE reader of the change set a row write's answer names. A write's Undo toast (ledger's undoableWrite) and
// the table's undo order read it by the same function, so what an answer names (V-360) is read one way everywhere.
vi.mock("@/lib/tables/changeSetOf", async (real) => {
  const m = await real<typeof import("@/lib/tables/changeSetOf")>()
  return { ...m, changeSetOf: vi.fn(m.changeSetOf) }
})
vi.mock("@/lib/axiosInstance", async () => (await import("@/lib/testing/axiosInstance")).axiosInstanceModule({ default: { post: vi.fn() } }))

import { changeSetOf } from "@/lib/tables/changeSetOf"
import { undoableWrite } from "@/lib/tables/ledger"
import { UndoOrder } from "@/lib/tables/undoOrder"

describe("the change set a row write's answer names", () => {
  it("is its change_set: an id, null when it changed nothing, and none from a server before V-360", () => {
    expect(changeSetOf({ id: "r1", change_set: "c1" })).toBe("c1")
    expect(changeSetOf({ id: "r1", change_set: null })).toBeNull()
    expect(changeSetOf({ id: "r1" })).toBeUndefined()
    expect(changeSetOf(undefined)).toBeUndefined()
  })

  it("is what a write's Undo toast reads by default", async () => {
    let read: unknown
    const offered = await undoableWrite(
      async (_what, send, setOf) => {
        read = setOf
        return send()
      },
      "delete",
      async () => ({ change_set: "c1" }),
    )
    expect(read).toBe(changeSetOf)
    expect(offered.set).toBe("c1")
  })

  it("is what the table's undo order reads by default", async () => {
    vi.mocked(changeSetOf).mockClear()
    const order = new UndoOrder()
    void order.write("row", async () => ({ id: "r2", change_set: "c2" }))
    await expect(order.press(async (aim) => aim)).resolves.toEqual({ kind: "set", set: "c2" })
    expect(changeSetOf).toHaveBeenCalledWith({ id: "r2", change_set: "c2" })
  })
})
