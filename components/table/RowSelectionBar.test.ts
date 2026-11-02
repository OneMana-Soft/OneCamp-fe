import { beforeEach, describe, expect, it, vi } from "vitest"

const batchRows = vi.fn()
const undoChange = vi.fn()
vi.mock("@/lib/tables/ledger", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/tables/ledger")>()),
  batchRows: (...args: unknown[]) => batchRows(...args),
  undoChange: (...args: unknown[]) => undoChange(...args),
}))

import { deleteRows, duplicateRows, type Selection } from "@/components/table/RowSelectionBar"
import { UndoOrder, type Aim, type SetOf } from "@/lib/tables/undoOrder"
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

function selection(ids: string[], pressed = false) {
  const made: { what: string; aim?: Aim }[] = []
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
    // The table's undo order (the grid's write), as a stand-in: what entered it, and (pressed) what a Ctrl+Z pressed
    // while it was on its way takes (the order's own reading of its answer). The write hears of that take (V-381).
    write: async (what: string, send: () => Promise<unknown>, setOf?: SetOf<unknown>, onTaken?: () => void) => {
      const order = new UndoOrder()
      const going = order.write(what, send, setOf, onTaken)
      made.push(pressed ? { what, aim: await order.press(async (aim) => aim) } : { what })
      return going
    },
    // The toasts' one Undo path (the grid's undo).
    undo: vi.fn(async () => undefined),
  }
  return { s, sel: s as unknown as Selection, made }
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
    expect(s.undo, "the toast's Undo goes the table's one Undo path, by the delete's change set").toHaveBeenCalledWith("cs1")
    expect(undoChange, "never straight to the ledger").not.toHaveBeenCalled()
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
    expect(s.undo, "the toast's Undo goes the table's one Undo path, by the duplicate's change set").toHaveBeenCalledWith("cs2")
    expect(undoChange, "never straight to the ledger").not.toHaveBeenCalled()
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

// Main's 3b (V-360): each is the reader's to undo, so it enters the table's
// undo order when made, named by its batch's change set: an Undo pressed
// while it's on its way takes it, never the change before it.
describe("the selection bar's writes, in the table's undo order", () => {
  it("deletes and duplicates through it, each named by its batch's change set", async () => {
    batchRows.mockResolvedValue({ change_set: "c7", created: [], updated: [], deleted: ["r0"] })
    const del = selection(["r0"], true)
    deleteRows(del.sel)
    await asked(del.s.confirm).onConfirm()
    expect(del.made).toEqual([{ what: "delete", aim: { kind: "set", set: "c7" } }])
    batchRows.mockResolvedValue({ change_set: "c8", created: [], updated: [], deleted: [] })
    const dup = selection(["r0"], true)
    await duplicateRows(dup.sel)
    expect(dup.made).toEqual([{ what: "duplicate", aim: { kind: "set", set: "c8" } }])
  })

  // V-360 MUST 1 (a): a batch that stored nothing answers change_set null. Its toast's Undo would have no set, and an
  // Undo with none takes the reader's latest change instead: so it offers none.
  it("offers no Undo for a delete or a duplicate the server stored nothing for (no change set)", async () => {
    batchRows.mockResolvedValue({ change_set: null, created: [], updated: [], deleted: [] })
    const { s, sel } = selection(["r0"], true)
    deleteRows(sel)
    await asked(s.confirm).onConfirm()
    await duplicateRows(sel)
    expect(s.offerUndo).not.toHaveBeenCalled()
    expect(s.undo).not.toHaveBeenCalled()
    expect(undoChange).not.toHaveBeenCalled()
  })

  // V-381: one a Ctrl+Z took while it was on its way is undone already, so no toast offers it again (a second Undo of
  // it would answer 409 "That change was undone already").
  it("offers no Undo for a delete or a duplicate a Ctrl+Z took while it was on its way", async () => {
    batchRows.mockResolvedValue({ change_set: "c9", created: [rows[0]], updated: [], deleted: ["r0"] })
    const del = selection(["r0"], true)
    deleteRows(del.sel)
    await asked(del.s.confirm).onConfirm()
    const dup = selection(["r0"], true)
    await duplicateRows(dup.sel)
    expect([...del.made, ...dup.made]).toEqual([
      { what: "delete", aim: { kind: "set", set: "c9" } },
      { what: "duplicate", aim: { kind: "set", set: "c9" } },
    ])
    expect(del.s.offerUndo, "no toast for a delete the Ctrl+Z took back").not.toHaveBeenCalled()
    expect(dup.s.offerUndo, "no toast for a duplicate the Ctrl+Z took back").not.toHaveBeenCalled()
    expect(undoChange).not.toHaveBeenCalled()
  })
})
