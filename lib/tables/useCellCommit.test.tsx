import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, renderHook } from "@testing-library/react"
import type { TableRow } from "@/services/tableService"

const patch = vi.hoisted(() => vi.fn())
vi.mock("@/services/tableService", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/tableService")>()),
  patchRow: (...a: unknown[]) => patch(...a),
}))

import { useCellCommit } from "@/lib/tables/useCellCommit"

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
