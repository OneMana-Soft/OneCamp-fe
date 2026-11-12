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
const offerRetry = vi.hoisted(() => vi.fn())
// offerRetry hands back its toast, as the real one does (keep resolves to it).
vi.mock("@/components/ui/undoToast", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components/ui/undoToast")>()),
  offerRetry: (...a: unknown[]) => offerRetry(...a) ?? { dismiss: () => undefined },
}))

import { ledger, shownValues, useCellCommit, type CellCommit } from "@/lib/tables/useCellCommit"
import { writeCells } from "@/lib/tables/cellsWrite"
import type { Aim } from "@/lib/tables/undoOrder"
import type { BatchResult } from "@/lib/tables/ledger"
import { wasSaid } from "@/lib/http/writeSaid"

const rowWith = (status: string, version = 1): TableRow => ({ id: "r1", table_id: "t", position: 0, created_at: "", updated_at: String(version), values: JSON.stringify({ status }) })

afterEach(() => {
  cleanup()
  patch.mockReset()
  links.mockReset()
  undoChange.mockReset()
  offerRetry.mockReset()
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

// V-583 (main's ruling 1): a cell's save the server couldn't store (Postgres
// out of space, any store failure) answers 503, the server's to try again;
// nothing of it was written. It dropped the edit like a refusal, so the
// person's change was lost. It is kept, shown as not saved, and offered back:
// sent again only when the person asks (Retry, or an edit to that cell).
describe("a cell's save the server asks to try again (503, V-583)", () => {
  const retryLater = () =>
    Object.assign(new Error("Request failed with status code 503"), {
      isAxiosError: true,
      response: { status: 503, data: { msg: "The table couldn't be read or changed just now. Try again in a moment." } },
    })

  it("keeps the edit, sends it once, says it with Retry, and saves it on Retry", async () => {
    const refused = retryLater()
    patch.mockRejectedValueOnce(refused).mockResolvedValueOnce(rowWith("Won", 2))
    const rows = [rowWith("Open")]
    const onChange = vi.fn()
    const { result } = renderHook(() => useCellCommit({ tableId: "t", rows, onChange }))
    await act(async () => {
      expect(await result.current.commitCell(rows[0], "status", "Won")).toBe(false)
    })
    expect(result.current.edits.get("r1")?.unsaved).toEqual({ status: "Won" })
    expect(shownValues(rows[0], result.current.edits.get("r1"))).toEqual({ status: "Won" })
    // Said once, here, with Retry: the interceptor's own toast stays quiet.
    expect(wasSaid(refused)).toBe(true)
    await waitFor(() => expect(offerRetry).toHaveBeenCalledTimes(1))
    const [title, description, retry] = offerRetry.mock.calls[0] as [string, string, () => Promise<boolean>]
    expect(title).toBe("Not saved")
    expect(description).toMatch(/Try again in a moment/)
    // Never sent again by itself.
    await act(() => new Promise((r) => setTimeout(r, 50)))
    expect(patch).toHaveBeenCalledTimes(1)
    await act(async () => {
      expect(await retry()).toBe(true)
    })
    expect(patch).toHaveBeenCalledTimes(2)
    expect(patch).toHaveBeenLastCalledWith("t", "r1", { status: "Won" })
    expect(result.current.edits.get("r1")?.unsaved).toEqual({})
    expect(shownValues(rows[0], result.current.edits.get("r1"))).toEqual({ status: "Won" })
  })

  it("lets a later edit to the cell take the kept one's place, and sends only that", async () => {
    patch.mockRejectedValueOnce(retryLater()).mockResolvedValueOnce({})
    const rows = [rowWith("Open")]
    const { result } = renderHook(() => useCellCommit({ tableId: "t", rows, onChange: vi.fn() }))
    await act(() => result.current.commitCell(rows[0], "status", "Won"))
    await act(() => result.current.commitCell(rows[0], "status", "Lost"))
    expect(patch).toHaveBeenCalledTimes(2)
    expect(patch).toHaveBeenLastCalledWith("t", "r1", { status: "Lost" })
    expect(result.current.edits.get("r1")?.unsaved).toEqual({})
    expect(shownValues(rows[0], result.current.edits.get("r1"))).toEqual({ status: "Lost" })
    // The first toast's Retry, pressed late, sends nothing: the cell holds the later edit.
    await waitFor(() => expect(offerRetry).toHaveBeenCalledTimes(1))
    const retry = offerRetry.mock.calls[0][2] as () => Promise<boolean>
    await act(async () => {
      await retry()
    })
    expect(patch).toHaveBeenCalledTimes(2)
  })

  it("forgets a kept edit once the row's copy shows it", async () => {
    patch.mockRejectedValueOnce(retryLater())
    let rows = [rowWith("Open")]
    const { result, rerender } = renderHook(() => useCellCommit({ tableId: "t", rows, onChange: vi.fn() }))
    await act(() => result.current.commitCell(rows[0], "status", "Won"))
    rows = [rowWith("Won", 2)]
    rerender()
    expect(result.current.edits.get("r1")).toBeUndefined()
  })

  it("lets go of a kept edit once its reader may only view the table (V-170)", async () => {
    patch.mockRejectedValueOnce(retryLater())
    const rows = [rowWith("Open")]
    let canEdit = true
    const { result, rerender } = renderHook(() => useCellCommit({ tableId: "t", rows, onChange: vi.fn(), canEdit }))
    await act(() => result.current.commitCell(rows[0], "status", "Won"))
    expect(result.current.edits.get("r1")?.unsaved).toEqual({ status: "Won" })
    canEdit = false
    rerender()
    expect(result.current.edits.get("r1")).toBeUndefined()
    expect(shownValues(rows[0], result.current.edits.get("r1"))).toEqual({ status: "Open" })
  })

  it("still drops an edit any other failure refused (500), and offers no Retry", async () => {
    patch.mockRejectedValueOnce(Object.assign(new Error("Request failed with status code 500"), { isAxiosError: true, response: { status: 500, data: {} } }))
    const rows = [rowWith("Open")]
    const { result } = renderHook(() => useCellCommit({ tableId: "t", rows, onChange: vi.fn() }))
    await act(() => result.current.commitCell(rows[0], "status", "Won"))
    expect(result.current.edits.get("r1")).toBeUndefined()
    await act(() => new Promise((r) => setTimeout(r, 20)))
    expect(offerRetry).not.toHaveBeenCalled()
  })

  // V-640 (the LIVE walk, 6 Nov): once the toast had closed, nothing could
  // send the kept edit again; the same value entered again was no change.
  // The cell's mark and the same value entered again are Retries too, all
  // through the toast's one retry (retryCell), only when the person asks.
  it("sends the kept edit on the cell's Retry, as the toast's would, once, and nothing by itself", async () => {
    patch.mockRejectedValueOnce(retryLater()).mockResolvedValueOnce(rowWith("Won", 2))
    const rows = [rowWith("Open")]
    const { result } = renderHook(() => useCellCommit({ tableId: "t", rows, onChange: vi.fn() }))
    await act(() => result.current.commitCell(rows[0], "status", "Won"))
    await act(() => new Promise((r) => setTimeout(r, 50)))
    expect(patch).toHaveBeenCalledTimes(1)
    await act(async () => {
      expect(await result.current.retryCell(rows[0], "status")).toBe(true)
    })
    expect(patch).toHaveBeenCalledTimes(2)
    expect(patch).toHaveBeenLastCalledWith("t", "r1", { status: "Won" })
    expect(result.current.edits.get("r1")?.unsaved).toEqual({})
    // Nothing is kept now: the cell's Retry again, or the toast's, sends nothing.
    await waitFor(() => expect(offerRetry).toHaveBeenCalledTimes(1))
    await act(async () => {
      await result.current.retryCell(rows[0], "status")
      await (offerRetry.mock.calls[0][2] as () => Promise<boolean>)()
    })
    expect(patch).toHaveBeenCalledTimes(2)
  })

  it("sends the same value entered again as its Retry, and keeps it again when that is refused too", async () => {
    patch.mockRejectedValueOnce(retryLater()).mockRejectedValueOnce(retryLater()).mockResolvedValueOnce(rowWith("Won", 2))
    const rows = [rowWith("Open")]
    const { result } = renderHook(() => useCellCommit({ tableId: "t", rows, onChange: vi.fn() }))
    await act(() => result.current.commitCell(rows[0], "status", "Won"))
    await act(() => result.current.commitCell(rows[0], "status", "Won"))
    expect(patch).toHaveBeenCalledTimes(2)
    expect(result.current.edits.get("r1")?.unsaved).toEqual({ status: "Won" })
    await act(() => result.current.retryCell(rows[0], "status"))
    expect(patch).toHaveBeenCalledTimes(3)
    expect(patch).toHaveBeenLastCalledWith("t", "r1", { status: "Won" })
    expect(result.current.edits.get("r1")?.unsaved).toEqual({})
  })

  it("sends nothing on the cell's Retry once the cell holds another edit, nor for a reader who may only view (V-170)", async () => {
    patch.mockRejectedValueOnce(retryLater()).mockResolvedValueOnce({}).mockRejectedValueOnce(retryLater())
    const rows = [rowWith("Open")]
    let canEdit = true
    const { result, rerender } = renderHook(() => useCellCommit({ tableId: "t", rows, onChange: vi.fn(), canEdit }))
    await act(() => result.current.commitCell(rows[0], "status", "Won"))
    await act(() => result.current.commitCell(rows[0], "status", "Lost"))
    await act(() => result.current.retryCell(rows[0], "status"))
    expect(patch).toHaveBeenCalledTimes(2)
    expect(patch).toHaveBeenLastCalledWith("t", "r1", { status: "Lost" })
    await act(() => result.current.commitCell(rows[0], "status", "Tied"))
    expect(result.current.edits.get("r1")?.unsaved).toEqual({ status: "Tied" })
    canEdit = false
    rerender()
    await act(() => result.current.retryCell(rows[0], "status"))
    expect(patch).toHaveBeenCalledTimes(3)
  })

  // CR-229's T3: a toast's Retry offers the value it was raised for; once the cell keeps a newer refused edit, that
  // stale Retry sends nothing (the newer one has its own toast and mark).
  it("sends nothing on a stale toast's Retry once the cell keeps a newer refused edit", async () => {
    patch.mockRejectedValueOnce(retryLater()).mockRejectedValueOnce(retryLater())
    const rows = [rowWith("Open")]
    const { result } = renderHook(() => useCellCommit({ tableId: "t", rows, onChange: vi.fn() }))
    await act(() => result.current.commitCell(rows[0], "status", "Won"))
    await act(() => result.current.commitCell(rows[0], "status", "Lost"))
    expect(patch).toHaveBeenCalledTimes(2)
    expect(result.current.edits.get("r1")?.unsaved).toEqual({ status: "Lost" })
    await waitFor(() => expect(offerRetry).toHaveBeenCalledTimes(2))
    await act(async () => {
      await (offerRetry.mock.calls[0][2] as () => Promise<boolean>)()
    })
    expect(patch).toHaveBeenCalledTimes(2)
    expect(result.current.edits.get("r1")?.unsaved).toEqual({ status: "Lost" })
  })

  // CR-229's T4: a Retry for a field the row doesn't keep (another field of it is kept) sends nothing, never an
  // empty value for that field.
  it("sends nothing on a Retry for a field its row doesn't keep while it keeps another", async () => {
    patch.mockRejectedValueOnce(retryLater())
    const rows = [{ ...rowWith("Open"), values: JSON.stringify({ status: "Open", owner: "Ana" }) }]
    const { result } = renderHook(() => useCellCommit({ tableId: "t", rows, onChange: vi.fn() }))
    await act(() => result.current.commitCell(rows[0], "status", "Won"))
    expect(result.current.edits.get("r1")?.unsaved).toEqual({ status: "Won" })
    await act(() => result.current.retryCell(rows[0], "owner"))
    expect(patch).toHaveBeenCalledTimes(1)
    expect(result.current.edits.get("r1")?.unsaved).toEqual({ status: "Won" })
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

// V-617: a range's write (a paste, a fill) the server couldn't store answers
// 503 since backend b235, nothing of it written. writeCells dropped its cells
// like any refusal, so a paste refused for space vanished and read as the
// person's mistake. Its cells are kept as a cell's save is (V-583): marked,
// said once with Retry for the whole write, sent again only when the person
// presses it, as one range write of the cells still kept.
describe("a range write the server asks to try again (503, V-617)", () => {
  const rowOf = (id: string, status: string): TableRow => ({ id, table_id: "t", position: 0, created_at: "", updated_at: "1", values: JSON.stringify({ status }) })
  const two = () => [rowOf("r1", "Open"), rowOf("r2", "Open")]
  const answer = (): BatchResult => ({ change_set: "c2", created: [], updated: [], deleted: [] })
  const retryLater = (msg?: string) =>
    Object.assign(new Error("Request failed with status code 503"), { isAxiosError: true, response: { status: 503, data: msg ? { msg } : {} } })
  type Cells = Parameters<typeof writeCells>[1]["cells"]
  afterEach(() => {
    vi.useRealTimers()
  })

  // The write, refused 503; `again` as the range's Retry: one write of the cells it's given through writeCells.
  async function refused(rows: TableRow[], over: { adding?: Record<string, unknown>[]; canEdit?: () => boolean; msg?: string } = {}) {
    vi.useFakeTimers()
    const err = retryLater(over.msg)
    const send = vi.fn(() => Promise.reject(err))
    const resend = vi.fn(() => Promise.resolve(answer()))
    const hook = renderHook(() => useCellCommit({ tableId: "t", rows, onChange: vi.fn(), canEdit: over.canEdit?.() ?? true }))
    const again = vi.fn((cells: Cells, adds: boolean) => writeCells(hook.result.current.cells, { what: "paste", cells, adding: adds ? over.adding : undefined, send: resend }))
    await act(async () => {
      await expect(
        writeCells(hook.result.current.cells, { what: "paste", cells: rows.map((row) => ({ row, values: { status: "Won" } })), adding: over.adding, send, again }),
      ).rejects.toBe(err)
    })
    await vi.waitFor(() => expect(offerRetry).toHaveBeenCalledTimes(1))
    // Never sent again by itself: ten seconds on, still the one batch.
    await act(() => vi.advanceTimersByTimeAsync(10_000))
    expect(send).toHaveBeenCalledTimes(1)
    expect(resend).not.toHaveBeenCalled()
    expect(again).not.toHaveBeenCalled()
    const [title, description, retry] = offerRetry.mock.calls[0] as [string, string, () => Promise<unknown>]
    return { ...hook, err, send, resend, again, title, description, retry }
  }

  it("keeps every cell marked, says it once with Retry, sends nothing by itself, and Retry sends the kept cells once as one write", async () => {
    const rows = two()
    const { result, err, resend, again, title, description, retry } = await refused(rows)
    expect(result.current.edits.get("r1")?.unsaved).toEqual({ status: "Won" })
    expect(result.current.edits.get("r2")?.unsaved).toEqual({ status: "Won" })
    expect(shownValues(rows[1], result.current.edits.get("r2"))).toEqual({ status: "Won" })
    // Said here, once for the whole write: the interceptor's toast and the caller's stay quiet.
    expect(wasSaid(err)).toBe(true)
    expect(title).toBe("Not saved")
    expect(description).toMatch(/Try again in a moment/)
    await act(async () => {
      await retry()
    })
    expect(again).toHaveBeenCalledTimes(1)
    expect(again.mock.calls[0][0].map((c) => [c.row.id, c.values])).toEqual([
      ["r1", { status: "Won" }],
      ["r2", { status: "Won" }],
    ])
    expect(resend).toHaveBeenCalledTimes(1)
    expect(result.current.edits.get("r1")?.unsaved).toEqual({})
    expect(result.current.edits.get("r2")?.saved).toEqual({ status: "Won" })
    // A second press finds nothing kept: nothing more is sent.
    await act(async () => {
      await retry()
    })
    expect(resend).toHaveBeenCalledTimes(1)
  })

  it("sends on Retry only the cells still kept: one edited since is sent no more", async () => {
    const rows = two()
    const { result, again, resend, retry } = await refused(rows)
    patch.mockResolvedValueOnce({})
    await act(() => result.current.commitCell(rows[0], "status", "Lost"))
    expect(result.current.edits.get("r1")?.unsaved).toEqual({})
    await act(async () => {
      await retry()
    })
    expect(again.mock.calls[0][0].map((c) => c.row.id)).toEqual(["r2"])
    expect(resend).toHaveBeenCalledTimes(1)
  })

  it("drops a paste's new rows from sight, says so, and adds them on Retry with the kept cells as one write: never a half-made row", async () => {
    const rows = [rowOf("r1", "Open")]
    const { result, again, resend, description, retry } = await refused(rows, { adding: [{ status: "B" }, { status: "C" }] })
    expect(result.current.adding).toHaveLength(0)
    expect(description).toMatch(/2 new rows weren't added/)
    await act(async () => {
      await retry()
    })
    expect(again).toHaveBeenCalledTimes(1)
    expect(again.mock.calls[0][1]).toBe(true)
    expect(resend).toHaveBeenCalledTimes(1)
    // Its new rows go once: a second press sends nothing.
    await act(async () => {
      await retry()
    })
    expect(resend).toHaveBeenCalledTimes(1)
  })

  it("sends nothing on Retry once its writer may only view the table (V-170): the kept cells are let go", async () => {
    const rows = two()
    let canEdit = true
    const { result, rerender, again, resend, retry } = await refused(rows, { adding: [{ status: "B" }], canEdit: () => canEdit })
    canEdit = false
    rerender()
    expect(result.current.edits.get("r1")).toBeUndefined()
    await act(async () => {
      await retry()
    })
    expect(again).not.toHaveBeenCalled()
    expect(resend).not.toHaveBeenCalled()
  })

  it("still puts the cells back on any other failure (500), offers no Retry, and leaves the caller to say why", async () => {
    const rows = two()
    const err = Object.assign(new Error("Request failed with status code 500"), { isAxiosError: true, response: { status: 500, data: {} } })
    const { result } = renderHook(() => useCellCommit({ tableId: "t", rows, onChange: vi.fn() }))
    await act(async () => {
      await expect(
        writeCells(result.current.cells, { what: "fill", cells: rows.map((row) => ({ row, values: { status: "Won" } })), send: () => Promise.reject(err), again: vi.fn() }),
      ).rejects.toBe(err)
    })
    expect(result.current.edits.get("r1")).toBeUndefined()
    expect(wasSaid(err)).toBe(false)
    await act(() => new Promise((r) => setTimeout(r, 20)))
    expect(offerRetry).not.toHaveBeenCalled()
  })

  // DESIGN-BUILD-129's F1a: a paste's new rows aren't drawn once refused, so
  // its toast is all that holds them. It stays until the person acts (Retry or
  // its x), with no timer; a write with no new rows keeps V-583's 8 s offer,
  // its marks holding it whole. G2: the toast's words are its count and the
  // fallback, never a longer message of the server's.
  it("keeps the offer of a write with new rows until the person acts, in two short sentences; one with none keeps the timed offer", async () => {
    const withRows = await refused([rowOf("r1", "Open")], { adding: [{ status: "B" }], msg: "The table couldn't be read or changed just now. Try again in a moment." })
    expect(offerRetry.mock.calls[0][3]).toBe(true)
    expect(withRows.description).toBe("1 new row wasn't added. Try again in a moment.")
    withRows.unmount()
    offerRetry.mockReset()
    await refused(two())
    expect(offerRetry.mock.calls[0][3]).toBeFalsy()
  })

  // F1b: once the toast has gone (its x), a mark is all that's left of the
  // write, and the paste must still land whole or not at all. Every mark of a
  // kept range write sends the whole kept write: the cells still kept and its
  // new rows, as one write; its toast goes, and nothing more is sent.
  it("sends the whole kept write from any of its marks (retryCell), with its new rows, as one write, and closes its toast", async () => {
    const dismiss = vi.fn()
    offerRetry.mockReturnValue({ dismiss })
    const rows = two()
    const { result, again, resend, retry } = await refused(rows, { adding: [{ status: "B" }] })
    await act(async () => {
      await result.current.retryCell(rows[1], "status")
    })
    expect(again).toHaveBeenCalledTimes(1)
    expect(again.mock.calls[0][0].map((c) => [c.row.id, c.values])).toEqual([
      ["r1", { status: "Won" }],
      ["r2", { status: "Won" }],
    ])
    expect(again.mock.calls[0][1]).toBe(true)
    expect(resend).toHaveBeenCalledTimes(1)
    expect(dismiss).toHaveBeenCalled()
    expect(result.current.edits.get("r1")?.unsaved).toEqual({})
    // The other mark and the toast's Retry find nothing kept: nothing more is sent.
    await act(async () => {
      await result.current.retryCell(rows[0], "status")
      await retry()
    })
    expect(resend).toHaveBeenCalledTimes(1)
  })

  // F1b: a mark says what it sends, the whole write, counted as it now is.
  it("names each mark of a kept range write for the whole write, counted as it now is", async () => {
    patch.mockResolvedValue({})
    const rows = two()
    const { result } = await refused(rows, { adding: [{ status: "B" }] })
    expect(result.current.edits.get("r1")?.named).toEqual({ status: "the paste: 2 cells and 1 new row" })
    expect(result.current.edits.get("r2")?.named).toEqual({ status: "the paste: 2 cells and 1 new row" })
    // One cell edited since leaves the write: the other mark counts one.
    await act(async () => {
      await result.current.commitCell(rows[1], "status", "Lost")
    })
    expect(result.current.edits.get("r1")?.named).toEqual({ status: "the paste: 1 cell and 1 new row" })
    expect(result.current.edits.get("r2")?.named).toBeUndefined()
  })

  // CR-241's F1 (a): a cell edited while the range write is on its way is the
  // edit's, not the write's. The 503 keeps the write's other cells only, and
  // their Retry sends only those.
  it("keeps none of a cell edited while the write was on its way: the 503 keeps the others, and Retry sends only those", async () => {
    const rows = two()
    let refuse!: (e: unknown) => void
    const send = vi.fn(() => new Promise<BatchResult>((_, rej) => (refuse = rej)))
    const resend = vi.fn(() => Promise.resolve(answer()))
    let saved!: (v: unknown) => void
    patch.mockImplementation(() => new Promise((res) => (saved = res)))
    const { result } = renderHook(() => useCellCommit({ tableId: "t", rows, onChange: vi.fn() }))
    const again = vi.fn((cells: Cells) => writeCells(result.current.cells, { what: "paste", cells, send: resend }))
    let written: Promise<unknown> = Promise.resolve()
    let edited: Promise<unknown> = Promise.resolve()
    act(() => {
      written = writeCells(result.current.cells, { what: "paste", cells: rows.map((row) => ({ row, values: { status: "Won" } })), send, again }).catch(() => undefined)
    })
    act(() => {
      edited = result.current.commitCell(rows[1], "status", "Lost")
    })
    await vi.waitFor(() => expect(send).toHaveBeenCalled())
    await act(async () => {
      refuse(retryLater())
      await written
    })
    await vi.waitFor(() => expect(offerRetry).toHaveBeenCalledTimes(1))
    expect(result.current.edits.get("r1")?.unsaved).toEqual({ status: "Won" })
    expect(result.current.edits.get("r2")?.unsaved).toEqual({})
    await vi.waitFor(() => expect(patch).toHaveBeenCalledTimes(1))
    await act(async () => {
      saved({})
      await edited
    })
    const retry = offerRetry.mock.calls[0][2] as () => Promise<unknown>
    await act(async () => {
      await retry()
    })
    expect(again).toHaveBeenCalledTimes(1)
    expect(again.mock.calls[0][0].map((c) => [c.row.id, c.values])).toEqual([["r1", { status: "Won" }]])
    expect(resend).toHaveBeenCalledTimes(1)
  })

  // CR-241's F1 (b): an Undo that took the write on its way has the last word.
  // Its 503 keeps nothing, offers no Retry, and sends nothing.
  it("keeps nothing of a write an Undo took on its way: no Retry, and nothing is sent", async () => {
    const rows = two()
    let refuse!: (e: unknown) => void
    const send = vi.fn(() => new Promise<BatchResult>((_, rej) => (refuse = rej)))
    const again = vi.fn(() => Promise.resolve())
    const { result } = renderHook(() => useCellCommit({ tableId: "t", rows, onChange: vi.fn() }))
    let written: Promise<unknown> = Promise.resolve()
    act(() => {
      written = writeCells(result.current.cells, { what: "paste", cells: rows.map((row) => ({ row, values: { status: "Won" } })), send, again }).catch(() => undefined)
    })
    act(() => {
      void result.current.press(async () => undefined)
    })
    await vi.waitFor(() => expect(send).toHaveBeenCalled())
    await act(async () => {
      refuse(retryLater())
      await written
    })
    await act(() => new Promise((r) => setTimeout(r, 20)))
    expect(offerRetry).not.toHaveBeenCalled()
    expect(result.current.edits.get("r1")).toBeUndefined()
    expect(result.current.edits.get("r2")).toBeUndefined()
    expect(again).not.toHaveBeenCalled()
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
