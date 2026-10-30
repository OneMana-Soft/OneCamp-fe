import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"

// CR-66's MF1 (diet 2): a column's add, save, duplicate and delete are a chunk
// of their own, which can fail to load (a deploy since the page loaded, or a
// dropped connection). A vi.mock factory that throws makes its import reject.
vi.mock("@/components/table/columnOps", () => {
  throw new Error("Loading chunk 4321 failed")
})
const toast = vi.hoisted(() => vi.fn())
vi.mock("@/hooks/use-toast", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/hooks/use-toast")>()), toast }))
vi.mock("@/hooks/useConfirm", () => ({ useConfirm: () => vi.fn() }))
// A chunk that can't load reloads the page once for a new build when the
// server says the old one is gone (lib/chunkRecovery's one probe); with no
// network, or once its guard has reloaded, it doesn't, as in every leg but
// the deploy's.
const chunk = vi.hoisted(() => ({ reload: vi.fn(async () => false) }))
vi.mock("@/lib/newBuild", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/newBuild")>()),
  reloadForNewBuild: () => chunk.reload(),
}))
// A type change counts what it would clear first: nothing, here.
const preview = vi.hoisted(() => vi.fn())
vi.mock("@/services/tableCalls", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/tableCalls")>()),
  previewConversion: (...a: unknown[]) => preview(...a),
}))

import { DataTableGrid } from "@/components/table/DataTableGrid"
import { loadColumnMenus } from "@/components/table/ColumnMenu"
import type { TableField, TableRow } from "@/services/tableService"

beforeAll(() => loadColumnMenus())
afterEach(() => {
  cleanup()
  toast.mockReset()
  chunk.reload.mockClear()
})

const fields: TableField[] = [
  { id: "item", table_id: "t", name: "Item", type: "text", config: "{}", position: 0 },
  { id: "cost", table_id: "t", name: "Cost", type: "number", config: "{}", position: 1 },
]
const rows: TableRow[] = [{ id: "r0", table_id: "t", position: 0, created_at: "", updated_at: "", values: JSON.stringify({ item: "a", cost: 1 }) }]
const told = { tone: "error", title: "Couldn't change the column: try again" }

describe("a column's change, when its chunk can't load", () => {
  it("says so in words when a rename can't be sent", async () => {
    render(<DataTableGrid tableId="t" fields={fields} rows={rows} canManage onChange={() => {}} />)
    fireEvent.click(screen.getByRole("button", { name: /^Cost, Number column/ }))
    const name = screen.getByRole("textbox", { name: "Column name" })
    fireEvent.change(name, { target: { value: "Price" } })
    await act(async () => fireEvent.blur(name))
    await vi.waitFor(() => expect(toast).toHaveBeenCalledWith(told))
  })

  it("says so, and keeps a new column's form open with what was typed in it", async () => {
    render(<DataTableGrid tableId="t" fields={fields} rows={rows} canManage onChange={() => {}} />)
    fireEvent.click(screen.getByRole("button", { name: "Add a column" }))
    fireEvent.click(screen.getByRole("option", { name: /Formula/ }))
    fireEvent.change(screen.getByPlaceholderText("Column name"), { target: { value: "With tax" } })
    fireEvent.change(screen.getByRole("textbox", { name: "Formula" }), { target: { value: "{Cost} * 1.18" } })
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Add column" })))
    await vi.waitFor(() => expect(toast).toHaveBeenCalledWith(told))
    expect((screen.getByPlaceholderText("Column name") as HTMLInputElement).value).toBe("With tax")
    expect((screen.getByRole("textbox", { name: "Formula" }) as HTMLInputElement).value).toBe("{Cost} * 1.18")
  })

  // CR-67's SF3: a type with options says "Changing the type…" until the
  // table has the column as one, which never comes when the change wasn't sent.
  it("says so, and a type change stops changing", async () => {
    preview.mockResolvedValue({ kept: 1, converted: 0, cleared: 0 })
    render(<DataTableGrid tableId="t" fields={fields} rows={rows} canManage onChange={() => {}} />)
    fireEvent.click(screen.getByRole("button", { name: /^Cost, Number column/ }))
    fireEvent.click(screen.getByRole("button", { name: /^Type/ }))
    await act(async () => fireEvent.click(screen.getByRole("option", { name: /^Select/ })))
    await vi.waitFor(() => expect(toast).toHaveBeenCalledWith(told))
    expect(preview).toHaveBeenCalledWith("t", "cost", "select")
    expect(screen.queryByText(/Changing the type/)).toBeNull()
    // The type list is still there to pick from again.
    expect(screen.getByRole("option", { name: /^Select/ })).toBeTruthy()
  })

  // CR-66's SF1: after a deploy the old build's chunk is gone, and "try
  // again" failed until the page was reloaded by hand.
  it("reloads once for the new build after a deploy, saying nothing first", async () => {
    chunk.reload.mockResolvedValueOnce(true)
    render(<DataTableGrid tableId="t" fields={fields} rows={rows} canManage onChange={() => {}} />)
    fireEvent.click(screen.getByRole("button", { name: /^Cost, Number column/ }))
    const name = screen.getByRole("textbox", { name: "Column name" })
    fireEvent.change(name, { target: { value: "Price" } })
    await act(async () => fireEvent.blur(name))
    await vi.waitFor(() => expect(chunk.reload).toHaveBeenCalledTimes(1))
    expect(toast).not.toHaveBeenCalled()
  })
})
