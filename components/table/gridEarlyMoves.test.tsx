import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react"
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import type { TableField, TableRow } from "@/services/tableService"

// V-148: the grid's keys between cells and its column drag come with the live
// cells' chunk (gridCells, which re-exports gridMoves), off the table's first
// load. Until it lands, the grid holds the keys that move and follows a drag's
// pointer, and hands both on once it does. The chunk's import waits here
// until a test lets it land, or fails while gate.fail says so.
const gate = vi.hoisted(() => {
  let open!: () => void
  const landed = new Promise<void>((r) => (open = r))
  return { landed, open, fail: false }
})
vi.mock("@/components/table/gridCells", async (real) => {
  if (gate.fail) throw new TypeError("Failed to fetch dynamically imported module")
  const m = await real<typeof import("@/components/table/gridCells")>()
  await gate.landed
  return m
})
const toast = vi.hoisted(() => vi.fn())
vi.mock("@/hooks/use-toast", async (real) => ({ ...(await real<typeof import("@/hooks/use-toast")>()), toast }))
vi.mock("@/hooks/useConfirm", () => ({ useConfirm: () => vi.fn() }))
vi.mock("@/hooks/useClientConfig", async (real) => ({ ...(await real<typeof import("@/hooks/useClientConfig")>()), useAIAvailable: () => false }))

import { DataTableGrid } from "@/components/table/DataTableGrid"

const fields: TableField[] = [
  { id: "item", table_id: "t", name: "Item", type: "text", config: "{}", position: 0 },
  { id: "cost", table_id: "t", name: "Cost", type: "number", config: "{}", position: 1 },
]
const rows: TableRow[] = Array.from({ length: 4 }, (_, i) => ({
  id: `r${i}`,
  table_id: "t",
  position: i,
  created_at: "",
  updated_at: "",
  values: JSON.stringify({ item: `Line ${i}`, cost: 100 + i }),
}))

const cell = (at: string) => document.querySelector<HTMLElement>(`[data-cell="${at}"]`)!
/** A column's 8 px edge (ColumnHeader), which a press drags. */
const edge = (index: number) => document.querySelector<HTMLElement>(`thead th[data-col-index="${index}"] .cursor-col-resize`)!
const pointer = (target: EventTarget, type: string, clientX: number) =>
  target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX, button: 0 }))
/** A key on the focused element: false when the grid took it (held or moved by). */
const key = (k: string, mods: KeyboardEventInit = {}) => fireEvent.keyDown(document.activeElement!, { key: k, ...mods })

beforeAll(() => {
  // jsdom lays nothing out: every header is 200 px wide, from the left edge.
  vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockImplementation(function (this: HTMLElement) {
    return this.tagName === "TH" ? 200 : 0
  })
})
afterEach(() => {
  cleanup()
  toast.mockReset()
  // A test that fails mid-way leaves the next ones a load that lands.
  gate.fail = false
})

