import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, renderHook, waitFor } from "@testing-library/react"
import type { TableBundle, TableRow } from "@/services/tableService"

// A table of `count` rows on a fake server: the bundle carries the first
// 500, the rows endpoint pages the rest, and a live message is passed in.
let count = 1200
let edited: Record<string, string> = {}
const rowAt = (i: number): TableRow => ({ id: `r${i}`, table_id: "t", position: i, created_at: "", updated_at: edited[`r${i}`] ?? "", values: JSON.stringify({ item: edited[`r${i}`] ?? `Line ${i}` }) })
const bundleNow = (): { data: TableBundle } => ({
  data: {
    table: { id: "t", name: "Big", visibility: "workspace", created_by: "", created_at: "", updated_at: "" },
    fields: [{ id: "item", table_id: "t", name: "Item", type: "text", config: "{}", position: 0 }],
    views: [],
    rows: Array.from({ length: Math.min(count, 500) }, (_, i) => rowAt(i)),
    can_manage: true,
    mqtt_topic: "table/t",
    rows_truncated: count > 500,
    row_count: count,
  },
})
let bundle = bundleNow()
// SWR's mutate: with no argument the bundle is read again; with a function,
// the cached bundle is changed in place (useTableRows' put), with no read.
const mutate = vi.fn(async (change?: (d: typeof bundle) => typeof bundle) => {
  bundle = typeof change === "function" ? change(bundle) : bundleNow()
  return bundle
})
/** How many times the whole bundle was read again. */
const refetches = () => mutate.mock.calls.filter((c) => typeof c[0] !== "function").length
const listRows = vi.fn<(t: string, offset: number, limit: number, signal?: AbortSignal) => Promise<TableRow[]>>(async (_t, offset, limit) => Array.from({ length: Math.max(0, Math.min(limit, count - offset)) }, (_, i) => rowAt(offset + i)))
const rowsByIds = vi.fn<(t: string, ids: string[]) => Promise<TableRow[]>>(async (_t, ids) => ids.map((id) => rowAt(Number(id.slice(1)))))
let heard: ((m: string) => void) | undefined

vi.mock("@/hooks/useFetch", () => ({ useFetch: () => ({ data: bundle, isLoading: false, isError: undefined, mutate }) }))
vi.mock("@/hooks/useMqttTopic", () => ({ useMqttTopic: ({ onMessage }: { onMessage: (m: string) => void }) => void (heard = onMessage) }))
vi.mock("@/services/tableService", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/tableService")>()),
  listRows: (...a: Parameters<typeof listRows>) => listRows(...a),
  rowsByIds: (...a: Parameters<typeof rowsByIds>) => rowsByIds(...a),
}))

import { ROWS_HELD_MAX, useTableRows } from "@/lib/tables/useTableRows"

beforeEach(() => {
  count = 1200
  edited = {}
  bundle = bundleNow()
})
afterEach(() => {
  cleanup()
  mutate.mockClear()
  listRows.mockClear()
  rowsByIds.mockClear()
})

const tell = (data: Record<string, unknown>) => act(() => heard?.(JSON.stringify({ type: 9, data })))

