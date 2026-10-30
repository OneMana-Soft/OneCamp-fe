import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { cleanup, render } from "@testing-library/react"
import { countReads, scrollBox, sizeBoxes } from "@/lib/testing/virtualBox"

// The grid's work at scale (tables T6b, FLUIDITY-LEAD's fluid-07 profile, 20
// Oct 2026): what a scroll tick and a cell's commit cost, counted in the rows
// they read, so a regression fails here before a fluidity run times it.

const parsed = vi.fn()
const ai = vi.hoisted(() => ({ on: true }))
vi.mock("@/hooks/useClientConfig", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/useClientConfig")>()),
  useAIAvailable: () => ai.on,
}))
vi.mock("@/services/tableService", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/services/tableService")>()
  return {
    ...real,
    // Counted: every read of a row's values is a JSON parse.
    parseRowValues: (r: Parameters<typeof real.parseRowValues>[0]) => {
      parsed(r.id)
      return real.parseRowValues(r)
    },
  }
})
vi.mock("@/hooks/useConfirm", () => ({ useConfirm: () => vi.fn() }))

import { DataTableGrid, LiveCells, SummaryPart } from "@/components/table/DataTableGrid"
import type { TableField, TableRow } from "@/services/tableService"
import { loadColumnMenus } from "@/components/table/ColumnMenu"
import { cellPickers } from "@/components/table/cellPickerPart"

beforeAll(() => Promise.all([loadColumnMenus(), cellPickers.warm(), SummaryPart.warm(), LiveCells.warm()]))

// jsdom lays nothing out: the grid's box is given a laptop's screen of room,
// which the virtualizer reads its window from (offsetWidth, offsetHeight).
afterAll(sizeBoxes("data-table-grid", { width: 1280, height: 720 }))
afterEach(() => {
  cleanup()
  parsed.mockReset()
})

const fields: TableField[] = [
  { id: "item", table_id: "t", name: "Item", type: "text", config: "{}", position: 0 },
  { id: "cost", table_id: "t", name: "Cost", type: "number", config: "{}", position: 1 },
  { id: "paid", table_id: "t", name: "Paid", type: "checkbox", config: "{}", position: 2 },
]
const rowOf = (i: number, cost = 100 + i): TableRow => ({
  id: `r${i}`,
  table_id: "t",
  position: i,
  created_at: "",
  updated_at: "",
  values: JSON.stringify({ item: `Line ${i}`, cost, paid: i % 2 === 0 }),
})
const rowsOf = (n: number) => Array.from({ length: n }, (_, i) => rowOf(i))

describe("a scroll of the grid", () => {
  // GridBody rendered on every scroll tick, and the virtualizer worked out
  // every row's place again on each: its key function was a new one each
  // render (1,192 ms of GridBody's own time a tick at 100,000 rows).
  it("reads the rows near its window, not every row of the table", () => {
    const { items: rows, reads } = countReads(rowsOf(10_000))
    render(<DataTableGrid tableId="t" fields={fields} rows={rows} canManage onChange={() => {}} />)
    const box = document.querySelector<HTMLElement>("[data-table-grid]")!
    const first = () => Number(document.querySelector<HTMLElement>("tbody tr[data-index]")?.dataset.index)
    scrollBox(box, 40_000)
    const at = first()
    expect(at).toBeGreaterThan(500)
    reads.n = 0
    for (const top of [40_400, 40_800, 41_200, 41_600]) scrollBox(box, top)
    // The window moved down with each tick (10 rows a tick).
    expect(first()).toBeGreaterThan(at + 30)
    // About one window of rows (42) a tick.
    expect(reads.n).toBeLessThan(400)
  })
})

describe("a cell's commit", () => {
  // SummaryCell worked out every footer from every row on each change: each
  // row's values parsed again, once a column (981 ms a commit at 100,000).
  it("reads the one row that changed, and works out only its column's footer", () => {
    const rows = rowsOf(2000)
    const { rerender } = render(<DataTableGrid tableId="t" fields={fields} rows={rows} canManage onChange={() => {}} summary={{}} />)
    const sum = () => document.querySelector("[data-summary-bar]")?.textContent ?? ""
    const before = sum()
    expect(before).toContain(new Intl.NumberFormat("en-US").format(rows.reduce((a, _, i) => a + 100 + i, 0)))
    parsed.mockReset()
    const next = rows.slice()
    next[5] = rowOf(5, 1105)
    rerender(<DataTableGrid tableId="t" fields={fields} rows={next} canManage onChange={() => {}} summary={{}} />)
    // The footer follows the change (row 5's cost went from 105 to 1,105).
    expect(sum()).toContain(new Intl.NumberFormat("en-US").format(rows.reduce((a, _, i) => a + 100 + i, 0) + 1000))
    expect(parsed.mock.calls.length).toBeLessThanOrEqual(2)
  })
})
