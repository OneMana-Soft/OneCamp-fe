import * as React from "react"
import { flushSync } from "react-dom"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { installPointerEvent } from "@/lib/testing/pointerEvent"
import { FEEDBACK } from "@/lib/ui/feedback"
import type { TableField, TableRow } from "@/services/tableService"
import type { CellsRecord, CellsWrite } from "@/lib/tables/cellsWrite"

// The grid's one edit path, as a stand-in: the batch sent, nothing taken by an Undo.
vi.mock("@/lib/tables/cellsWrite", () => ({ writeCells: async (_record: unknown, c: CellsWrite) => ({ answer: await c.send(), undone: false }) }))

// G1's range is a piece of its own (rangePiece), off the table's first load:
// its eager shell (gridRange) keeps what the piece would take until it lands.
// The piece's import waits here until a test lets it land.
const gate = vi.hoisted(() => {
  let open!: () => void
  const landed = new Promise<void>((r) => (open = r))
  return { landed, open }
})
vi.mock("@/components/table/rangePiece", async (real) => {
  const m = await real<typeof import("@/components/table/rangePiece")>()
  await gate.landed
  return m
})
const ledger = vi.hoisted(() => ({ batchRows: vi.fn(async () => ({ change_set: "c1", created: [], updated: [], deleted: [] })), undoChange: vi.fn() }))
vi.mock("@/lib/tables/ledger", () => ledger)

import { useGridRange } from "@/components/table/gridRange"

const field = (id: string): TableField => ({ id, table_id: "t", name: id.toUpperCase(), type: "text", config: "{}", position: 0 })
const FIELDS = [field("a"), field("b")]
const ROWS = ["r0", "r1", "r2"].map((id, i) => ({ id, values: JSON.stringify({ a: `a${i}`, b: `b${i}` }) }) as unknown as TableRow)

