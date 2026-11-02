import { describe, expect, it, vi } from "vitest"
import { clearCells, fillCells, pasteCells, type RangeWrites } from "@/components/table/rangeActions"
import { EDITORS_CHOSEN, READ_ONLY_WORDS } from "@/lib/tables/tableEdit"
import type { TableField, TableRow } from "@/services/tableService"
import type { BatchResult } from "@/lib/tables/ledger"
import type { CellsRecord, CellsWrite } from "@/lib/tables/cellsWrite"

// The grid's one edit path, as each test's stand-in (writes().commitCells).
const into = vi.hoisted(() => ({ commit: (c: CellsWrite): Promise<unknown> => Promise.reject(c) }))
vi.mock("@/lib/tables/cellsWrite", () => ({ writeCells: (_record: unknown, c: CellsWrite) => into.commit(c) }))

// A range's writes for one who may only view the table (V-170): a paste, a
// fill or a clear plans nothing, sends no batch and says why in the server's
// words. An editor's same clear sends its batch, so the refusals are the
// reader's, not the harness's.

const field = (id: string) => ({ id, table_id: "t", name: id.toUpperCase(), type: "text", config: "{}", position: 0 }) as TableField
const FIELDS = [field("a"), field("b")]
const ROWS = ["r0", "r1", "r2"].map((id, i) => ({ id, values: { a: `a${i}`, b: `b${i}` } })) as unknown as TableRow[]

function writes(canEdit: boolean) {
  const say = vi.fn()
  const batch = vi.fn(async (): Promise<BatchResult> => ({ change_set: "c1", created: [], updated: [], deleted: [] }))
  const select = vi.fn()
  // The grid's one edit path (cellsWrite), as a stand-in: the batch sent, nothing taken by an Undo.
  const commitCells = vi.fn(async (c: CellsWrite) => ({ answer: await c.send(), undone: false }))
  into.commit = commitCells
  const w = {
    tableId: "t",
    canEdit,
    rows: () => ROWS,
    fields: () => FIELDS,
    valuesOf: (r: TableRow) => (r as unknown as { values: Record<string, unknown> }).values,
    view: () => ({ given: ROWS.length, tail: 0, grouped: false }),
    placeOf: (id: string) => ROWS.findIndex((r) => r.id === id),
    offerUndo: vi.fn(),
    onChange: vi.fn(),
    onCreated: vi.fn(),
    select,
    cells: {} as CellsRecord,
    press: vi.fn(),
    say,
    batch,
    undo: vi.fn(),
    read: (_f: TableField, text: string) => text,
    failure: (_e: unknown, fallback: string) => ({ message: fallback }),
    writable: () => true,
    text: () => [],
    count: (n: number) => String(n),
  } as unknown as RangeWrites
  return { w, say, batch, select, commitCells }
}

const TOLD = { tone: "warning", title: READ_ONLY_WORDS, description: EDITORS_CHOSEN }

describe("a viewer's range writes", () => {
  it("a paste sends no batch and says the reader may only view", async () => {
    const { w, say, batch, select } = writes(false)
    await pasteCells(w, { text: "x\ty\nz\tq", html: "" }, { top: 1, left: 0, bottom: 1, right: 0 })
    expect(batch).not.toHaveBeenCalled()
    expect(select).not.toHaveBeenCalled()
    expect(say).toHaveBeenCalledTimes(1)
    expect(say).toHaveBeenCalledWith(TOLD)
  })

  it("a fill sends no batch and says the reader may only view", async () => {
    const { w, say, batch, select } = writes(false)
    await fillCells(w, { left: 0, right: 1, source: { top: 0, bottom: 0 }, to: { top: 1, bottom: 2 } })
    expect(batch).not.toHaveBeenCalled()
    expect(select).not.toHaveBeenCalled()
    expect(say).toHaveBeenCalledWith(TOLD)
  })

  it("a clear sends no batch and says the reader may only view", async () => {
    const { w, say, batch } = writes(false)
    await clearCells(w, { top: 0, left: 0, bottom: 1, right: 1 })
    expect(batch).not.toHaveBeenCalled()
    expect(say).toHaveBeenCalledWith(TOLD)
  })

  it("an editor's same clear sends its batch and says nothing of viewing", async () => {
    const { w, say, batch } = writes(true)
    await clearCells(w, { top: 0, left: 0, bottom: 1, right: 1 })
    expect(batch).toHaveBeenCalledTimes(1)
    expect(say).not.toHaveBeenCalledWith(TOLD)
  })
})

