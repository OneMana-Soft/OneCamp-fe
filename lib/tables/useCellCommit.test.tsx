import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, renderHook, waitFor } from "@testing-library/react"
import type { TableRow } from "@/services/tableService"

const patch = vi.hoisted(() => vi.fn())
vi.mock("@/services/tableService", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/tableService")>()),
  patchRow: (...a: unknown[]) => patch(...a),
}))

import { shownValues, useCellCommit } from "@/lib/tables/useCellCommit"

const rowWith = (status: string, version = 1): TableRow => ({ id: "r1", table_id: "t", position: 0, created_at: "", updated_at: String(version), values: JSON.stringify({ status }) })

afterEach(() => {
  cleanup()
  patch.mockReset()
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
