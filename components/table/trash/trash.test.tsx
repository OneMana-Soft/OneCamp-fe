import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"

// The trash (tables A2): what's in it, who deleted it and when, and Restore,
// which brings it back and takes it off the list.

const ledger = vi.hoisted(() => ({ readTableTrash: vi.fn(), restoreFromTrash: vi.fn(), readTablesTrash: vi.fn(), restoreTable: vi.fn() }))
vi.mock("@/lib/tables/ledger", async (orig) => ({ ...(await orig<typeof import("@/lib/tables/ledger")>()), ...ledger }))
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: false, isTablet: false, isDesktop: true }) }))
const push = vi.fn()
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }))
const { toast } = vi.hoisted(() => ({ toast: vi.fn() }))
vi.mock("@/hooks/use-toast", async (orig) => ({ ...(await orig<typeof import("@/hooks/use-toast")>()), useToast: () => ({ toast }) }))

import { TableTrash, trashRowName } from "@/components/table/trash/TableTrash"
import { TablesTrash } from "@/components/table/trash/TablesTrash"
import type { TableField } from "@/services/tableService"

const fields: TableField[] = [
  { id: "notes", table_id: "t", name: "Notes", type: "text", config: "{}", position: 1 },
  { id: "item", table_id: "t", name: "Item", type: "text", config: "{}", position: 2, primary: true },
]
const now = new Date().toISOString()

afterEach(() => {
  cleanup()
  for (const f of Object.values(ledger)) f.mockReset()
  toast.mockReset()
  push.mockReset()
})

describe("a deleted row's name in the trash", () => {
  it("is its primary field's value, else its number", () => {
    expect(trashRowName({ id: "r", values: { item: "Booth", notes: "Hall 2" }, deleted_at: now }, fields)).toBe("Booth")
    expect(trashRowName({ id: "r", values: { notes: "Hall 2" }, row_no: 42, deleted_at: now }, fields)).toBe("Row 42")
    expect(trashRowName({ id: "r", values: {}, deleted_at: now }, fields)).toBe("Untitled")
  })
})

describe("a table's trash", () => {
  it("lists rows and columns with who deleted them, and brings one back", async () => {
    ledger.readTableTrash.mockResolvedValue({
      rows: [
        { id: "r1", values: { item: "Booth" }, deleted_at: now, deleted_by_name: "Bo" },
        { id: "r2", values: { item: "Banner" }, deleted_at: now },
      ],
      more: false,
      fields: [{ field: { id: "cost", table_id: "t", name: "Cost", type: "number", config: "{}", position: 3, deleted_at: now }, deleted_by_name: "Maya" }],
    })
    ledger.restoreFromTrash.mockResolvedValue({ change_set: "cs" })
    const restored = vi.fn()
    render(<TableTrash tableId="t" fields={fields} onClose={vi.fn()} onRestored={restored} />)
    expect(await screen.findByText("Booth")).toBeTruthy()
    expect(screen.getByText("Deleted just now by Bo")).toBeTruthy()
    expect(screen.getByText("Cost")).toBeTruthy()
    expect(screen.getByText("Deleted just now by Maya")).toBeTruthy()
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Restore Booth" })))
    expect(ledger.restoreFromTrash).toHaveBeenCalledWith("t", { rows: ["r1"] })
    expect(screen.queryByText("Booth")).toBeNull()
    expect(restored).toHaveBeenCalled()
    expect(toast).toHaveBeenCalledWith({ title: "Restored “Booth”" })
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Restore Cost" })))
    expect(ledger.restoreFromTrash).toHaveBeenCalledWith("t", { fields: ["cost"] })
  })

  it("says it's empty", async () => {
    ledger.readTableTrash.mockResolvedValue({ rows: [], more: false, fields: [] })
    render(<TableTrash tableId="t" fields={fields} onClose={vi.fn()} onRestored={vi.fn()} />)
    expect(await screen.findByText("The trash is empty")).toBeTruthy()
  })

  it("reads more, from the last row shown", async () => {
    ledger.readTableTrash.mockResolvedValueOnce({ rows: [{ id: "r1", values: { item: "Booth" }, deleted_at: now }], more: true, fields: [] })
    ledger.readTableTrash.mockResolvedValueOnce({ rows: [{ id: "r0", values: { item: "Older" }, deleted_at: now }], more: false, fields: [] })
    render(<TableTrash tableId="t" fields={fields} onClose={vi.fn()} onRestored={vi.fn()} />)
    const more = await screen.findByRole("button", { name: "Show more" })
    await act(async () => fireEvent.click(more))
    expect(ledger.readTableTrash).toHaveBeenLastCalledWith("t", "r1")
    await waitFor(() => expect(screen.getByText("Older")).toBeTruthy())
    expect(screen.queryByRole("button", { name: "Show more" })).toBeNull()
  })
})

describe("the tables' trash", () => {
  it("brings a table back, with a way to open it", async () => {
    ledger.readTablesTrash.mockResolvedValue([{ table: { id: "t1", name: "Budget", visibility: "workspace", created_by: "u", created_at: now, updated_at: now, deleted_at: now }, deleted_by_name: "Maya" }])
    ledger.restoreTable.mockResolvedValue({ id: "t1" })
    const restored = vi.fn()
    render(<TablesTrash onClose={vi.fn()} onRestored={restored} />)
    expect(await screen.findByText("Budget")).toBeTruthy()
    expect(screen.getByText("Deleted just now by Maya")).toBeTruthy()
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Restore Budget" })))
    expect(ledger.restoreTable).toHaveBeenCalledWith("t1")
    expect(restored).toHaveBeenCalled()
    const said = toast.mock.lastCall?.[0] as { title: string; action: { props: { onClick: () => void } } }
    expect(said.title).toBe("Restored “Budget”")
    said.action.props.onClick()
    expect(push).toHaveBeenCalledWith("/app/tables/t1")
  })
})
