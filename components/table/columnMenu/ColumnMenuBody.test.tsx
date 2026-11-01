import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"

import { ColumnMenuBody } from "@/components/table/columnMenu/ColumnMenuBody"
import type { TableField } from "@/services/tableService"

const summary: TableField = { id: "summary", table_id: "t", name: "Summary", type: "text", config: "{}", position: 1 }
const fields: TableField[] = [{ id: "item", table_id: "t", name: "Item", type: "text", config: "{}", position: 0 }, summary]

afterEach(() => {
  cleanup()
})

// G2b (airtable-04, gsheets-grid-01): up to three leading columns stay put
// sideways, frozen from a column's menu; the first always stays.
describe("freezing columns from a column's menu", () => {
  const body = (index: number, frozen: number, onFreeze?: (n: number) => void) =>
    render(<ColumnMenuBody field={summary} fields={fields} tableId="t" canManage index={index} frozen={frozen} onFreeze={onFreeze} page="main" openPage="main" onOpenPage={vi.fn()} onSave={vi.fn()} onDelete={vi.fn()} onFilled={vi.fn()} />)

  it("freezes up to the column, among the first three", () => {
    const onFreeze = vi.fn()
    body(2, 1, onFreeze)
    fireEvent.click(screen.getByRole("button", { name: "Freeze up to here" }))
    expect(onFreeze).toHaveBeenCalledWith(3)
    cleanup()
    body(3, 1, onFreeze)
    expect(screen.queryByRole("button", { name: "Freeze up to here" })).toBeNull()
  })

  it("unfreezes from a frozen column, back to the first alone, which offers no freeze of its own", () => {
    const onFreeze = vi.fn()
    body(0, 3, onFreeze)
    expect(screen.queryByRole("button", { name: "Freeze up to here" })).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Unfreeze columns" }))
    expect(onFreeze).toHaveBeenCalledWith(1)
    cleanup()
    // Not frozen: Freeze, no Unfreeze.
    body(1, 1, onFreeze)
    expect(screen.queryByRole("button", { name: "Unfreeze columns" })).toBeNull()
    expect(screen.getByRole("button", { name: "Freeze up to here" })).toBeTruthy()
    cleanup()
    // The last frozen column: frozen up to here already, so Unfreeze alone.
    body(2, 3, onFreeze)
    expect(screen.queryByRole("button", { name: "Freeze up to here" })).toBeNull()
    expect(screen.getByRole("button", { name: "Unfreeze columns" })).toBeTruthy()
  })

  it("offers neither where columns can't be frozen (a phone keeps one)", () => {
    body(1, 1)
    expect(screen.queryByRole("button", { name: "Freeze up to here" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Unfreeze columns" })).toBeNull()
  })
})