describe("the rows a table's page holds", () => {
  it("holds the bundle's first 500 and says how many there are in all", () => {
    const { result } = renderHook(() => useTableRows("t"))
    expect(result.current.rows).toHaveLength(500)
    expect(result.current.total).toBe(1200)
    expect(result.current.complete).toBe(false)
    expect(listRows).not.toHaveBeenCalled()
  })

  it("reads a page more as the grid nears the end, then the rest", async () => {
    const { result } = renderHook(() => useTableRows("t"))
    act(() => result.current.more())
    await waitFor(() => expect(result.current.rows).toHaveLength(1000))
    expect(listRows).toHaveBeenCalledWith("t", 500, 500, expect.any(AbortSignal))
    act(() => result.current.more())
    await waitFor(() => expect(result.current.complete).toBe(true))
    expect(result.current.rows.map((r) => r.id).at(-1)).toBe("r1199")
  })

  it("reads up to 10,000 for a board, a filter or a search, and past that only when asked", async () => {
    count = 10600
    bundle = bundleNow()
    const { result } = renderHook(() => useTableRows("t"))
    act(() => result.current.all())
    await waitFor(() => expect(result.current.rows).toHaveLength(ROWS_HELD_MAX))
    expect(result.current.complete).toBe(false)
    expect(result.current.capped).toBe(true)
    act(() => result.current.all(true))
    await waitFor(() => expect(result.current.complete).toBe(true))
    expect(result.current.capped).toBe(false)
    expect(result.current.rows).toHaveLength(10600)
    expect(new Set(result.current.rows.map((r) => r.id)).size).toBe(10600)
  })

  it("asks again for only the row someone changed, by its id", async () => {
    const { result } = renderHook(() => useTableRows("t"))
    act(() => result.current.more())
    await waitFor(() => expect(result.current.rows).toHaveLength(1000))
    listRows.mockClear()
    edited.r700 = "Changed elsewhere"
    tell({ action: "updated", row_id: "r700" })
    await waitFor(() => expect(result.current.rows.find((r) => r.id === "r700")?.values).toContain("Changed elsewhere"))
    expect(rowsByIds.mock.calls).toEqual([["t", ["r700"]]])
    expect(listRows).not.toHaveBeenCalled()
    expect(refetches()).toBe(0)
  })

  // FLUIDITY-LEAD, 20 Oct: a row in the bundle's page read the whole bundle
  // again, a 534 ms long task at 100,000 rows.
  it("reads a changed row in the bundle's own page alone too, and changes the bundle in place", async () => {
    const { result } = renderHook(() => useTableRows("t"))
    edited.r3 = "Changed elsewhere"
    tell({ action: "updated", row_id: "r3" })
    await waitFor(() => expect(rowsByIds.mock.calls).toEqual([["t", ["r3"]]]))
    expect(refetches()).toBe(0)
    expect(bundle.data.rows[3].values).toContain("Changed elsewhere")
    expect(result.current.rows).toHaveLength(500)
  })

  it("puts a saved row where it's held, with no read at all", async () => {
    const { result } = renderHook(() => useTableRows("t"))
    act(() => result.current.more())
    await waitFor(() => expect(result.current.rows).toHaveLength(1000))
    listRows.mockClear()
    const saved = (i: number) => ({ ...rowAt(i), updated_at: "now", values: JSON.stringify({ item: `Saved ${i}` }) })
    act(() => result.current.put([saved(3), saved(700), saved(5000)]))
    await waitFor(() => expect(result.current.rows.find((r) => r.id === "r700")?.values).toContain("Saved 700"))
    expect(bundle.data.rows[3].values).toContain("Saved 3")
    // A row not held stays unheld.
    expect(result.current.rows.find((r) => r.id === "r5000")).toBeUndefined()
    expect(refetches()).toBe(0)
    expect(listRows).not.toHaveBeenCalled()
    expect(rowsByIds).not.toHaveBeenCalled()
  })

  // A row's threads changed (business/TableComments): the row is read again
  // by its id for its comment count, whatever shows its threads is told, and
  // nothing else is read.
  it("asks again for only the row someone commented on, and tells its threads", async () => {
    const { result } = renderHook(() => useTableRows("t"))
    act(() => result.current.more())
    await waitFor(() => expect(result.current.rows).toHaveLength(1000))
    listRows.mockClear()
    const { onRowComments } = await import("@/lib/tables/rowComments")
    const told = vi.fn()
    const stop = onRowComments("r700", told)
    tell({ action: "comments", row_id: "r700", thread_id: "th1", event: "thread.created" })
    expect(told).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(rowsByIds.mock.calls).toEqual([["t", ["r700"]]]))
    expect(listRows).not.toHaveBeenCalled()
    expect(refetches()).toBe(0)
    stop()
  })

  // An AI fill moving on (TABLES-LEAD-26): each cell it writes comes as its
  // own "updated", so its progress reads nothing again; whatever shows the
  // fill's progress hears it.
  it("reads nothing again for an AI fill's progress, and tells whatever shows it", async () => {
    const { result } = renderHook(() => useTableRows("t"))
    act(() => result.current.more())
    await waitFor(() => expect(result.current.rows).toHaveLength(1000))
    listRows.mockClear()
    const { onAIFill } = await import("@/lib/tables/aiFills")
    const told = vi.fn()
    const stop = onAIFill("t", told)
    const fill = { id: "f1", table_id: "t", field_id: "summary", total: 3200, asked: 340, filled: 338, state: "running" }
    tell({ action: "ai_fill", fill })
    expect(told).toHaveBeenCalledWith(fill)
    await new Promise((r) => setTimeout(r, 400))
    expect(listRows).not.toHaveBeenCalled()
    expect(rowsByIds).not.toHaveBeenCalled()
    expect(refetches()).toBe(0)
    stop()
  })

  // A row given a page (tables T2): the row is read again by its id, for its
  // page, and nothing else.
  it("asks again for only the row someone gave a page", async () => {
    const { result } = renderHook(() => useTableRows("t"))
    act(() => result.current.more())
    await waitFor(() => expect(result.current.rows).toHaveLength(1000))
    listRows.mockClear()
    tell({ action: "page", row_id: "r700", page: "d1" })
    await waitFor(() => expect(rowsByIds.mock.calls).toEqual([["t", ["r700"]]]))
    expect(listRows).not.toHaveBeenCalled()
    expect(refetches()).toBe(0)
  })

  it("asks again for the bundle and every page held when rows go", async () => {
    const { result } = renderHook(() => useTableRows("t"))
    act(() => result.current.more())
    await waitFor(() => expect(result.current.rows).toHaveLength(1000))
    listRows.mockClear()
    tell({ action: "deleted", row_id: "r3" })
    await waitFor(() => expect(refetches()).toBe(1))
    await waitFor(() => expect(listRows).toHaveBeenCalledWith("t", 500, 500))
  })

  // The row ledger (A2): a change of many rows is one live message naming them.
  it("asks again for only the pages holding rows a change of many only changed", async () => {
    const { result } = renderHook(() => useTableRows("t"))
    act(() => result.current.more())
    await waitFor(() => expect(result.current.rows).toHaveLength(1000))
    listRows.mockClear()
    edited.r600 = "Pasted"
    edited.r650 = "Pasted"
    tell({ action: "changed", change_set: "cs", created: [], updated: ["r600", "r650"], deleted: [], restored: [] })
    await waitFor(() => expect(result.current.rows.find((r) => r.id === "r650")?.values).toContain("Pasted"))
    expect(rowsByIds.mock.calls).toEqual([["t", ["r600", "r650"]]])
    expect(listRows).not.toHaveBeenCalled()
    expect(refetches()).toBe(0)
  })

  it("asks again for everything held when a change of many made, deleted, brought back or moved rows", async () => {
    for (const change of [{ created: ["r1200"] }, { deleted: ["r3"] }, { restored: ["r3"] }, { updated: ["r3"], moved: true }, { updated: ["r3"], more: true }]) {
      const { result, unmount } = renderHook(() => useTableRows("t"))
      act(() => result.current.more())
      await waitFor(() => expect(result.current.rows).toHaveLength(1000))
      mutate.mockClear()
      listRows.mockClear()
      tell({ action: "changed", change_set: "cs", created: [], updated: [], deleted: [], restored: [], ...change })
      await waitFor(() => expect(refetches()).toBe(1))
      await waitFor(() => expect(listRows).toHaveBeenCalledWith("t", 500, 500))
      unmount()
    }
  })

  it("asks for the bundle alone when a row is added or the table renamed", async () => {
    const { result } = renderHook(() => useTableRows("t"))
    act(() => result.current.more())
    await waitFor(() => expect(result.current.rows).toHaveLength(1000))
    listRows.mockClear()
    tell({ action: "table" })
    await waitFor(() => expect(refetches()).toBe(1))
    expect(listRows).not.toHaveBeenCalled()
  })

  it("reads through to a row added here, which is the table's last", async () => {
    const { result, rerender } = renderHook(() => useTableRows("t"))
    count = 1201
    let held: boolean | undefined
    act(() => void (held = result.current.reveal([rowAt(1200)])))
    expect(held).toBe(true)
    await waitFor(() => expect(mutate).toHaveBeenCalled())
    rerender()
    await waitFor(() => expect(result.current.rows.some((r) => r.id === "r1200")).toBe(true))
    expect(result.current.complete).toBe(true)
  })

  // The audit's repro: a board's new card on a 100,000-row table read every
  // row to reach it, about 99,500 in 199 requests.
  it("reads no row more for one added past the first 10,000, and says it won't be held", async () => {
    count = 12000
    bundle = bundleNow()
    const { result } = renderHook(() => useTableRows("t"))
    act(() => result.current.all())
    await waitFor(() => expect(result.current.rows).toHaveLength(ROWS_HELD_MAX))
    listRows.mockClear()
    count = 12001
    let held: boolean | undefined
    act(() => void (held = result.current.reveal([rowAt(12000)])))
    expect(held).toBe(false)
    await waitFor(() => expect(mutate).toHaveBeenCalled())
    expect(listRows).not.toHaveBeenCalled()
    expect(result.current.rows).toHaveLength(ROWS_HELD_MAX)
    // Asked for every row, it reads on to it.
    act(() => result.current.all(true))
    await waitFor(() => expect(result.current.rows.some((r) => r.id === "r12000")).toBe(true))
  })

  // The W0 audit (39213924's row): page reads took no AbortSignal, so leaving
  // the page mid-read kept fetching up to 9,500 rows.
  it("stops reading pages when the reader leaves", async () => {
    let signal: AbortSignal | undefined
    listRows.mockImplementationOnce((_t, _o, _l, s) => {
      signal = s
      return new Promise(() => {})
    })
    const { result, unmount } = renderHook(() => useTableRows("t"))
    act(() => result.current.more())
    await waitFor(() => expect(signal).toBeDefined())
    expect(signal!.aborted).toBe(false)
    unmount()
    expect(signal!.aborted).toBe(true)
  })

  it("holds every row of a table that fits its bundle, and reads nothing more", () => {
    count = 120
    bundle = bundleNow()
    const { result } = renderHook(() => useTableRows("t"))
    act(() => result.current.all(true))
    expect(result.current.rows).toHaveLength(120)
    expect(result.current.complete).toBe(true)
    expect(listRows).not.toHaveBeenCalled()
  })
})
