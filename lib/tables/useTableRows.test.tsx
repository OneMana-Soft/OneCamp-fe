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
const mutate = vi.fn(async () => {
  bundle = bundleNow()
  return bundle
})
const listRows = vi.fn<(t: string, offset: number, limit: number, signal?: AbortSignal) => Promise<TableRow[]>>(async (_t, offset, limit) => Array.from({ length: Math.max(0, Math.min(limit, count - offset)) }, (_, i) => rowAt(offset + i)))
let heard: ((m: string) => void) | undefined

vi.mock("@/hooks/useFetch", () => ({ useFetch: () => ({ data: bundle, isLoading: false, isError: undefined, mutate }) }))
vi.mock("@/hooks/useMqttTopic", () => ({ useMqttTopic: ({ onMessage }: { onMessage: (m: string) => void }) => void (heard = onMessage) }))
vi.mock("@/services/tableService", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/tableService")>()),
  listRows: (...a: Parameters<typeof listRows>) => listRows(...a),
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

  it("asks again for only the page holding a row someone changed", async () => {
    const { result } = renderHook(() => useTableRows("t"))
    act(() => result.current.more())
    await waitFor(() => expect(result.current.rows).toHaveLength(1000))
    listRows.mockClear()
    edited.r700 = "Changed elsewhere"
    tell({ action: "updated", row_id: "r700" })
    await waitFor(() => expect(result.current.rows.find((r) => r.id === "r700")?.values).toContain("Changed elsewhere"))
    expect(listRows.mock.calls).toEqual([["t", 500, 500]])
    expect(mutate).not.toHaveBeenCalled()
  })

  it("asks again for the bundle and every page held when rows go", async () => {
    const { result } = renderHook(() => useTableRows("t"))
    act(() => result.current.more())
    await waitFor(() => expect(result.current.rows).toHaveLength(1000))
    listRows.mockClear()
    tell({ action: "deleted", row_id: "r3" })
    await waitFor(() => expect(mutate).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(listRows).toHaveBeenCalledWith("t", 500, 500))
  })

  it("asks for the bundle alone when a row is added or the table renamed", async () => {
    const { result } = renderHook(() => useTableRows("t"))
    act(() => result.current.more())
    await waitFor(() => expect(result.current.rows).toHaveLength(1000))
    listRows.mockClear()
    tell({ action: "table" })
    await waitFor(() => expect(mutate).toHaveBeenCalledTimes(1))
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
