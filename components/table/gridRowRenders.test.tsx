import { renders } from "@/lib/testing/reactRenders"
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render } from "@testing-library/react"
import { scrollBox, sizeBoxes } from "@/lib/testing/virtualBox"
import { FLUIDITY_FIELDS, fluidityRows } from "@/lib/testing/fluidityTable"

// What a row costs as it enters the grid's window (tables T6b, FLUIDITY-LEAD's
// fluid-07 profile, 20 Oct 2026): React components rendered, counted as React
// DevTools counts them. A scroll of the 10,000-row grid rendered about 43 a
// row entering (10,506 a scroll): the row, and each cell's components (44 a
// row of the 13 fields here, 2,205 for 50 rows: Cell 650, TextCell 350,
// LazyPopover 150, OptionChip 150, the icons and the rest).

const ai = vi.hoisted(() => ({ on: true }))
vi.mock("@/hooks/useClientConfig", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/hooks/useClientConfig")>()),
  useAIAvailable: () => ai.on,
}))
vi.mock("@/hooks/useConfirm", () => ({ useConfirm: () => vi.fn() }))

const { DataTableGrid, LiveCells, SummaryPart } = await import("@/components/table/DataTableGrid")
const { loadColumnMenus } = await import("@/components/table/ColumnMenu")
const { cellPickers } = await import("@/components/table/cellPickerPart")

beforeAll(() => Promise.all([loadColumnMenus(), cellPickers.warm(), SummaryPart.warm(), LiveCells.warm()]))
afterEach(() => cleanup())

// jsdom lays nothing out: the grid's box is given a laptop's screen of room,
// which the virtualizer reads its window from.
afterAll(sizeBoxes("data-table-grid", { width: 1280, height: 720 }))

describe("a row entering the grid's window", () => {
  // Now one render a row entering (GridRow, its cells at rest as markup) and
  // the window's once a tick (GridBody): 55 for these 50 rows and 5 ticks.
  it("renders once, not once a cell", () => {
    render(<DataTableGrid tableId="t" fields={FLUIDITY_FIELDS} rows={fluidityRows(10_000)} canManage onChange={() => {}} />)
    const box = document.querySelector<HTMLElement>("[data-table-grid]")!
    const first = () => Number(document.querySelector<HTMLElement>("tbody tr[data-index]")?.dataset.index)
    scrollBox(box, 40_000)
    const at = first()
    renders.reset()
    const ticks = 5
    for (let k = 1; k <= ticks; k++) scrollBox(box, 40_000 + k * 400)
    const entered = first() - at
    expect(entered).toBeGreaterThanOrEqual(40)
    expect(renders.count, `${renders.count} renders for ${entered} rows: ${renders.top()}`).toBeLessThanOrEqual(entered + ticks)
  })
})

describe("the mouse over the grid", () => {
  // A cell comes to life as the mouse comes onto it, and as rows move under a
  // mouse at rest: a wheel's scroll moves them, and the browser's hover
  // follows. While the live cell was DataTableGrid's state, each rendered the
  // whole grid again, its column headers' menus most (254 components here):
  // the 100,000-row grid scrolled with the mouse over it rendered 53,126
  // against 919 (FLUIDITY-LEAD-9's trial of T5c, 22 Oct 2026). The table is
  // read in windows: its first 500 rows of 100,000.
  const ROW_PX = 40
  // A cell coming to life: the window, the row left at rest, and the row
  // entered with its live cell (the live cells' View, Cell, TextCell).
  const LIFE = 6
  const grid = () =>
    render(<DataTableGrid tableId="t" fields={FLUIDITY_FIELDS} rows={fluidityRows(500)} count={100_000} tail={0} canManage onChange={() => {}} onNearEnd={() => {}} />)
  // The mouse comes over the Notes cell of the row at `place`.
  const hover = (place: number) => {
    const td = document.querySelector<HTMLElement>(`tbody tr[data-index="${place}"] td[data-field="f10"]`)
    if (!td) throw new Error(`row ${place} isn't in the window`)
    fireEvent.pointerOver(td, { pointerType: "mouse" })
    return td
  }
  const isLive = (td: HTMLElement) => td.querySelector("[data-rest]") === null

  it("brings a cell to life rendering the row it leaves and its own, not the grid", () => {
    grid()
    const left = hover(3)
    renders.reset()
    const entered = hover(4)
    expect(isLive(entered)).toBe(true)
    expect(isLive(left)).toBe(false)
    expect(renders.count, `${renders.count} renders: ${renders.top()}`).toBeLessThanOrEqual(LIFE)
  })

  it("renders the rows entering a scroll and the cell under the mouse, not the grid", () => {
    grid()
    const box = document.querySelector<HTMLElement>("[data-table-grid]")!
    const first = () => Number(document.querySelector<HTMLElement>("tbody tr[data-index]")?.dataset.index)
    // The mouse rests five rows down the box.
    const under = (top: number) => Math.floor(top / ROW_PX) + 5
    scrollBox(box, 4_000)
    hover(under(4_000))
    const at = first()
    renders.reset()
    const ticks = 5
    for (let k = 1; k <= ticks; k++) {
      const top = 4_000 + k * 400
      scrollBox(box, top)
      expect(isLive(hover(under(top)))).toBe(true)
    }
    const entered = first() - at
    expect(entered).toBeGreaterThanOrEqual(40)
    expect(renders.count, `${renders.count} renders for ${entered} rows: ${renders.top()}`).toBeLessThanOrEqual(entered + ticks + ticks * LIFE)
  })
})