function Grid() {
  const tableRef = React.useRef<HTMLTableElement>(null)
  const scrollRef = React.useRef<HTMLDivElement>(null)
  const [live, setLive] = React.useState<string | null>(null)
  const range = useGridRange({
    tableRef,
    scrollRef,
    writes: () => ({
      tableId: "t",
      canEdit: true,
      rows: () => ROWS,
      fields: () => FIELDS,
      valuesOf: (r) => JSON.parse(r.values as unknown as string),
      view: () => ({ given: ROWS.length, tail: 0, grouped: false }),
      placeOf: (id) => ROWS.findIndex((r) => r.id === id),
      offerUndo: () => undefined,
      onChange: () => undefined,
      select: (b) => range.select(b),
      // The grid's one edit path (useCellCommit), as a stand-in: the batch sent, nothing taken by an Undo.
      cells: {} as CellsRecord,
      // The toasts' one Undo path (useCellCommit's undo), as a stand-in.
      undo: (set) => ledger.undoChange(set),
    }),
    focusCell: () => undefined,
    revealCell: () => undefined,
  })
  // A finger's press brings its cell to life as it goes down, as the grid's does (DataTableGrid's bringToLife): a live
  // face takes the place of the one at rest, so the press's target leaves the page.
  const onPointerDown = (e: React.PointerEvent) => {
    range.onPointerDown(e)
    const at = (e.target as HTMLElement).closest("td")?.querySelector<HTMLElement>("[data-cell]")?.dataset.cell
    if (e.pointerType === "touch" && at) flushSync(() => setLive(at))
  }
  return (
    <div ref={scrollRef}>
      <table ref={tableRef} onKeyDown={(e) => range.onKey(e)} onFocus={(e) => range.onFocusIn(e.target)} onPasteCapture={range.onPaste} onPointerDownCapture={onPointerDown}>
        <thead>
          <tr>
            {FIELDS.map((f, c) => (
              <th key={f.id} data-col-index={c} />
            ))}
          </tr>
        </thead>
        <tbody>
          {ROWS.map((r, i) => (
            <tr key={r.id} data-index={i}>
              {FIELDS.map((f, c) => (
                <td key={f.id} data-field={f.id}>
                  {/* A text cell's face (cellFaces): a box holding its text box, which a finger's press lands on. */}
                  {live === `${i}:${c}` ? (
                    <div key="live" data-cell-box="">
                      <input data-cell={`${i}:${c}`} aria-label={`${f.name} ${i + 1}`} />
                    </div>
                  ) : (
                    <div key="rest" data-cell-box="">
                      <input data-cell={`${i}:${c}`} data-rest="" readOnly aria-label={`${f.name} ${i + 1}`} />
                    </div>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {range.overlay}
    </div>
  )
}

const cell = (at: string) => document.querySelector<HTMLInputElement>(`[data-cell="${at}"]`)!
const overlay = () => document.querySelector<HTMLElement>("[data-cell-range]")!
/** Where the range's box is drawn: row i at 20i px, column c at 100c px (rects below). */
const drawnAt = () => document.querySelector<HTMLElement>("[data-range-box]")!.style.transform

beforeAll(() => {
  installPointerEvent()
  // A row's rect by its index, a header's by its column: jsdom lays nothing out.
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    const d = (this as HTMLElement).dataset ?? {}
    const top = d.index !== undefined ? Number(d.index) * 20 : 0
    const left = d.colIndex !== undefined ? Number(d.colIndex) * 100 : 0
    return { top, bottom: top + 20, left, right: left + 100, x: left, y: top, width: 100, height: 20, toJSON: () => ({}) } as DOMRect
  })
})
afterEach(cleanup)

// One file, one landing: the piece lands once per module, so the tests run in order, before and after it.
describe("a grid's range before its piece lands, then after", () => {
  it("keeps Shift+arrows, a paste and a finger's press for the piece, which takes them up as it lands", async () => {
    // A hold's tap on the hand, as every other one in the app: feedback()'s impact.
    const vibrate = vi.fn(() => true)
    Object.defineProperty(navigator, "vibrate", { value: vibrate, configurable: true })
    render(<Grid />)
    act(() => cell("0:0").focus())
    // Every announcement the range makes, in order.
    const said: string[] = []
    new MutationObserver((records) => records.forEach((r) => r.addedNodes.forEach((n) => said.push(n.textContent ?? "")))).observe(screen.getByRole("status"), { childList: true })

    // Shift+ArrowRight on a cell at rest: taken now, done once the piece is in.
    expect(fireEvent.keyDown(cell("0:0"), { key: "ArrowRight", shiftKey: true })).toBe(false)
    // A plain arrow is the grid's, piece or none.
    expect(fireEvent.keyDown(cell("0:0"), { key: "ArrowRight" })).toBe(true)
    // A paste on a cell at rest: taken now, written once the piece is in.
    const clipboardData = { getData: (type: string) => (type === "text/plain" ? "x\ny" : "") }
    expect(fireEvent.paste(cell("1:1"), { clipboardData })).toBe(false)
    // A finger held on a cell, then a tap already over: the hold is taken up, the tap isn't. Each press lands on its
    // cell's box and brings the cell to life, so the held one's box has left the page when the piece lands (V-358).
    const held = cell("2:0").parentElement!
    fireEvent.pointerDown(held, { pointerType: "touch", pointerId: 7, button: 0, clientX: 5, clientY: 45 })
    expect(held.isConnected).toBe(false)
    fireEvent.pointerDown(cell("0:1").parentElement!, { pointerType: "touch", pointerId: 8, button: 0, clientX: 105, clientY: 5 })
    fireEvent.pointerUp(cell("0:1"), { pointerType: "touch", pointerId: 8, button: 0 })
    expect(screen.getByRole("status").textContent).toBe("")
    expect(ledger.batchRows).not.toHaveBeenCalled()

    await act(async () => gate.open())

    await waitFor(() => expect(said).toContain("2 cells selected, 1 row by 2 columns"))
    await waitFor(() => expect(ledger.batchRows).toHaveBeenCalledTimes(1))
    expect(ledger.batchRows).toHaveBeenCalledWith("t", { kind: "paste", patch: [{ row: "r1", values: { b: "x" } }, { row: "r2", values: { b: "y" } }] }, true)
    // The finger, still down, holds long enough: a range on its own cell (row 3, column 1, not the tap's), handle and all.
    await waitFor(() => expect(drawnAt()).toBe("translate(0px, 40px)"), { timeout: 2000 })
    expect(overlay().dataset.on).toBe("true")
    expect(overlay().dataset.single).toBe("false")
    // Once, for the hold: the tap that was over gave none.
    expect(vibrate).toHaveBeenCalledTimes(1)
    expect(vibrate).toHaveBeenCalledWith(FEEDBACK.impact.vibrate)
  })

  it("once the piece is in, the keys are its own at once", () => {
    render(<Grid />)
    act(() => cell("0:0").focus())
    expect(fireEvent.keyDown(cell("0:0"), { key: "ArrowDown", shiftKey: true })).toBe(false)
    expect(screen.getByRole("status").textContent).toBe("2 cells selected, 2 rows by 1 column")
    expect(fireEvent.keyDown(cell("0:0"), { key: "Escape" })).toBe(false)
    expect(screen.getByRole("status").textContent).toBe("")
  })
})
