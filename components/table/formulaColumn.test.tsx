import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"

const createField = vi.fn().mockResolvedValue({})
vi.mock("@/services/tableService", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/tableService")>()),
  createField: (...args: unknown[]) => createField(...args),
  previewFormula: vi.fn().mockResolvedValue({ result: "number", values: [] }),
}))
vi.mock("@/hooks/useConfirm", () => ({ useConfirm: () => vi.fn() }))

import { DataTableGrid } from "@/components/table/DataTableGrid"
import type { TableField, TableRow } from "@/services/tableService"

const fields: TableField[] = [
  { id: "price", table_id: "t", name: "Price", type: "number", config: "{}", position: 0 },
  { id: "total", table_id: "t", name: "Total", type: "formula", config: JSON.stringify({ formula: "{Price} * 4", result: "number" }), position: 1 },
  { id: "due", table_id: "t", name: "Ends", type: "formula", config: JSON.stringify({ formula: "TODAY() + 7", result: "date" }), position: 2 },
  {
    id: "broken",
    table_id: "t",
    name: "Per unit",
    type: "formula",
    config: JSON.stringify({ formula: "{Price} / {Gone}", result: "text", error: "A field this formula reads has been deleted" }),
    position: 3,
  },
]
const rows: TableRow[] = [
  {
    id: "r1",
    table_id: "t",
    position: 0,
    created_at: "",
    updated_at: "",
    values: JSON.stringify({ price: 12.5, total: 50, due: "2026-10-16", broken: { error: "A field this formula reads has been deleted" } }),
  },
]

afterEach(cleanup)

describe("a formula column", () => {
  it("shows what the server worked out, and can't be typed into", () => {
    render(<DataTableGrid tableId="t" fields={fields} rows={rows} canManage={false} onChange={() => {}} />)
    // Price's input, and no input for the formulas. A number cell is typed
    // as text with a decimal keypad (so the grid can read its caret for the
    // arrow keys), so it is a textbox, not a spinbutton.
    expect(screen.getAllByRole("textbox")).toHaveLength(1)
    expect(screen.getByRole("textbox", { name: "Price" }).getAttribute("inputmode")).toBe("decimal")
    expect(screen.getByText("50").className).toContain("tabular-nums")
    // A date in the app's one format, whatever the browser's locale.
    expect(screen.getByText(/^16 Oct( 2026)?$/)).toBeTruthy()
    // The cell and the header both say why it can't be worked out.
    expect(screen.getByText("A field this formula reads has been deleted")).toBeTruthy()
    expect(screen.getByLabelText("A field this formula reads has been deleted")).toBeTruthy()
  })

  it("is added with its formula", async () => {
    render(<DataTableGrid tableId="t" fields={fields} rows={rows} canManage onChange={() => {}} />)
    fireEvent.click(screen.getByRole("button", { name: "Add a column" }))
    fireEvent.change(screen.getByPlaceholderText("Column name"), { target: { value: "With tax" } })
    fireEvent.change(screen.getByDisplayValue("Text"), { target: { value: "formula" } })
    const add = screen.getByRole("button", { name: "Add" })
    // Not without a formula.
    expect((add as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(screen.getByRole("textbox", { name: "Formula" }), { target: { value: "{Total} * 1.18" } })
    await act(async () => fireEvent.click(add))
    expect(createField).toHaveBeenCalledWith("t", expect.objectContaining({ name: "With tax", type: "formula", config: { formula: "{Total} * 1.18" } }))
  })
})
