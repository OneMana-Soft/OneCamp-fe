import { beforeEach, describe, expect, it, vi } from "vitest"

const batchRows = vi.fn()
const undoChange = vi.fn()
vi.mock("@/lib/tables/ledger", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/tables/ledger")>()),
  batchRows: (...args: unknown[]) => batchRows(...args),
  undoChange: (...args: unknown[]) => undoChange(...args),
}))

import { deleteRows, duplicateRows, type Selection } from "@/components/table/RowSelectionBar"
import type { TableField, TableRow } from "@/services/tableService"

// The selected rows' Delete and Duplicate live in the selection bar's chunk,
// off the table's first load: what they send and what they leave.
const fields: TableField[] = [
  { id: "item", table_id: "t", name: "Item", type: "text", config: "{}", position: 0 },
  { id: "cost", table_id: "t", name: "Cost", type: "number", config: "{}", position: 1 },
  { id: "twice", table_id: "t", name: "Twice", type: "formula", config: JSON.stringify({ formula: "{Cost} * 2", result: "number" }), position: 2 },
]
const rows: TableRow[] = [0, 1, 2].map((i) => ({
  id: `r${i}`,
  table_id: "t",
  position: i,
  created_at: "",
  updated_at: "",
  values: JSON.stringify({ item: `Line ${i}`, cost: 100 + i, twice: 200 + 2 * i }),
}))

function selection(ids: string[]) {
  const s = {
    tableId: "t",
    fields,
    rows,
    ids: new Set(ids),
    clear: vi.fn(),
    confirm: vi.fn(),
    offerUndo: vi.fn(),
    onChange: vi.fn(),
    onCreated: vi.fn(),
  }
  return { s, sel: s as unknown as Selection }
}

/** What Delete asked the reader to confirm. */
function asked(confirm: ReturnType<typeof vi.fn>) {
  return confirm.mock.calls[0][0] as { title: string; destructive?: boolean; onConfirm: () => Promise<void> }
}

beforeEach(() => {
  batchRows.mockReset()
  undoChange.mockReset()
})

describe("the selection bar's actions", () => {
  it("deletes the rows selected once confirmed: one request, one Undo, then the view refreshes", async () => {
    batchRows.mockResolvedValue({ change_set: "cs1", created: [], updated: [], deleted: ["r2", "r0"] })
    const { s, sel } = selection(["r2", "r0"])
    deleteRows(sel)
    expect(batchRows).not.toHaveBeenCalled()
    const q = asked(s.confirm)
    expect(q.title).toBe("Delete 2 selected rows?")
    expect(q.destructive).toBe(true)
    await q.onConfirm()
    expect(batchRows).toHaveBeenCalledTimes(1)
    expect(batchRows).toHaveBeenCalledWith("t", { delete: ["r2", "r0"] })
    expect(s.clear).toHaveBeenCalled()
    expect(s.offerUndo).toHaveBeenCalledWith("2 rows deleted", expect.any(Function))
    s.offerUndo.mock.calls[0][1]()
    expect(undoChange).toHaveBeenCalledWith("t", "cs1")
    expect(s.onChange).toHaveBeenCalledTimes(1)
  })

  it("duplicates the rows selected in the order shown, without what's worked out, in one request", async () => {
    const made = [
      { ...rows[0], id: "n0" },
      { ...rows[2], id: "n2" },
    ]
    batchRows.mockResolvedValue({ change_set: "cs2", created: made, updated: [], deleted: [] })
    const { s, sel } = selection(["r2", "r0"])
    await duplicateRows(sel)
    expect(batchRows).toHaveBeenCalledTimes(1)
    expect(batchRows).toHaveBeenCalledWith("t", { create: [{ values: { item: "Line 0", cost: 100 } }, { values: { item: "Line 2", cost: 102 } }] })
    expect(s.clear).toHaveBeenCalled()
    expect(s.offerUndo).toHaveBeenCalledWith("2 rows duplicated", expect.any(Function))
    s.offerUndo.mock.calls[0][1]()
    expect(undoChange).toHaveBeenCalledWith("t", "cs2")
    expect(s.onCreated).toHaveBeenCalledWith(made)
    expect(s.onChange).not.toHaveBeenCalled()
  })

  it("names one row as a row", async () => {
    batchRows.mockResolvedValue({ change_set: "cs3", created: [], updated: [], deleted: ["r1"] })
    const { s, sel } = selection(["r1"])
    deleteRows(sel)
    expect(asked(s.confirm).title).toBe("Delete the selected row?")
    await asked(s.confirm).onConfirm()
    expect(s.offerUndo).toHaveBeenCalledWith("Row deleted", expect.any(Function))
    await duplicateRows(sel)
    expect(s.offerUndo).toHaveBeenLastCalledWith("Row duplicated", expect.any(Function))
    // Nothing came back to place: the view asks again.
    expect(s.onChange).toHaveBeenCalledTimes(2)
  })

  it("a failed request keeps the selection, offers no Undo and still refreshes the view", async () => {
    batchRows.mockRejectedValue(new Error("offline"))
    const { s, sel } = selection(["r1", "r2"])
    await duplicateRows(sel)
    deleteRows(sel)
    await asked(s.confirm).onConfirm()
    expect(batchRows).toHaveBeenCalledTimes(2)
    expect(s.clear).not.toHaveBeenCalled()
    expect(s.offerUndo).not.toHaveBeenCalled()
    expect(s.onCreated).not.toHaveBeenCalled()
    expect(s.onChange).toHaveBeenCalledTimes(2)
  })
})