// A paste in a view the server answers in windows (airtable-04): its rows
// are found by their places, which a read never moves, not by indexes, which
// a read before them (or a jump: a scrollbar dragged far) does. The reader is
// a stand-in: the rows read are places from..from+read-1, then the rows added
// here, and onNearEnd reads as the scenario says.
const placed = (place: number) => ({ id: `p${place}`, values: { a: `a${place}`, b: `b${place}` } }) as unknown as TableRow
function windowed(at: { from: number; read: number; count: number; tail?: TableRow[] }, onRead: (v: { from: number; read: number }) => void) {
  const v = { from: at.from, read: at.read }
  const tail = at.tail ?? []
  const onNearEnd = vi.fn(() => onRead(v))
  const { w, batch, select } = writes(true)
  Object.assign(w, {
    rows: () => [...Array.from({ length: v.read }, (_, i) => placed(v.from + i)), ...tail],
    view: () => ({ given: v.read + tail.length, tail: tail.length, from: v.from, count: at.count, grouped: false, onNearEnd }),
  })
  const patched = () => ((batch.mock.calls[0] as unknown as [{ patch?: { row: string }[] }] | undefined)?.[0].patch ?? []).map((p) => p.row)
  return { w, onNearEnd, patched, select }
}

describe("a paste in a view read in windows", () => {
  it("pastes over a row added here, never over the rows read after the ones held", async () => {
    const added = { id: "new", values: { a: "", b: "" } } as unknown as TableRow
    // 500 rows read, 5,000 in the view, the row added here last: a read on would put 500 more before it.
    const { w, onNearEnd, patched } = windowed({ from: 0, read: 500, count: 5000, tail: [added] }, (v) => (v.read += 500))
    await pasteCells(w, { text: "x", html: "" }, { top: 500, left: 0, bottom: 500, right: 0 })
    expect(onNearEnd).not.toHaveBeenCalled()
    expect(patched()).toEqual(["new"])
  })

  it("reads the places it pastes over, by place, past the rows read where the view jumped", async () => {
    const { w, onNearEnd, patched, select } = windowed({ from: 1000, read: 500, count: 5000 }, (v) => (v.read += 500))
    await pasteCells(w, { text: "x\ny\nz", html: "" }, { top: 498, left: 0, bottom: 498, right: 0 })
    expect(onNearEnd).toHaveBeenCalledWith(1500, 1498)
    expect(patched()).toEqual(["p1498", "p1499", "p1500"])
    expect(select).toHaveBeenCalledWith({ top: 498, left: 0, bottom: 500, right: 0 })
  })

  it("pastes over its own rows when a read puts rows before them (the view scrolled up meanwhile)", async () => {
    // The read reads back 500 rows before those held as well as on: every row held is 500 further down the rows given.
    const { w, patched, select } = windowed({ from: 1000, read: 500, count: 5000 }, (v) => {
      v.from -= 500
      v.read += 1000
    })
    await pasteCells(w, { text: "x\ny\nz", html: "" }, { top: 498, left: 0, bottom: 498, right: 0 })
    expect(patched()).toEqual(["p1498", "p1499", "p1500"])
    expect(select).toHaveBeenCalledWith({ top: 998, left: 0, bottom: 1000, right: 0 })
  })
})

