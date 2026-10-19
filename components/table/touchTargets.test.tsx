import { afterEach, describe, expect, it, vi, beforeAll } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"

// AI on, unless a test says otherwise (hooks/useClientConfig reads the server's config).
const ai = vi.hoisted(() => ({ on: true }))
vi.mock("@/hooks/useClientConfig", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/useClientConfig")>()),
  useAIAvailable: () => ai.on,
}))
vi.mock("@/services/tableService", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/tableService")>()),
  aggregateTable: vi.fn().mockResolvedValue({ buckets: [], truncated: false }),
  patchRow: vi.fn(),
  createRow: vi.fn(),
}))

import { DataTableBoard } from "@/components/table/DataTableBoard"
import { ColumnHeader } from "@/components/table/ColumnMenu"
import type { TableField, TableRow } from "@/services/tableService"
import { loadColumnMenus } from "@/components/table/ColumnMenu"
import { cellPickers } from "@/components/table/cellPickerPart"

// The column menus, the cell pickers are chunks of their own
// (lazyView): loaded once, before these tests, they draw at once.
beforeAll(() => Promise.all([loadColumnMenus(), cellPickers.warm()]))

afterEach(cleanup)

// QA PTC-14 (14 Oct): on a phone a board card's Move was 28 px and a column
// menu's controls 24 to 32. The tables' own controls take the shared 44 px
// rule (app/phone.css F3) where reaching out takes no neighbour's taps, and
// rows stacked edge to edge are 44 px tall under a finger instead.
const COARSE_ROW = "[@media(pointer:coarse)]:h-11"

describe("the tables' own controls under a finger", () => {
  it("on a board: a card's Move takes the 44 px rule, and a lane's buttons are 44 px tall", () => {
    const fields: TableField[] = [
      { id: "item", table_id: "t", name: "Item", type: "text", config: "{}", position: 0 },
      { id: "stage", table_id: "t", name: "Stage", type: "select", config: JSON.stringify({ options: [{ id: "o_todo", label: "To do" }] }), position: 1 },
    ]
    const rows: TableRow[] = Array.from({ length: 60 }, (_, i) => ({ id: `r${i}`, table_id: "t", position: i, created_at: "", updated_at: "", values: JSON.stringify({ item: `Card ${i}`, stage: "To do" }) }))
    render(<DataTableBoard tableId="t" fields={fields} rows={rows} canManage onChange={() => {}} />)
    expect(screen.getByRole("button", { name: "Move Card 1" }).hasAttribute("data-touch-target")).toBe(true)
    expect(screen.getAllByRole("button", { name: /Add card/ })[0].className).toContain(COARSE_ROW)
    expect(screen.getByRole("button", { name: "Show 10 more" }).className).toContain(COARSE_ROW)
  })

  it("in a column's menu: its rows are 44 px tall, and Back and a format's choices take the rule", () => {
    const cost: TableField = { id: "cost", table_id: "t", name: "Cost", type: "number", config: "{}", position: 0 }
    const menu = (page: "main" | "format") =>
      render(
        <table>
          <thead>
            <tr>
              <ColumnHeader field={cost} fields={[cost]} tableId="t" canManage index={0} openPage={page} onOpenPage={vi.fn()} onSave={vi.fn()} onDelete={vi.fn()} onFilled={vi.fn()} />
            </tr>
          </thead>
        </table>,
      )
    menu("main")
    expect(screen.getByRole("button", { name: /^Type/ }).className).toContain(COARSE_ROW)
    cleanup()
    menu("format")
    expect(screen.getByRole("button", { name: "Back" }).hasAttribute("data-touch-target")).toBe(true)
    for (const name of ["₹", "$", "Auto"]) expect(screen.getByRole("button", { name }).hasAttribute("data-touch-target")).toBe(true)
  })
})
