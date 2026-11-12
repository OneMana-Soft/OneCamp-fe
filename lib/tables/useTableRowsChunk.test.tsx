import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, renderHook, waitFor } from "@testing-library/react"
import type { TableBundle, TableRow } from "@/services/tableService"

// V-693: a burst's runner (lib/tables/liveRun, with liveRows)
// is a chunk of its own. One that doesn't come (offline, a deploy that dropped
// it) is a read that failed: nothing is read or put in, the burst is kept, and
// the next message, or the app back online, reads it. A table of `count` rows
// on a fake server, as in useTableRows.test.tsx.
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
const mutate = vi.fn(async (change?: (d: typeof bundle) => typeof bundle) => {
  bundle = typeof change === "function" ? change(bundle) : bundleNow()
  return bundle
})
const listRows = vi.fn<(t: string, offset: number, limit: number, signal?: AbortSignal) => Promise<TableRow[]>>(async (_t, offset, limit) => Array.from({ length: Math.max(0, Math.min(limit, count - offset)) }, (_, i) => rowAt(offset + i)))
const rowsByIds = vi.fn<(t: string, ids: string[]) => Promise<TableRow[]>>(async (_t, ids) => ids.map((id) => rowAt(Number(id.slice(1)))))
let heard: ((m: string) => void) | undefined
// The chunk: refused while down, as a browser refuses an import it can't fetch.
let chunkDown = false
let chunkTries = 0

vi.mock("@/hooks/useFetch", () => ({ useFetch: () => ({ data: bundle, isLoading: false, isError: undefined, mutate }) }))
vi.mock("@/hooks/useMqttTopic", () => ({ useMqttTopic: ({ onMessage }: { onMessage: (m: string) => void }) => void (heard = onMessage) }))
vi.mock("@/services/tableService", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/tableService")>()),
  listRows: (...a: Parameters<typeof listRows>) => listRows(...a),
  rowsByIds: (...a: Parameters<typeof rowsByIds>) => rowsByIds(...a),
}))
// Loaded once before any test's clock runs (V-61, lib/testing/inTestImportsGuard): the fresh copy each
// test imports after vi.resetModules then only runs it again, without transforming its graph inside the 5 s.
beforeAll(async () => {
  await import("@/lib/tables/useTableRows")
})
beforeEach(() => {
  // Each test's page loads the hook afresh: a chunk loaded once stays loaded (lib/lazy/once).
  vi.resetModules()
  vi.doMock("@/lib/tables/liveRun", async (importOriginal) => {
    chunkTries += 1
    if (chunkDown) throw new TypeError("Failed to fetch dynamically imported module")
    return importOriginal()
  })
  count = 1200
  edited = {}
  bundle = bundleNow()
  chunkDown = true
  chunkTries = 0
})
afterEach(() => {
  cleanup()
  mutate.mockClear()
  listRows.mockClear()
  rowsByIds.mockClear()
})

const tell = (data: Record<string, unknown>) => act(() => heard?.(JSON.stringify({ type: 9, data })))
const ids = (rows: TableRow[]) => rows.map((r) => r.id)

async function held1000() {
  const { useTableRows } = await import("@/lib/tables/useTableRows")
  const view = renderHook(() => useTableRows("t"))
  act(() => view.result.current.more())
  await waitFor(() => expect(view.result.current.rows).toHaveLength(1000))
  mutate.mockClear()
  listRows.mockClear()
  return view
}

/** The burst ran without its chunk: fetched as the message was heard, and again by its run, and both refused. */
async function refused() {
  await waitFor(() => expect(chunkTries).toBeGreaterThanOrEqual(2))
  await act(() => new Promise((r) => setTimeout(r, 100)))
}

describe("a burst whose runner's chunk doesn't come", () => {
  it("reads and puts in nothing, keeps the burst, and reads it with the next message, in one read by id", async () => {
    const { result } = await held1000()
    edited.r700 = "Changed elsewhere"
    tell({ action: "updated", row_id: "r700" })
    tell({ action: "deleted", row_id: "r600" })
    await refused()
    expect(rowsByIds).not.toHaveBeenCalled()
    expect(listRows).not.toHaveBeenCalled()
    expect(mutate).not.toHaveBeenCalled()
    expect(ids(result.current.rows)).toContain("r600")
    expect(result.current.rows.find((r) => r.id === "r700")?.values).toContain("Line 700")

    chunkDown = false
    edited.r701 = "Changed too"
    tell({ action: "updated", row_id: "r701" })
    await waitFor(() => expect(result.current.rows.find((r) => r.id === "r700")?.values).toContain("Changed elsewhere"))
    expect(result.current.rows.find((r) => r.id === "r701")?.values).toContain("Changed too")
    expect(ids(result.current.rows)).not.toContain("r600")
    // The kept burst and the new one, in one read by id; the bundle and the pages aren't read again.
    expect(rowsByIds.mock.calls.map(([t, ids]) => [t, [...ids].sort()])).toEqual([["t", ["r700", "r701"]]])
    expect(mutate.mock.calls.filter((c) => typeof c[0] !== "function")).toHaveLength(0)
  })

  it("reads the kept burst once the app is back online, with no message since", async () => {
    const { result } = await held1000()
    edited.r700 = "Changed elsewhere"
    tell({ action: "updated", row_id: "r700" })
    await refused()
    expect(rowsByIds).not.toHaveBeenCalled()

    chunkDown = false
    act(() => void window.dispatchEvent(new Event("offline")))
    act(() => void window.dispatchEvent(new Event("online")))
    await waitFor(() => expect(result.current.rows.find((r) => r.id === "r700")?.values).toContain("Changed elsewhere"))
    expect(rowsByIds.mock.calls).toEqual([["t", ["r700"]]])
  })
})
