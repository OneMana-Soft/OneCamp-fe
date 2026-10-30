import { afterEach, describe, expect, it, vi, beforeAll } from "vitest"
import * as React from "react"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"

// The row ledger on the web (tables A2): a bulk delete, a duplicate, a
// column's delete and a record's delete are one request each, and each toast
// offers Undo, which reverses that change and nothing else.

const ledger = vi.hoisted(() => ({ batchRows: vi.fn(), undoChange: vi.fn(), restoreFromTrash: vi.fn() }))
vi.mock("@/lib/tables/ledger", async (orig) => ({ ...(await orig<typeof import("@/lib/tables/ledger")>()), ...ledger }))
const service = vi.hoisted(() => ({ deleteField: vi.fn(), createRow: vi.fn() }))
vi.mock("@/services/tableService", async (orig) => ({
  ...(await orig<typeof import("@/services/tableService")>()),
  createRow: (...a: unknown[]) => service.createRow(...a),
}))
vi.mock("@/services/tableCalls", async (orig) => ({
  ...(await orig<typeof import("@/services/tableCalls")>()),
  deleteField: (...a: unknown[]) => service.deleteField(...a),
}))
vi.mock("@/hooks/useConfirm", () => ({ useConfirm: () => (opts: { onConfirm: () => unknown }) => void opts.onConfirm() }))
const toasts = vi.hoisted(() => [] as Array<{ title?: string; description?: string; action?: React.ReactElement<{ onClick: () => Promise<void> }> }>)
vi.mock("@/hooks/use-toast", async (orig) => ({
  ...(await orig<typeof import("@/hooks/use-toast")>()),
  useToast: () => ({ toast: (t: (typeof toasts)[number]) => (toasts.push(t), { id: "1", update: vi.fn(), dismiss: vi.fn() }) }),
}))
vi.mock("@/hooks/useClientConfig", async (orig) => ({ ...(await orig<typeof import("@/hooks/useClientConfig")>()), useAIAvailable: () => false }))
// A record's comments and page are chunks of their own that read the network:
// stand-ins, so a toast of theirs never lands after the delete's own.
vi.mock("@/components/table/comments/RowComments", () => ({
  default: function RowCommentsStandIn() {
    return null
  },
}))
vi.mock("@/components/table/rowPage/RowPage", () => ({
  default: function RowPageStandIn() {
    return null
  },
}))

import { DataTableGrid, LiveCells, SelectionPart } from "@/components/table/DataTableGrid"
import { RecordPanel } from "@/components/table/RecordPanel"
import type { TableField, TableRow } from "@/services/tableService"
import { loadColumnMenus } from "@/components/table/ColumnMenu"
import { cellPickers } from "@/components/table/cellPickerPart"

// The column menus, the cell pickers are chunks of their own
// (lazyView): loaded once, before these tests, they draw at once. So is a
// column's change (columnOps, imported as it's asked for). Left to load on
// the click, it came after act's flush on a busy machine (V-58): the delete
// hadn't asked by the time it was checked, and its toast came in the next
// test, whose Undo then pressed it.
beforeAll(() => Promise.all([loadColumnMenus(), cellPickers.warm(), LiveCells.warm(), SelectionPart.warm(), import("@/components/table/columnOps")]))

const fields: TableField[] = [
  { id: "item", table_id: "t", name: "Item", type: "text", config: "{}", position: 0, primary: true },
  { id: "cost", table_id: "t", name: "Cost", type: "number", config: "{}", position: 1 },
]
const rowsOf = (n: number): TableRow[] =>
  Array.from({ length: n }, (_, i) => ({ id: `r${i}`, table_id: "t", position: i, created_at: "", updated_at: "", values: JSON.stringify({ item: `Line ${i}`, cost: i }) }))

/** The last toast's Undo, pressed: the toast of this test's own change, by its title. */
async function undoLast(title: string) {
  expect(toasts.at(-1)?.title, "the last toast is this change's").toBe(title)
  const action = toasts.at(-1)?.action
  expect(action, "the toast offers Undo").toBeTruthy()
  await act(async () => action!.props.onClick())
}

afterEach(() => {
  cleanup()
  toasts.length = 0
  for (const f of [...Object.values(ledger), ...Object.values(service)]) f.mockReset()
})

