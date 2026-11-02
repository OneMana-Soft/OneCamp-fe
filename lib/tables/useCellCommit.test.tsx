import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, renderHook, waitFor } from "@testing-library/react"
import type { TableRow } from "@/services/tableService"

const patch = vi.hoisted(() => vi.fn())
const links = vi.hoisted(() => vi.fn())
vi.mock("@/services/tableService", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/tableService")>()),
  patchRow: (...a: unknown[]) => patch(...a),
  changeLinks: (...a: unknown[]) => links(...a),
}))
const undoChange = vi.hoisted(() => vi.fn())
vi.mock("@/lib/tables/ledger", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/tables/ledger")>()), undoChange: (...a: unknown[]) => undoChange(...a) }))

import { ledger, shownValues, useCellCommit, type CellCommit } from "@/lib/tables/useCellCommit"
import { writeCells } from "@/lib/tables/cellsWrite"
import type { Aim } from "@/lib/tables/undoOrder"
import type { BatchResult } from "@/lib/tables/ledger"

const rowWith = (status: string, version = 1): TableRow => ({ id: "r1", table_id: "t", position: 0, created_at: "", updated_at: String(version), values: JSON.stringify({ status }) })

afterEach(() => {
  cleanup()
  patch.mockReset()
  links.mockReset()
  undoChange.mockReset()
})

describe("saving a cell", () => {
  // The W0 audit (4935a540's row): an edit was forgotten only when the row's
  // copy showed the same value, so after someone else's change, picking your
  // earlier value again was never sent; the cell showed it, the server didn't.
  it("sends an earlier value picked again after someone else changed the cell", async () => {
    patch.mockResolvedValue({})
    let rows = [rowWith("Open")]
    const { result, rerender } = renderHook(() => useCellCommit({ tableId: "t", rows, onChange: vi.fn() }))
    await act(() => result.current.commitCell(rows[0], "status", "Won"))
    rows = [rowWith("Lost", 2)]
    rerender()
    await act(() => result.current.commitCell(rows[0], "status", "Won"))
    expect(patch).toHaveBeenCalledTimes(2)
    expect(patch).toHaveBeenLastCalledWith("t", "r1", { status: "Won" })
  })

  it("still sends an edit undone before the row's copy is read again", async () => {
    patch.mockResolvedValue({})
    const rows = [rowWith("Open")]
    const { result } = renderHook(() => useCellCommit({ tableId: "t", rows, onChange: vi.fn() }))
    await act(() => result.current.commitCell(rows[0], "status", "Won"))
    await act(() => result.current.commitCell(rows[0], "status", "Open"))
    expect(patch).toHaveBeenCalledTimes(2)
    expect(patch).toHaveBeenLastCalledWith("t", "r1", { status: "Open" })
  })

  // FLUIDITY-LEAD, 20 Oct: a save read the whole bundle again (534 ms at
  // 100,000 rows; a formula showed its new value 983 ms later). The save's
  // answer is the row as a read gives it, and it goes where the row is held.
  it("puts a saved row back as the save answered it, and reads nothing again", async () => {
    vi.useFakeTimers()
    try {
      const answered = { ...rowWith("Won", 2), values: JSON.stringify({ status: "Won", total: 36 }) }
      patch.mockResolvedValue(answered)
      const onChange = vi.fn()
      const onSaved = vi.fn()
      const rows = [rowWith("Open")]
      const { result } = renderHook(() => useCellCommit({ tableId: "t", rows, onChange, onSaved }))
      await act(() => result.current.commitCell(rows[0], "status", "Won"))
      expect(onSaved).toHaveBeenCalledWith(answered)
      await act(async () => {
        vi.advanceTimersByTime(5000)
      })
      expect(onChange).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  // A tick, then an untick made before the tick was saved: the tick's answer
  // was put back, so the box showed ticked again until the untick's answer
  // came (e2e/tables/cellTargets' desktop checkbox failed on it under load).
  it("puts back only the answer to the row's last write", async () => {
    const answers: Array<(row: TableRow) => void> = []
    patch.mockImplementation(() => new Promise<TableRow>((resolve) => answers.push(resolve)))
    const onSaved = vi.fn()
    const rows = [rowWith("Open")]
    const { result } = renderHook(() => useCellCommit({ tableId: "t", rows, onChange: vi.fn(), onSaved }))
    let won: Promise<boolean> = Promise.resolve(false)
    let open: Promise<boolean> = Promise.resolve(false)
    act(() => {
      won = result.current.commitCell(rows[0], "status", "Won")
      open = result.current.commitCell(rows[0], "status", "Open")
    })
    await act(async () => {
      answers[0](rowWith("Won", 2))
      expect(await won).toBe(true)
    })
    expect(onSaved).not.toHaveBeenCalled()
    await waitFor(() => expect(answers).toHaveLength(2))
    await act(async () => {
      answers[1](rowWith("Open", 3))
      expect(await open).toBe(true)
    })
    expect(onSaved).toHaveBeenCalledTimes(1)
    expect(onSaved).toHaveBeenCalledWith(rowWith("Open", 3))
  })

  // A failed save read every row held (up to 10,000) to learn whether one went.
  it("asks for the row alone after a failed save, and for the table when the row is gone", async () => {
    const onChange = vi.fn()
    const rows = [rowWith("Open")]
    const { result } = renderHook(() => useCellCommit({ tableId: "t", rows, onChange }))
    patch.mockRejectedValueOnce({ response: { status: 500 } })
    await act(() => result.current.commitCell(rows[0], "status", "Won"))
    expect(onChange).toHaveBeenLastCalledWith("r1")
    patch.mockRejectedValueOnce({ response: { status: 404 } })
    await act(() => result.current.commitCell(rows[0], "status", "Lost"))
    expect(onChange).toHaveBeenLastCalledWith(undefined)
  })
})

// V-170: a reader who may only view the table writes nothing from any surface
// that saves through here, and a save the server refuses as a viewer's (403,
// read_only) reads the table again, which shows the reader's level as it now is.
describe("a reader who may only view the table (V-170)", () => {
  it("saves nothing and shows no edit when the page says its reader may only view", async () => {
    const onChange = vi.fn()
    const rows = [rowWith("Open")]
    const { result } = renderHook(() => useCellCommit({ tableId: "t", rows, onChange, canEdit: false }))
    let saved: boolean | undefined
    await act(async () => {
      saved = await result.current.commitCell(rows[0], "status", "Won")
    })
    expect(saved).toBe(false)
    expect(patch).not.toHaveBeenCalled()
    expect(result.current.edits.get("r1")).toBeUndefined()
    expect(onChange).not.toHaveBeenCalled()
  })

  // CR-164 S1: only a 403 that says read_only is a viewer's; any other reads the row alone.
  it("reads the table again after a save refused as a viewer's, and the row alone after any other 403", async () => {
    const onChange = vi.fn()
    const rows = [rowWith("Open")]
    const { result } = renderHook(() => useCellCommit({ tableId: "t", rows, onChange }))
    patch.mockRejectedValueOnce({ response: { status: 403, data: { read_only: true } } })
    await act(() => result.current.commitCell(rows[0], "status", "Won"))
    expect(onChange).toHaveBeenLastCalledWith(undefined)
    patch.mockRejectedValueOnce({ response: { status: 403, data: { error: "forbidden" } } })
    await act(() => result.current.commitCell(rows[0], "status", "Lost"))
    expect(onChange).toHaveBeenLastCalledWith("r1")
  })
})

// REGRESSION-HUNT-1 (26 Oct): a cell left at rest drew its row's copy, so an
// edit showed the old value until its save answered (2.6 s on a slow line).
describe("what a row's cells show while an edit saves", () => {
  it("shows an edit at once as saving, then as saved until the row is read again", async () => {
    let answer: (row: unknown) => void = () => {}
    patch.mockImplementation(() => new Promise((resolve) => (answer = resolve)))
    let rows = [rowWith("Open")]
    const { result, rerender } = renderHook(() => useCellCommit({ tableId: "t", rows, onChange: vi.fn() }))
    let saving: Promise<boolean> = Promise.resolve(false)
    act(() => {
      saving = result.current.commitCell(rows[0], "status", "Won")
    })
    expect(result.current.edits.get("r1")?.saving).toEqual({ status: "Won" })
    expect(shownValues(rows[0], result.current.edits.get("r1"))).toEqual({ status: "Won" })
    await act(async () => {
      answer({})
      await saving
    })
    expect(result.current.edits.get("r1")?.saving).toEqual({})
    expect(shownValues(rows[0], result.current.edits.get("r1"))).toEqual({ status: "Won" })
    // Read again, the row's copy is what its cells show.
    rows = [rowWith("Won", 2)]
    rerender()
    expect(result.current.edits.get("r1")).toBeUndefined()
  })

  it("drops an edit whose save fails, so its cell shows the copy again", async () => {
    let fail: (e: Error) => void = () => {}
    patch.mockImplementation(() => new Promise((_, reject) => (fail = reject)))
    const rows = [rowWith("Open")]
    const onChange = vi.fn()
    const { result } = renderHook(() => useCellCommit({ tableId: "t", rows, onChange }))
    let saving: Promise<boolean> = Promise.resolve(true)
    act(() => {
      saving = result.current.commitCell(rows[0], "status", "Won")
    })
    expect(shownValues(rows[0], result.current.edits.get("r1"))).toEqual({ status: "Won" })
    await act(async () => {
      fail(new Error("refused"))
      expect(await saving).toBe(false)
    })
    expect(result.current.edits.get("r1")).toBeUndefined()
    expect(shownValues(rows[0], result.current.edits.get("r1"))).toEqual({ status: "Open" })
    expect(onChange).toHaveBeenCalledWith("r1")
  })
})

// V-360 (DB-93's airtable-04 probes, 2 Nov): a fill or a paste showed nothing
// until its batch answered (0.8-1.9 s on LIVE, over 20 s in a stall), and a
// Ctrl+Z pressed meanwhile took back the edit BEFORE it. A range's write now
// goes through this one record of edits, as a cell's does, and every write
// enters the table's undo order when it is made.
describe("a write of many cells at once (V-360)", () => {
  const rowOf = (id: string, status: string): TableRow => ({ id, table_id: "t", position: 0, created_at: "", updated_at: "1", values: JSON.stringify({ status }) })
  const two = () => [rowOf("r1", "Open"), rowOf("r2", "Open")]
  const answer = (over: Partial<BatchResult> = {}): BatchResult => ({ change_set: "c1", created: [], updated: [], deleted: [], ...over })
  function heldBatch() {
    let answerWith!: (r: BatchResult) => void
    let refuse!: (e: unknown) => void
    const p = new Promise<BatchResult>((res, rej) => {
      answerWith = res
      refuse = rej
    })
    return { send: vi.fn(() => p), answer: answerWith, refuse }
  }
  const settle = () => new Promise((r) => setTimeout(r, 0))

  it("shows every cell at once as saving, and keeps them over their copies once the batch is saved", async () => {
    const rows = two()
    const { result } = renderHook(() => useCellCommit({ tableId: "t", rows, onChange: vi.fn() }))
    const batch = heldBatch()
    let done: Promise<unknown> = Promise.resolve()
    act(() => {
      done = writeCells(result.current.cells, { what: "fill", cells: rows.map((row) => ({ row, values: { status: "Won" } })), send: batch.send })
    })
    expect(result.current.edits.get("r1")?.saving, "shown before any answer").toEqual({ status: "Won" })
    expect(shownValues(rows[1], result.current.edits.get("r2"))).toEqual({ status: "Won" })
    await act(async () => {
      batch.answer(answer())
      await done
    })
    expect(result.current.edits.get("r1")?.saving).toEqual({})
    expect(result.current.edits.get("r1")?.saved).toEqual({ status: "Won" })
    expect(shownValues(rows[1], result.current.edits.get("r2"))).toEqual({ status: "Won" })
  })

  it("puts every cell back to its copy when the batch is refused, and rejects with the refusal for the caller to say", async () => {
    const rows = two()
    const { result } = renderHook(() => useCellCommit({ tableId: "t", rows, onChange: vi.fn() }))
    const batch = heldBatch()
    let done: Promise<unknown> = Promise.resolve()
    act(() => {
      done = writeCells(result.current.cells, { what: "paste", cells: rows.map((row) => ({ row, values: { status: "Won" } })), send: batch.send })
    })
    expect(shownValues(rows[0], result.current.edits.get("r1")), "shown while on its way").toEqual({ status: "Won" })
    const refusal = new Error("2 rows can't be written")
    await act(async () => {
      batch.refuse(refusal)
      await expect(done).rejects.toBe(refusal)
    })
    expect(result.current.edits.get("r1")).toBeUndefined()
    expect(shownValues(rows[1], result.current.edits.get("r2"))).toEqual({ status: "Open" })
  })

  it("shows the rows a paste adds at once, and keeps them until the rows the answer made are held", async () => {
    let rows = [rowOf("r1", "Open")]
    const { result, rerender } = renderHook(() => useCellCommit({ tableId: "t", rows, onChange: vi.fn() }))
    const batch = heldBatch()
    let done: Promise<unknown> = Promise.resolve()
    act(() => {
      done = writeCells(result.current.cells, { what: "paste", cells: [{ row: rows[0], values: { status: "A" } }], adding: [{ status: "B" }, { status: "C" }], send: batch.send })
    })
    expect(result.current.adding.map((a) => a.values), "shown before any answer").toEqual([{ status: "B" }, { status: "C" }])
    const made = [rowOf("n1", "B"), rowOf("n2", "C")]
    await act(async () => {
      batch.answer(answer({ created: made }))
      await done
    })
    expect(result.current.adding, "kept until the new rows are read").toHaveLength(2)
    rows = [rows[0], ...made]
    rerender()
    expect(result.current.adding).toHaveLength(0)
  })

  it("drops the rows a paste adds when its batch is refused", async () => {
    const rows = [rowOf("r1", "Open")]
    const { result } = renderHook(() => useCellCommit({ tableId: "t", rows, onChange: vi.fn() }))
    const batch = heldBatch()
    let done: Promise<unknown> = Promise.resolve()
    act(() => {
      done = writeCells(result.current.cells, { what: "paste", cells: [], adding: [{ status: "B" }], send: batch.send })
    })
    expect(result.current.adding).toHaveLength(1)
    await act(async () => {
      batch.refuse(new Error("refused"))
      await done.catch(() => undefined)
    })
    expect(result.current.adding).toHaveLength(0)
  })

  it("waits for the edits on their way to its rows, and an edit made after it waits for it: the last one made is kept", async () => {
    const rows = two()
    let firstSaved: (v: unknown) => void = () => {}
    patch.mockImplementationOnce(() => new Promise((res) => (firstSaved = res)))
    patch.mockResolvedValue({})
    const { result } = renderHook(() => useCellCommit({ tableId: "t", rows, onChange: vi.fn() }))
    act(() => void result.current.commitCell(rows[0], "status", "Lost"))
    const batch = heldBatch()
    let done: Promise<unknown> = Promise.resolve()
    act(() => {
      done = writeCells(result.current.cells, { what: "fill", cells: rows.map((row) => ({ row, values: { status: "Won" } })), send: batch.send })
    })
    act(() => void result.current.commitCell(rows[1], "status", "Draft"))
    await act(settle)
    expect(batch.send, "the batch waits for r1's edit").not.toHaveBeenCalled()
    expect(patch, "r2's edit, made after the batch, waits for it").toHaveBeenCalledTimes(1)
    await act(async () => {
      firstSaved({})
      await settle()
    })
    expect(batch.send).toHaveBeenCalledTimes(1)
    expect(patch).toHaveBeenCalledTimes(1)
    await act(async () => {
      batch.answer(answer())
      await done
      await settle()
    })
    expect(patch).toHaveBeenCalledTimes(2)
    expect(patch).toHaveBeenLastCalledWith("t", "r2", { status: "Draft" })
  })

  it("an Undo pressed while the batch is on its way takes THAT batch: its cells go back at once, its answer saves nothing, then its change set is taken back", async () => {
    const rows = two()
    const { result } = renderHook(() => useCellCommit({ tableId: "t", rows, onChange: vi.fn() }))
    const batch = heldBatch()
    let done: Promise<unknown> = Promise.resolve()
    act(() => {
      done = writeCells(result.current.cells, { what: "fill", cells: rows.map((row) => ({ row, values: { status: "Won" } })), send: batch.send })
    })
    const aims: Aim[] = []
    let undone: Promise<unknown> = Promise.resolve()
    act(() => {
      undone = result.current.press(async (aim) => void aims.push(aim))
    })
    expect(aims, "nothing is taken back before the batch answers").toEqual([])
    expect(result.current.edits.get("r1"), "its cells go back to their copies at the press").toBeUndefined()
    await act(async () => {
      batch.answer(answer({ change_set: "c7" }))
      await done
      await undone
    })
    expect(aims).toEqual([{ kind: "set", set: "c7" }])
    await expect(done).resolves.toMatchObject({ undone: true })
    expect(result.current.edits.get("r1"), "the answer saves nothing over the copy").toBeUndefined()
  })

  it("an Undo pressed while a cell's edit is on its way takes that edit, never the change before it", async () => {
    let saved: (v: unknown) => void = () => {}
    patch.mockImplementation(() => new Promise((res) => (saved = res)))
    const rows = [rowOf("r1", "Open")]
    const { result } = renderHook(() => useCellCommit({ tableId: "t", rows, onChange: vi.fn() }))
    act(() => void result.current.commitCell(rows[0], "status", "Zeta"))
    const aims: Aim[] = []
    let undone: Promise<unknown> = Promise.resolve()
    act(() => {
      undone = result.current.press(async (aim) => void aims.push(aim))
    })
    expect(aims, "the server's latest isn't asked for while the edit is on its way").toEqual([])
    expect(result.current.edits.get("r1")).toBeUndefined()
    await act(async () => {
      saved({})
      await undone
    })
    expect(aims).toEqual([{ kind: "latest" }])
  })
})

// CR-190's MUST 1 (a), main's ruling 3 Nov 01:0x: every row write's answer names the change set it stored, and an
// Undo pressed while writes are on their way takes the last one made BY THAT SET. inOrder orders each row alone, so
// edits to two rows can land out of order, and the server's latest is the last to LAND (CR-190's probe F1).
describe("an Undo on its way, by the change set each write's answer names (V-360)", () => {
  const rowOf = (id: string, status = "Open"): TableRow => ({ id, table_id: "t", position: 0, created_at: "", updated_at: "1", values: JSON.stringify({ status }) })
  const settle = () => new Promise((r) => setTimeout(r, 0))
  /** Each row's patch, held until the test lands it with an answer. */
  function heldPatches() {
    const land: Record<string, (answer: unknown) => void> = {}
    patch.mockImplementation((_t: string, id: string) => new Promise((res) => (land[id] = res)))
    return land
  }
  /** A Ctrl+Z pressed now (the page's press), recording what it was asked to take back. */
  function pressNow(result: { current: CellCommit }) {
    const aims: Aim[] = []
    let undone: Promise<unknown> = Promise.resolve()
    act(() => {
      undone = result.current.press(async (aim) => void aims.push(aim))
    })
    return { aims, undone: () => undone }
  }

  it("takes the edit made last when edits to two rows land out of order: B by its own change set, never A, the last to land", async () => {
    const land = heldPatches()
    const rows = [rowOf("r1"), rowOf("r2")]
    const { result } = renderHook(() => useCellCommit({ tableId: "t", rows, onChange: vi.fn() }))
    act(() => void result.current.commitCell(rows[0], "status", "A"))
    act(() => void result.current.commitCell(rows[1], "status", "B"))
    const p = pressNow(result)
    await act(async () => {
      land.r2({ ...rows[1], change_set: "cB" })
      await settle()
      land.r1({ ...rows[0], change_set: "cA" })
      await p.undone()
    })
    expect(p.aims, "the Undo takes B, the edit made last and on its way at the press").toEqual([{ kind: "set", set: "cB" }])
  })

  it("says an edit the server stored nothing for (its answer's change set is null) changed nothing, and takes back nothing: never the change before it", async () => {
    const land = heldPatches()
    const rows = [rowOf("r1")]
    const { result } = renderHook(() => useCellCommit({ tableId: "t", rows, onChange: vi.fn() }))
    act(() => void result.current.commitCell(rows[0], "status", "Won"))
    const p = pressNow(result)
    await act(async () => {
      land.r1({ ...rows[0], change_set: null })
      await p.undone()
    })
    expect(p.aims).toEqual([{ kind: "none", what: "edit" }])
  })

  // CR-190's MUST 4 (E2): the answer to an edit an Undo took on its way saves nothing, even one naming its row, or it
  // would put the edit back over the row the Undo restores.
  it("puts nothing back from the answer to an edit an Undo took on its way, even an answer naming its row and change set", async () => {
    const land = heldPatches()
    const rows = [rowOf("r1")]
    const onSaved = vi.fn()
    const { result } = renderHook(() => useCellCommit({ tableId: "t", rows, onChange: vi.fn(), onSaved }))
    let kept: Promise<boolean> = Promise.resolve(false)
    act(() => {
      kept = result.current.commitCell(rows[0], "status", "Zeta")
    })
    const p = pressNow(result)
    expect(result.current.edits.get("r1"), "the taken edit's cell goes back at once").toBeUndefined()
    await act(async () => {
      land.r1({ ...rows[0], values: JSON.stringify({ status: "Zeta" }), change_set: "c3" })
      await p.undone()
      await kept
    })
    expect(p.aims, "the Undo takes the edit by the change set its answer names").toEqual([{ kind: "set", set: "c3" }])
    expect(onSaved, "the taken edit's answer is never put back").not.toHaveBeenCalled()
    expect(result.current.edits.get("r1")).toBeUndefined()
  })

  // CR-190's MUST 3 (main's invariant 4, named Undos run in turn): a toast's Undo is the one path (undo), so it runs
  // after a Ctrl+Z press already waiting and after the writes made before it, and takes none of them on its way.
  it("runs a toast's Undo after a Ctrl+Z press waiting before it and the writes made before it, taking none of them; an edit or a batch made during the press waits for it", async () => {
    const land = heldPatches()
    undoChange.mockResolvedValue({})
    const rows = [rowOf("r1"), rowOf("r2")]
    const { result } = renderHook(() => useCellCommit({ tableId: "t", rows, onChange: vi.fn() }))
    // A Ctrl+Z press whose run is still going.
    let finish!: () => void
    act(() => void result.current.press(() => new Promise<void>((res) => (finish = res))))
    // An edit and a batch made now: each waits for that press.
    act(() => void result.current.commitCell(rows[0], "status", "Won"))
    const batch = vi.fn(async (): Promise<BatchResult> => ({ change_set: "c5", created: [], updated: [], deleted: [] }))
    let wrote: Promise<unknown> = Promise.resolve()
    act(() => {
      wrote = writeCells(result.current.cells, { what: "fill", cells: [{ row: rows[1], values: { status: "Won" } }], send: batch })
    })
    // The toast's Undo, clicked now.
    let toastUndo: Promise<unknown> = Promise.resolve()
    act(() => {
      toastUndo = result.current.undo("c9")
    })
    // Long enough for the ledger's lazy import to land: an Undo run outside the order would have reached the server.
    await act(async () => {
      await ledger()
      await settle()
    })
    expect(patch, "an edit made during a press waits for it").not.toHaveBeenCalled()
    expect(batch, "a batch made during a press waits for it").not.toHaveBeenCalled()
    expect(undoChange, "the toast's Undo waits for the press before it").not.toHaveBeenCalled()
    expect(result.current.edits.get("r1")?.saving, "the toast's Undo takes no edit on its way").toEqual({ status: "Won" })
    expect(result.current.edits.get("r2")?.saving, "nor a batch").toEqual({ status: "Won" })
    await act(async () => {
      finish()
      await settle()
      await ledger()
      await settle()
    })
    expect(patch).toHaveBeenCalledTimes(1)
    expect(batch).toHaveBeenCalledTimes(1)
    expect(undoChange, "it waits for the writes made before it too").not.toHaveBeenCalled()
    await act(async () => {
      land.r1({ ...rows[0], change_set: "c3" })
      await wrote
      await toastUndo
    })
    expect(undoChange).toHaveBeenCalledTimes(1)
    expect(undoChange).toHaveBeenCalledWith("t", "c9")
  })

  it("takes a link change on its way by the change set its answer names", async () => {
    let landLinks!: (answer: unknown) => void
    links.mockImplementation(() => new Promise((res) => (landLinks = res)))
    const rows = [rowOf("r1")]
    const onChange = vi.fn()
    const { result } = renderHook(() => useCellCommit({ tableId: "t", rows, onChange }))
    let linked: Promise<unknown> = Promise.resolve()
    act(() => {
      linked = result.current.linkCell("r1", "owner", { add: ["p1"] })
    })
    const p = pressNow(result)
    await act(settle)
    expect(p.aims, "nothing is taken back while the link change is on its way").toEqual([])
    await act(async () => {
      landLinks({ ...rows[0], change_set: "c6" })
      await linked
      await p.undone()
    })
    expect(links).toHaveBeenCalledWith("t", "r1", "owner", { add: ["p1"] })
    expect(p.aims).toEqual([{ kind: "set", set: "c6" }])
  })
})