// One file, one landing: the chunk lands once per module, so the tests run in order, before it and after.
describe("the grid's moves before the live cells land, then after", () => {
  it("drops the keys held for a load that fails, and a drag let go meanwhile, and says so once for each", async () => {
    gate.fail = true
    const onWidth = vi.fn()
    render(<DataTableGrid tableId="t" fields={fields} rows={rows} canManage onChange={() => {}} onWidth={onWidth} />)
    cell("0:0").focus()
    expect(key("ArrowDown")).toBe(false)
    expect(key("ArrowRight")).toBe(false)
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ tone: "error", title: "Couldn't move between cells: try again" })))
    expect(toast).toHaveBeenCalledTimes(1)
    expect(document.activeElement).toBe(cell("0:0"))
    // The Item column's edge, pressed at 300, moved to 360 and let go while the load fails: said once, no width kept.
    const was = document.querySelectorAll("col")[1].style.width
    pointer(edge(0), "pointerdown", 300)
    pointer(window, "pointermove", 360)
    pointer(window, "pointerup", 360)
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ tone: "error", title: "Couldn't resize that column: try again" })))
    expect(toast).toHaveBeenCalledTimes(2)
    expect(onWidth).not.toHaveBeenCalled()
    expect(document.querySelectorAll("col")[1].style.width).toBe(was)
  })

  // A tap selects a cell at rest on a touch screen: its box holds the focus, shut, and its text box ignores taps until then.
  it("holds the keys from a cell selected but shut: the arrows, and Enter or F2, which open it", () => {
    render(<DataTableGrid tableId="t" fields={fields} rows={rows} canManage onChange={() => {}} />)
    const box = cell("1:0").closest<HTMLElement>("[data-cell-box]")!
    box.focus()
    expect(key("ArrowDown")).toBe(false)
    expect(key("ArrowLeft")).toBe(false)
    expect(key("Enter")).toBe(false)
    expect(key("F2")).toBe(false)
    expect(document.activeElement).toBe(box)
    // Alt+Down moves nothing, from a shut cell as from its box.
    expect(key("ArrowDown", { altKey: true })).toBe(true)
  })

  it("holds the keys that move and a drag's pointer, then presses the keys in order and keeps the width the drag reached", async () => {
    const onWidth = vi.fn()
    render(<DataTableGrid tableId="t" fields={fields} rows={rows} canManage onChange={() => {}} onWidth={onWidth} />)
    cell("0:0").focus()
    // Left (at the edge, so nothing), Down, Enter (it opens the cell selected there, V-295), Enter (it saves it,
    // going down), then right: each held, the focus where it was. Only in that order do they end on 2:1: pressed the
    // other way round, Left comes last and ends on 2:0.
    expect(key("ArrowLeft")).toBe(false)
    expect(key("ArrowDown")).toBe(false)
    expect(key("Enter")).toBe(false)
    expect(key("Enter")).toBe(false)
    expect(key("ArrowRight")).toBe(false)
    expect(document.activeElement).toBe(cell("0:0"))
    // A key that moves nothing (Alt+Down opens a select) is left alone.
    expect(key("ArrowDown", { altKey: true })).toBe(true)
    // The Item column's edge, pressed at 300, moved to 360 and let go: nothing is kept yet.
    pointer(edge(0), "pointerdown", 300)
    pointer(window, "pointermove", 360)
    pointer(window, "pointerup", 360)
    expect(onWidth).not.toHaveBeenCalled()

    await act(async () => gate.open())
    await waitFor(() => expect(document.activeElement).toBe(cell("2:1")))
    // 200 px and the 60 the pointer went: kept as the drag's end, which came first.
    expect(onWidth.mock.calls).toEqual([["item", 260]])
    expect(document.querySelectorAll("col")[1].style.width).toBe("260px")
    expect(toast).not.toHaveBeenCalled()
  })

  it("once they're in, moves at once, and a drag's edge follows the pointer between 80 and 640 px", async () => {
    const onWidth = vi.fn()
    render(<DataTableGrid tableId="t" fields={fields} rows={rows} canManage onChange={() => {}} onWidth={onWidth} />)
    cell("1:1").focus()
    expect(key("ArrowUp")).toBe(false)
    expect(document.activeElement).toBe(cell("0:1"))
    pointer(edge(1), "pointerdown", 500)
    pointer(window, "pointermove", 1000)
    expect(document.querySelectorAll("col")[2].style.width).toBe("640px")
    pointer(window, "pointermove", 100)
    expect(document.querySelectorAll("col")[2].style.width).toBe("80px")
    pointer(window, "pointermove", 540)
    expect(onWidth).not.toHaveBeenCalled()
    pointer(window, "pointerup", 540)
    expect(onWidth.mock.calls).toEqual([["cost", 240]])
    // The drag is over: the pointer moves nothing now.
    pointer(window, "pointermove", 700)
    expect(document.querySelectorAll("col")[2].style.width).toBe("240px")
  })
})