describe("a change made from the grid", () => {
  it("deletes the selected rows in one request, and its Undo undoes that change", async () => {
    ledger.batchRows.mockResolvedValue({ change_set: "cs-delete", created: [], updated: [], deleted: ["r0", "r2"] })
    ledger.undoChange.mockResolvedValue({ change_set: "u", reversed: "cs-delete", kind: "delete", changes: 2, skipped: 0 })
    const changed = vi.fn()
    render(<DataTableGrid tableId="t" fields={fields} rows={rowsOf(3)} canManage onChange={changed} />)
    fireEvent.click(screen.getByRole("checkbox", { name: "Select row 1" }))
    fireEvent.click(screen.getByRole("checkbox", { name: "Select row 3" }))
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Delete" })))
    expect(ledger.batchRows).toHaveBeenCalledTimes(1)
    expect(ledger.batchRows).toHaveBeenCalledWith("t", { delete: ["r0", "r2"] })
    expect(toasts.at(-1)?.title).toBe("2 rows deleted")
    changed.mockClear()
    await undoLast("2 rows deleted")
    expect(ledger.undoChange).toHaveBeenCalledWith("t", "cs-delete")
    expect(toasts.at(-1)?.title).toBe("Undone")
    expect(changed).toHaveBeenCalled()
  })

  it("duplicates the selected rows in one request, whose Undo takes the copies away", async () => {
    const copies = rowsOf(2).map((r) => ({ ...r, id: `copy-${r.id}` }))
    ledger.batchRows.mockResolvedValue({ change_set: "cs-dup", created: copies, updated: [], deleted: [] })
    ledger.undoChange.mockResolvedValue({ change_set: "u", reversed: "cs-dup", kind: "create", changes: 1, skipped: 1 })
    const created = vi.fn()
    render(<DataTableGrid tableId="t" fields={fields} rows={rowsOf(2)} canManage onChange={vi.fn()} onCreated={created} />)
    fireEvent.click(screen.getByRole("checkbox", { name: "Select row 1" }))
    fireEvent.click(screen.getByRole("checkbox", { name: "Select row 2" }))
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Duplicate" })))
    expect(service.createRow).not.toHaveBeenCalled()
    expect(ledger.batchRows).toHaveBeenCalledWith("t", { create: [{ values: { item: "Line 0", cost: 0 } }, { values: { item: "Line 1", cost: 1 } }] })
    expect(created).toHaveBeenCalledWith(copies)
    expect(toasts.at(-1)?.title).toBe("2 rows duplicated")
    await undoLast("2 rows duplicated")
    expect(ledger.undoChange).toHaveBeenCalledWith("t", "cs-dup")
    // A copy changed since stays, and the toast says so.
    expect(toasts.at(-1)).toEqual({ title: "Undone", description: "1 change was left as it is: it changed again since." })
  })

  it("deletes a column to the trash, and its Undo brings it back", async () => {
    service.deleteField.mockResolvedValue(undefined)
    ledger.restoreFromTrash.mockResolvedValue({})
    render(<DataTableGrid tableId="t" fields={fields} rows={rowsOf(1)} canManage onChange={vi.fn()} />)
    fireEvent.click(screen.getByRole("button", { name: /^Cost, Number column/ }))
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Delete field" })))
    // The change's own steps (a request, then its toast) are promises: waited for, not assumed done by act.
    await vi.waitFor(() => expect(toasts.at(-1)?.title).toBe("Column deleted"))
    expect(service.deleteField).toHaveBeenCalledWith("t", "cost")
    await undoLast("Column deleted")
    expect(ledger.restoreFromTrash).toHaveBeenCalledWith("t", { fields: ["cost"] })
  })

  it("says why an undo couldn't, and reads the table again either way", async () => {
    ledger.batchRows.mockResolvedValue({ change_set: "cs", created: [], updated: [], deleted: ["r0"] })
    ledger.undoChange.mockRejectedValue({ isAxiosError: true, response: { status: 409, data: { msg: "That change was undone already" } } })
    const changed = vi.fn()
    render(<DataTableGrid tableId="t" fields={fields} rows={rowsOf(1)} canManage onChange={changed} />)
    fireEvent.click(screen.getByRole("checkbox", { name: "Select row 1" }))
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Delete" })))
    changed.mockClear()
    await undoLast("Row deleted")
    expect(toasts.at(-1)).toEqual(expect.objectContaining({ title: "Couldn't undo that", description: "That change was undone already" }))
    expect(changed).toHaveBeenCalled()
  })
})

describe("a record's delete", () => {
  it("is one change, whose Undo undoes it", async () => {
    ledger.batchRows.mockResolvedValue({ change_set: "cs-row", created: [], updated: [], deleted: ["r0"] })
    ledger.undoChange.mockResolvedValue({ change_set: "u", reversed: "cs-row", kind: "delete", changes: 1, skipped: 0 })
    const close = vi.fn()
    render(<RecordPanel tableId="t" tableName="Budget" fields={fields} rows={rowsOf(1)} rowId="r0" canManage commit={{ commitCell: vi.fn(), linkCell: vi.fn(), edits: new Map() }} onStep={vi.fn()} onClose={close} onChange={vi.fn()} />)
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Delete this row" })))
    expect(ledger.batchRows).toHaveBeenCalledWith("t", { delete: ["r0"] })
    expect(close).toHaveBeenCalled()
    await undoLast("Row deleted")
    expect(ledger.undoChange).toHaveBeenCalledWith("t", "cs-row")
  })
})
