import { beforeEach, describe, expect, it, vi } from "vitest"

const api = vi.hoisted(() => ({ createField: vi.fn(), updateField: vi.fn(), deleteField: vi.fn(), restoreFromTrash: vi.fn() }))
vi.mock("@/services/tableCalls", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/tableCalls")>()),
  createField: (...args: unknown[]) => api.createField(...args),
  updateField: (...args: unknown[]) => api.updateField(...args),
  deleteField: (...args: unknown[]) => api.deleteField(...args),
}))
vi.mock("@/lib/tables/ledger", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/tables/ledger")>()),
  restoreFromTrash: (...args: unknown[]) => api.restoreFromTrash(...args),
}))

import { createColumn, deleteColumn, duplicateColumn, saveColumn, type Columns } from "@/components/table/columnOps"
import type { TableField } from "@/services/tableService"

// A column's add, save, duplicate and delete live in their own chunk, off the
// table's first load: what each sends, and what it tells the grid.
const fields: TableField[] = [
  { id: "item", table_id: "t", name: "Item", type: "text", config: "{}", position: 0 },
  { id: "cost", table_id: "t", name: "Cost", type: "number", config: "{}", position: 3 },
  { id: "twice", table_id: "t", name: "Twice", type: "formula", config: JSON.stringify({ formula: "{Cost} * 2", result: "number", error: "x" }), position: 1 },
]
function columns() {
  const c = { tableId: "t", fields, onChange: vi.fn(), confirm: vi.fn(), offerUndo: vi.fn(), openMenu: vi.fn() }
  return { c, cols: c as unknown as Columns }
}
/** What Delete asked the reader to confirm. */
const asked = (confirm: ReturnType<typeof vi.fn>) => confirm.mock.calls[0][0] as { title: string; destructive?: boolean; onConfirm: () => Promise<void> }

beforeEach(() => Object.values(api).forEach((f) => f.mockReset()))

describe("a column's changes", () => {
  it("adds a column after the last, and opens a plain one's menu on its name", async () => {
    api.createField.mockResolvedValue({ id: "new" })
    const { c, cols } = columns()
    await createColumn(cols, { name: "Due", type: "date", config: {} } as never)
    expect(api.createField).toHaveBeenCalledWith("t", { name: "Due", type: "date", position: 4, config: {} })
    expect(c.onChange).toHaveBeenCalledTimes(1)
    expect(c.openMenu).toHaveBeenCalledWith("new")
    // A formula, a link or a rollup has had its say in the dialog that made it.
    for (const type of ["formula", "relation", "rollup"]) await createColumn(cols, { name: "X", type, config: {} } as never)
    expect(c.openMenu).toHaveBeenCalledTimes(1)
  })

  // CR-67's SF2: a column the server refused said nothing to its form, which
  // closed and lost a typed formula. It resolves false now, and the form stays.
  it("says whether the column was made, so a refused one's form stays open", async () => {
    const { c, cols } = columns()
    api.createField.mockResolvedValue({ id: "new" })
    await expect(createColumn(cols, { name: "With tax", type: "formula", config: { formula: "{Cost} * 1.18" } } as never)).resolves.toBe(true)
    api.createField.mockRejectedValue(new Error("refused"))
    await expect(createColumn(cols, { name: "With tax", type: "formula", config: { formula: "{Cost} * 1.18" } } as never)).resolves.toBe(false)
    expect(c.onChange).toHaveBeenCalledTimes(1)
  })

  it("saves what the menu changed, says whether it saved, and refreshes either way", async () => {
    const { c, cols } = columns()
    api.updateField.mockResolvedValue(undefined)
    await expect(saveColumn(cols, fields[1], { name: "Price" } as never)).resolves.toBe(true)
    expect(api.updateField).toHaveBeenCalledWith("t", "cost", { name: "Price" })
    api.updateField.mockRejectedValue(new Error("offline"))
    await expect(saveColumn(cols, fields[1], { name: "Price" } as never)).resolves.toBe(false)
    expect(c.onChange).toHaveBeenCalledTimes(2)
  })

  it("copies a column after the last, without what a formula worked out", async () => {
    api.createField.mockResolvedValue({ id: "copy" })
    const { c, cols } = columns()
    await duplicateColumn(cols, fields[2])
    expect(api.createField).toHaveBeenCalledWith("t", { name: "Twice copy", type: "formula", position: 4, config: { formula: "{Cost} * 2" } })
    expect(c.onChange).toHaveBeenCalledTimes(1)
  })

  it("deletes a column once confirmed, and one Undo brings it back from the trash", async () => {
    api.deleteField.mockResolvedValue(undefined)
    const { c, cols } = columns()
    deleteColumn(cols, fields[1])
    expect(api.deleteField).not.toHaveBeenCalled()
    const q = asked(c.confirm)
    expect(q.title).toBe('Delete the column "Cost"?')
    expect(q.destructive).toBe(true)
    await q.onConfirm()
    expect(api.deleteField).toHaveBeenCalledWith("t", "cost")
    expect(c.onChange).toHaveBeenCalledTimes(1)
    expect(c.offerUndo).toHaveBeenCalledWith("Column deleted", expect.any(Function))
    c.offerUndo.mock.calls[0][1]()
    expect(api.restoreFromTrash).toHaveBeenCalledWith("t", { fields: ["cost"] })
  })
})