// V-360 (DB-93's airtable-04 probes, 2 Nov): a fill or a paste showed nothing
// until its batch answered, and a Ctrl+Z pressed meanwhile took back the edit
// before it. A range's write now goes through the grid's one edit path: its
// cells show at once, as they will read, and an Undo can take it on its way.
describe("a range's write through the grid's one edit path (V-360)", () => {
  it("a fill hands its cells to the edit path at once, and sends its one batch through it", async () => {
    const { w, batch, commitCells } = writes(true)
    await fillCells(w, { left: 0, right: 0, source: { top: 0, bottom: 0 }, to: { top: 1, bottom: 2 }, copy: true })
    expect(commitCells).toHaveBeenCalledTimes(1)
    const c = commitCells.mock.calls[0][0]
    expect(c.what).toBe("fill")
    expect(c.cells).toEqual([
      { row: ROWS[1], values: { a: "a0" } },
      { row: ROWS[2], values: { a: "a0" } },
    ])
    expect(batch).toHaveBeenCalledTimes(1)
    expect(batch).toHaveBeenCalledWith({ kind: "fill", patch: [{ row: "r1", values: { a: "a0" } }, { row: "r2", values: { a: "a0" } }] })
  })

  it("a paste shows each cell as its kind reads the text, sends the text, and shows the rows it adds at once", async () => {
    const { w, batch, commitCells } = writes(true)
    const amount = { ...field("n"), type: "number" } as TableField
    Object.assign(w, { fields: () => [field("a"), amount], read: (f: TableField, text: string) => (f.type === "number" ? Number(text) : text) })
    await pasteCells(w, { text: "x\t7\ny\t8", html: "" }, { top: 2, left: 0, bottom: 2, right: 0 })
    expect(commitCells).toHaveBeenCalledTimes(1)
    const c = commitCells.mock.calls[0][0]
    expect(c.what).toBe("paste")
    expect(c.cells).toEqual([{ row: ROWS[2], values: { a: "x", n: 7 } }])
    expect(c.adding).toEqual([{ a: "y", n: 8 }])
    expect(batch).toHaveBeenCalledWith({ kind: "paste", patch: [{ row: "r2", values: { a: "x", n: "7" } }], create: [{ values: { a: "y", n: "8" } }] })
  })

  it("a write an Undo took back on its way offers no Undo of its own, adds no rows and selects nothing", async () => {
    const { w, batch, commitCells, select } = writes(true)
    batch.mockResolvedValue({ change_set: "c1", created: [ROWS[0]], updated: [], deleted: [] })
    commitCells.mockImplementation(async (c: CellsWrite) => ({ answer: await c.send(), undone: true }))
    await fillCells(w, { left: 0, right: 1, source: { top: 0, bottom: 0 }, to: { top: 1, bottom: 2 }, copy: true })
    expect(w.offerUndo).not.toHaveBeenCalled()
    expect(w.onCreated).not.toHaveBeenCalled()
    expect(select).not.toHaveBeenCalled()
  })

  it("a write the server stored nothing for (its change set is null) offers no Undo, and still says what it left out", async () => {
    const { w, batch, say } = writes(true)
    batch.mockResolvedValue({ change_set: null, created: [], updated: [], deleted: [] })
    Object.assign(w, { writable: (f: TableField) => f.id !== "b" })
    await fillCells(w, { left: 0, right: 1, source: { top: 0, bottom: 0 }, to: { top: 1, bottom: 2 }, copy: true })
    expect(batch).toHaveBeenCalledTimes(1)
    expect(w.offerUndo, "an Undo with no change set would take the change before it").not.toHaveBeenCalled()
    expect(w.undo).not.toHaveBeenCalled()
    expect(say).toHaveBeenCalledWith(expect.objectContaining({ tone: "warning", description: "B is worked out by the table, so it was left as it is." }))
  })

  it("offers an Undo whose action takes the write's own change set back through the table's one Undo path", async () => {
    const { w, batch } = writes(true)
    batch.mockResolvedValue({ change_set: "c7", created: [], updated: [], deleted: [] })
    await fillCells(w, { left: 0, right: 0, source: { top: 0, bottom: 0 }, to: { top: 1, bottom: 2 }, copy: true })
    expect(w.offerUndo).toHaveBeenCalledTimes(1)
    await vi.mocked(w.offerUndo).mock.calls[0][1]()
    expect(w.undo, "the toast's Undo names the fill's change set, in the table's order of writes").toHaveBeenCalledWith("c7")
  })

  it("a write refused on its way says so in the server's words", async () => {
    const { w, say, commitCells } = writes(true)
    commitCells.mockRejectedValue(new Error("offline"))
    Object.assign(w, { failure: () => ({ message: "The table is busy" }) })
    await fillCells(w, { left: 0, right: 0, source: { top: 0, bottom: 0 }, to: { top: 1, bottom: 2 }, copy: true })
    expect(say).toHaveBeenCalledWith({ tone: "error", title: "Couldn't fill those cells", description: "The table is busy" })
  })
})
