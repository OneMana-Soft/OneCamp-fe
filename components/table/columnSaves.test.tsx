import { afterEach, describe, expect, it, vi, beforeAll } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"

// AI on (hooks/useClientConfig reads the server's config).
vi.mock("@/hooks/useClientConfig", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/useClientConfig")>()),
  useAIAvailable: () => true,
}))
vi.mock("@/services/tableService", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/tableService")>()),
  aggregateTable: vi.fn().mockResolvedValue({ buckets: [], truncated: false }),
}))

import { ColumnHeader, type ColumnPage } from "@/components/table/ColumnMenu"
import type { TableField } from "@/services/tableService"
import { loadColumnMenus } from "@/components/table/ColumnMenu"
import { cellPickers } from "@/components/table/cellPickerPart"

// The column menus, the cell pickers are chunks of their own
// (lazyView): loaded once, before these tests, they draw at once.
beforeAll(() => Promise.all([loadColumnMenus(), cellPickers.warm()]))

// The server keeps what a column's save leaves out. Each save from the menu
// sent the page copy's name with it, so a setting changed in a tab read
// before a rename put the old name back (and, before that, the copy's
// config and place).

function menu(field: TableField, page: ColumnPage) {
  const onSave = vi.fn().mockResolvedValue(true)
  render(
    <table>
      <thead>
        <tr>
          <ColumnHeader field={field} fields={[field]} tableId="t" canManage index={0} openPage={page} onOpenPage={vi.fn()} onSave={onSave} onDelete={vi.fn()} onFilled={vi.fn()} />
        </tr>
      </thead>
    </table>,
  )
  return onSave
}

const field = (type: TableField["type"], config: Record<string, unknown> = {}): TableField => ({ id: "f", table_id: "t", name: "Old name", type, config: JSON.stringify(config), position: 4 })

afterEach(cleanup)

describe("a column's save from its menu names only what it changes", () => {
  it("a rename, its name", () => {
    const onSave = menu(field("number", { format: { currency: "INR" } }), "main")
    const name = screen.getByRole("textbox", { name: "Column name" })
    fireEvent.change(name, { target: { value: "Cost" } })
    fireEvent.blur(name)
    expect(onSave).toHaveBeenCalledWith({ name: "Cost" })
  })

  it("a number's format, its config", () => {
    const onSave = menu(field("number", { format: { decimals: 2 } }), "format")
    fireEvent.click(screen.getByRole("button", { name: "₹" }))
    expect(onSave).toHaveBeenCalledWith({ config: { format: { decimals: 2, currency: "INR" } } })
  })

  it("a date made a due date, its config", () => {
    const onSave = menu(field("date"), "main")
    fireEvent.click(screen.getByRole("switch", { name: "Due date" }))
    expect(onSave).toHaveBeenCalledWith({ config: { due: true } })
  })

  it("an option added, its config", async () => {
    const onSave = menu(field("select", { options: [{ id: "o_open0000001", label: "Open" }] }), "options")
    const add = screen.getByRole("textbox", { name: "New option" })
    fireEvent.change(add, { target: { value: "Won" } })
    await act(async () => fireEvent.keyDown(add, { key: "Enter" }))
    const saved = onSave.mock.lastCall?.[0] as Record<string, unknown>
    expect(Object.keys(saved)).toEqual(["config"])
    expect((saved.config as { options: { label: string }[] }).options.map((o) => o.label)).toEqual(["Open", "Won"])
  })

  it("an AI prompt, its config", () => {
    const onSave = menu(field("text"), "ai")
    fireEvent.change(screen.getByRole("textbox", { name: "What AI should put in each cell" }), { target: { value: "Summarise the row" } })
    fireEvent.click(screen.getByRole("button", { name: "Save prompt" }))
    expect(onSave).toHaveBeenCalledWith({ config: { ai: { prompt: "Summarise the row", auto: false } } })
  })
})
