import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, renderHook, waitFor } from "@testing-library/react"

const list = vi.fn()
vi.mock("@/services/tableService", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/tableService")>()),
  listTableAIFills: (...a: unknown[]) => list(...a),
}))

import { noteMyFill, useAIFills } from "@/lib/tables/useAIFills"
import { aiFillHeard } from "@/lib/tables/aiFills"
import type { AIFill } from "@/services/tableService"

const fill = (over: Partial<AIFill> = {}): AIFill => ({ id: "f1", table_id: "t", field_id: "summary", total: 1000, asked: 100, filled: 100, state: "running", change_set: "cs1", ...over })

afterEach(() => {
  cleanup()
  list.mockReset()
})

// TABLES-LEAD-26: a table's running fills, by column, kept as its topic says.
describe("useAIFills", () => {
  it("shows a running fill from the server's list, then from the topic, and drops it when it ends", async () => {
    list.mockResolvedValue([fill(), fill({ id: "old", field_id: "notes", state: "done" })])
    const { result } = renderHook(() => useAIFills("t"))
    await waitFor(() => expect(result.current.get("summary")?.asked).toBe(100))
    expect(result.current.has("notes")).toBe(false)
    act(() => aiFillHeard("t", fill({ asked: 400, filled: 398 })))
    expect(result.current.get("summary")?.asked).toBe(400)
    // A message that comes late never moves a fill back.
    act(() => aiFillHeard("t", fill({ asked: 300 })))
    expect(result.current.get("summary")?.asked).toBe(400)
    act(() => aiFillHeard("t", fill({ asked: 1000, filled: 990, state: "done" })))
    expect(result.current.has("summary")).toBe(false)
    // Nor brings back one that ended.
    act(() => aiFillHeard("t", fill({ asked: 900 })))
    expect(result.current.has("summary")).toBe(false)
  })

  it("hands a fill this tab started to onEnded once, when it ends, and no one else's", async () => {
    list.mockResolvedValue([])
    const onEnded = vi.fn()
    renderHook(() => useAIFills("t", onEnded))
    await waitFor(() => expect(list).toHaveBeenCalledWith("t"))
    noteMyFill(fill())
    act(() => aiFillHeard("t", fill({ id: "theirs", field_id: "notes", state: "done" })))
    act(() => aiFillHeard("t", fill({ asked: 500 })))
    expect(onEnded).not.toHaveBeenCalled()
    act(() => aiFillHeard("t", fill({ asked: 520, state: "stopped" })))
    act(() => aiFillHeard("t", fill({ asked: 520, state: "stopped" })))
    expect(onEnded).toHaveBeenCalledTimes(1)
    expect(onEnded).toHaveBeenCalledWith(fill({ asked: 520, state: "stopped" }))
  })

  it("drops a running fill that a later read no longer lists, as the server hides one gone stale", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      list.mockResolvedValueOnce([fill()]).mockResolvedValue([])
      const { result } = renderHook(() => useAIFills("t"))
      await waitFor(() => expect(result.current.get("summary")?.asked).toBe(100))
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10_000)
      })
      await waitFor(() => expect(result.current.has("summary")).toBe(false))
      expect(list).toHaveBeenCalledTimes(2)
    } finally {
      vi.useRealTimers()
    }
  })
})
