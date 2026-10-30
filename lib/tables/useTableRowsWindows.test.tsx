import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, renderHook, waitFor } from "@testing-library/react"
import type { RowsWindow, TableBundle, TableField, TableRow } from "@/services/tableService"
import type { RowSpec } from "@/lib/tables/query"
import type { SummaryFn } from "@/lib/tables/display"
import type { ViewRules } from "@/lib/tables/viewRules"

// A view's windows (tables T5c): a table of `count` rows on a fake server
// whose bundle carries the first 500 and whose query answers a spec's rows
// in windows: in the table's order, or the other way for a sort that says
// desc, keeping those whose item has a filter's text.
let count = 1200
let edited: Record<string, string> = {}
let extra: TableRow[] = []
let moreFields: TableField[] = []
// Every third row is Won, then Lost, then Open (a choice the grouped views group by).
const STAGES = ["Won", "Lost", "Open"]
// A row someone moved to another stage.
let staged: Record<string, string> = {}
const rowAt = (i: number): TableRow => ({
  id: `r${i}`,
  table_id: "t",
  position: i,
  created_at: "",
  updated_at: edited[`r${i}`] ?? staged[`r${i}`] ?? "",
  values: JSON.stringify({ item: edited[`r${i}`] ?? `Line ${i}`, stage: staged[`r${i}`] ?? STAGES[i % 3] }),
})
const stageOf = (r: TableRow) => String(JSON.parse(r.values).stage)
// What the server says when it won't count a grouped view's groups (a 422 in its words).
let refuse: string | null = null
// What the server says when it won't read the view at all, or won't work out a
// formula's sums (field:calc) past what one read works out (a 422, airtable-03).
let refuseAll: string | null = null
let refuseSums: string | null = null
// How many counts to come leave out the sums and the groups, as the server
// does when they run past their budget (business/RowQuery SummaryBudget, V-48).
let leaveOut = 0
// airtable-03b: windows answered "still being filled" (a 422 with code working_out and its progress), one a read, in order.
let working: { done: number; total: number }[] = []
// Windows that fail with no answer (offline), one a read, after any still being filled.
let down = 0
const filling = (p: { done: number; total: number }) => `Double is being worked out over ${p.total.toLocaleString("en-US")} rows: ${Math.floor((p.done * 100) / p.total)}% done`
const tableRows = () => [...Array.from({ length: count }, (_, i) => rowAt(i)), ...extra]
const bundleNow = (): { data: TableBundle } => ({
  data: {
    table: { id: "t", name: "Big", visibility: "workspace", created_by: "", created_at: "", updated_at: "" },
    fields: [
      { id: "item", table_id: "t", name: "Item", type: "text", config: "{}", position: 0 },
      { id: "who", table_id: "t", name: "Who", type: "people", config: "{}", position: 1 },
      ...moreFields,
    ],
    views: [],
    rows: tableRows().slice(0, 500),
    can_manage: true,
    mqtt_topic: "table/t",
    rows_truncated: count + extra.length > 500,
    row_count: count + extra.length,
    row_query: { indexed: true, sorts_text: true },
  },
})
let bundle = bundleNow()
const mutate = vi.fn(async (change?: (d: typeof bundle) => typeof bundle) => {
  bundle = typeof change === "function" ? change(bundle) : bundleNow()
  return bundle
})
const answer = (spec: RowSpec): TableRow[] => {
  let rows = tableRows()
  const f = spec.filter?.filters[0]
  if (f && "values" in f && f.values?.[0] && "text" in f.values[0]) {
    const w = f.values[0].text
    rows = rows.filter((r) => String(JSON.parse(r.values).item).toLowerCase().includes(w))
  }
  if (spec.sorts?.[0]?.desc) rows = rows.reverse()
  // Grouped by stage, in its options' order; a window leaves out the groups collapsed.
  const g = spec.groups?.[0]
  if (!g) return rows
  const shut = new Set((g.collapsed ?? []).map((p) => (JSON.parse(p) as string[])[0]))
  return [...rows].sort((a, b) => STAGES.indexOf(stageOf(a)) - STAGES.indexOf(stageOf(b))).filter((r) => !shut.has(stageOf(r)))
}
const queryRows = vi.fn<(t: string, body: { spec: RowSpec; cursor?: string; n: number; count?: boolean }, signal?: AbortSignal) => Promise<RowsWindow>>(async (_t, body) => {
  const all = answer(body.spec)
  const at = Number(body.cursor || 0)
  const rows = all.slice(at, at + body.n)
  const next = at + body.n < all.length ? String(at + body.n) : undefined
  // Each summary asked is 42, but a count, which is the rows'.
  const summaries = body.spec.summaries && Object.fromEntries(body.spec.summaries.map((a) => [a.field, Object.fromEntries(a.fns.map((fn) => [fn, fn === "count" ? all.length : 42]))]))
  const refusal = refuseAll ?? (body.count && body.spec.summaries?.some((a) => a.field === "field:calc") ? refuseSums : null)
  if (refusal) throw Object.assign(new Error("Request failed with status code 422"), { response: { status: 422, data: { msg: refusal } } })
  const fill = !body.count && working.shift()
  if (fill) throw Object.assign(new Error("Request failed with status code 422"), { response: { status: 422, data: { msg: filling(fill), code: "working_out", progress: fill } } })
  if (!body.count && down > 0) {
    down--
    throw new Error("Network Error")
  }
  if (body.count && leaveOut > 0) {
    leaveOut--
    return { rows, next, total: all.length }
  }
  if (body.count && body.spec.groups && refuse) throw Object.assign(new Error("Request failed with status code 422"), { response: { status: 422, data: { msg: refuse } } })
  const groups = body.count && body.spec.groups ? STAGES.map((s) => ({ key: [s], count: all.filter((r) => stageOf(r) === s).length })) : undefined
  return { rows, next, ...(body.count ? { total: all.length, ...(summaries ? { summaries } : {}), ...(groups ? { groups } : {}) } : {}) }
})
const listRows = vi.fn(async (_t: string, offset: number, limit: number) => tableRows().slice(offset, offset + limit))
const rowsByIds = vi.fn(async (_t: string, ids: string[]) => tableRows().filter((r) => ids.includes(r.id)))
let heard: ((m: string) => void) | undefined

vi.mock("@/hooks/useFetch", () => ({ useFetch: () => ({ data: bundle, isLoading: false, isError: undefined, mutate }) }))
vi.mock("@/hooks/useMqttTopic", () => ({ useMqttTopic: ({ onMessage }: { onMessage: (m: string) => void }) => void (heard = onMessage) }))
vi.mock("@/services/tableService", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/tableService")>()),
  queryRows: (...a: Parameters<typeof queryRows>) => queryRows(...a),
  listRows: (...a: Parameters<typeof listRows>) => listRows(...a),
  rowsByIds: (...a: Parameters<typeof rowsByIds>) => rowsByIds(...a),
}))

import { useTableRows, type RowView } from "@/lib/tables/useTableRows"

const view = (r: Partial<ViewRules>, windows = true): RowView => ({ rules: { sort: [], filters: [], match: "all", ...r }, windows })
const newestFirst = view({ sort: [{ field: "item", dir: "desc" }] })
const tell = (data: Record<string, unknown>) => act(() => heard?.(JSON.stringify({ type: 9, data })))
const ids = (rs: TableRow[]) => rs.map((r) => r.id)
const windowsFrom = () => queryRows.mock.calls.filter((c) => !c[1].count).map((c) => c[1].cursor ?? "")

beforeEach(() => {
  count = 1200
  refuse = null
  refuseAll = null
  refuseSums = null
  leaveOut = 0
  working = []
  down = 0
  staged = {}
  edited = {}
  extra = []
  moreFields = []
  bundle = bundleNow()
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  mutate.mockClear()
  queryRows.mockClear()
  listRows.mockClear()
  rowsByIds.mockClear()
})

describe("a view the server answers in windows", () => {
  it("reads its first window in its order, with its count beside it, and holds nothing more", async () => {
    const { result } = renderHook(() => useTableRows("t", newestFirst))
    await waitFor(() => expect(result.current.rows).toHaveLength(500))
    expect(result.current.windowed).toBe(true)
    expect(ids(result.current.rows).slice(0, 2)).toEqual(["r1199", "r1198"])
    expect(result.current.count).toBe(1200)
    expect(queryRows).toHaveBeenCalledWith("t", { spec: { sorts: [{ field: "field:item", desc: true }] }, cursor: undefined, n: 500 }, expect.any(AbortSignal))
    expect(queryRows).toHaveBeenCalledWith("t", { spec: { sorts: [{ field: "field:item", desc: true }] }, n: 1, count: true }, expect.any(AbortSignal))
    expect(listRows).not.toHaveBeenCalled()
  })

  it("reads on as the view reaches its rows, a window at a time, and never all at once", async () => {
    const { result } = renderHook(() => useTableRows("t", newestFirst))
    await waitFor(() => expect(result.current.rows).toHaveLength(500))
    act(() => result.current.all(true))
    act(() => result.current.more(400))
    await waitFor(() => expect(result.current.rows).toHaveLength(1000))
    expect(result.current.complete).toBe(false)
    act(() => result.current.more(1150))
    await waitFor(() => expect(result.current.complete).toBe(true))
    expect(ids(result.current.rows).at(-1)).toBe("r0")
    expect(windowsFrom()).toEqual(["", "500", "1000"])
    expect(listRows).not.toHaveBeenCalled()
  })

  it("counts a filtered view's rows, and shows none past its count", async () => {
    const { result } = renderHook(() => useTableRows("t", view({ filters: [{ field: "item", op: "contains", value: "line 11" }] })))
    await waitFor(() => expect(result.current.complete).toBe(true))
    // Line 11, and Line 110 to 119, 1100 to 1199.
    expect(result.current.count).toBe(111)
    expect(result.current.rows).toHaveLength(111)
  })

  it("stays in the browser when the server can't answer a rule, or the view doesn't read windows", async () => {
    for (const v of [view({ filters: [{ field: "who", op: "contains", value: "Sam" }] }), view({ sort: [{ field: "item", dir: "asc" }] }, false)]) {
      const { result, unmount } = renderHook(() => useTableRows("t", v))
      expect(result.current.windowed).toBe(false)
      expect(result.current.rows).toHaveLength(500)
      unmount()
    }
    expect(queryRows).not.toHaveBeenCalled()
  })

  it("puts a row changed in its place, read by id, without reading the windows again", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const { result } = renderHook(() => useTableRows("t", newestFirst))
    await waitFor(() => expect(result.current.rows).toHaveLength(500))
    queryRows.mockClear()
    edited.r1100 = "Changed"
    tell({ action: "updated", row_id: "r1100" })
    await act(async () => void vi.advanceTimersByTime(400))
    await waitFor(() => expect(JSON.parse(result.current.rows[99].values).item).toBe("Changed"))
    expect(rowsByIds).toHaveBeenCalledWith("t", ["r1100"])
    expect(queryRows).not.toHaveBeenCalled()
  })

  it("reads its windows again from the first, as far as they were read, when a row is made", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const { result } = renderHook(() => useTableRows("t", newestFirst))
    await waitFor(() => expect(result.current.rows).toHaveLength(500))
    act(() => result.current.more(400))
    await waitFor(() => expect(result.current.rows).toHaveLength(1000))
    queryRows.mockClear()
    count = 1201
    tell({ action: "created", row_id: "r1200" })
    await act(async () => void vi.advanceTimersByTime(400))
    await waitFor(() => expect(ids(result.current.rows)[0]).toBe("r1200"))
    expect(result.current.rows).toHaveLength(1000)
    expect(result.current.count).toBe(1201)
    expect(windowsFrom()).toEqual(["", "500"])
  })

  it("keeps a row added here at its end until the person moves on, then puts it in its place", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const { result } = renderHook(() => useTableRows("t", newestFirst))
    await waitFor(() => expect(result.current.rows).toHaveLength(500))
    const added: TableRow = { ...rowAt(1200), values: JSON.stringify({}) }
    let held = false
    act(() => void (held = result.current.reveal([added])))
    expect(held).toBe(true)
    expect(ids(result.current.rows).at(-1)).toBe("r1200")
    expect(result.current.tail).toBe(1)
    // Its own "created" reads the windows again; it isn't shown twice.
    count = 1201
    tell({ action: "created", row_id: "r1200" })
    await act(async () => void vi.advanceTimersByTime(400))
    await waitFor(() => expect(result.current.count).toBe(1202))
    expect(ids(result.current.rows).filter((id) => id === "r1200")).toHaveLength(1)
    expect(ids(result.current.rows).at(-1)).toBe("r1200")
    act(() => result.current.unpin())
    await waitFor(() => expect(result.current.tail).toBe(0))
    await waitFor(() => expect(ids(result.current.rows)[0]).toBe("r1200"))
    expect(result.current.count).toBe(1201)
  })

  // The bundle carries the table's first 500 rows, which are a view in the
  // table's own order's first 500: shown at once, not placeholders over rows
  // already here while the same rows come again.
  it("shows the bundle's page while a view in the table's own order reads its first window", async () => {
    const { result } = renderHook(() => useTableRows("t", view({})))
    expect(result.current.windowed).toBe(true)
    expect(ids(result.current.rows).slice(0, 2)).toEqual(["r0", "r1"])
    expect(result.current.rows).toHaveLength(500)
    expect(result.current.count).toBe(1200)
    expect(result.current.counted).toBe(true)
    await waitFor(() => expect(windowsFrom()).toEqual([""]))
    await waitFor(() => expect(result.current.reading).toBe(false))
    expect(ids(result.current.rows).slice(0, 2)).toEqual(["r0", "r1"])
  })

  it("says when a filtered view's rows are counted, and when the count stopped at the server's cap", async () => {
    let counted: (w: RowsWindow) => void = () => {}
    const answered = queryRows.getMockImplementation()!
    queryRows.mockImplementation((t, body, signal) => (body.count ? new Promise<RowsWindow>((r) => (counted = r)) : answered(t, body, signal)))
    try {
      const { result } = renderHook(() => useTableRows("t", view({ filters: [{ field: "item", op: "contains", value: "line" }] })))
      await waitFor(() => expect(result.current.rows).toHaveLength(500))
      expect(result.current.counted).toBe(false)
      expect(result.current.countCapped).toBe(false)
      await act(async () => counted({ rows: [], total: 100_000, total_capped: true }))
      expect(result.current.counted).toBe(true)
      expect(result.current.count).toBe(100_000)
      expect(result.current.countCapped).toBe(true)
    } finally {
      queryRows.mockImplementation(answered)
    }
  })

  it("reads another view's windows from its first", async () => {
    let v = newestFirst
    const { result, rerender } = renderHook(() => useTableRows("t", v))
    await waitFor(() => expect(ids(result.current.rows)[0]).toBe("r1199"))
    v = view({})
    rerender()
    await waitFor(() => expect(ids(result.current.rows)[0]).toBe("r0"))
    expect(result.current.rows).toHaveLength(500)
  })
})

// The summary bar (QUERY_STACK_CONTRACT item 8): a view read in windows asks
// the server for what its bar shows, which sums every row the view keeps,
// beside its count, so a window never waits on it.
describe("the summary bar of a view read in windows", () => {
  beforeEach(() => {
    moreFields = [
      { id: "cost", table_id: "t", name: "Cost", type: "number", config: "{}", position: 2 },
      { id: "paid", table_id: "t", name: "Paid", type: "checkbox", config: "{}", position: 3 },
    ]
    bundle = bundleNow()
  })
  const summed = (summary: Record<string, SummaryFn>, hidden: string[] = []): RowView => ({ ...newestFirst, summary, hidden })
  const asked = () => queryRows.mock.calls.filter((c) => c[1].count).map((c) => c[1].spec.summaries)

  it("asks for its summaries beside the first window's count, never with a window", async () => {
    const { result } = renderHook(() => useTableRows("t", summed({ cost: "average" }, ["who"])))
    await waitFor(() => expect(result.current.summaries).toEqual({ "field:cost": { average: 42 }, "field:paid": { checked: 42, count: 1200 } }))
    expect(asked()).toEqual([[{ field: "field:cost", fns: ["average"] }, { field: "field:paid", fns: ["checked", "count"] }]])
    expect(queryRows.mock.calls.filter((c) => !c[1].count).map((c) => c[1].spec.summaries)).toEqual([undefined])
  })

  it("asks again for what the reader picks, without reading the windows again", async () => {
    const { result, rerender } = renderHook(({ v }) => useTableRows("t", v), { initialProps: { v: summed({ cost: "average" }, ["who"]) } })
    await waitFor(() => expect(result.current.summaries?.["field:cost"]).toEqual({ average: 42 }))
    rerender({ v: summed({ cost: "max" }, ["paid", "who"]) })
    await waitFor(() => expect(result.current.summaries).toEqual({ "field:cost": { max: 42 } }))
    expect(windowsFrom()).toEqual([""])
  })

  it("sums again once a row someone changed is read, wherever it is in the view", async () => {
    const { result } = renderHook(() => useTableRows("t", summed({})))
    await waitFor(() => expect(result.current.summaries).toBeTruthy())
    queryRows.mockClear()
    await tell({ action: "updated", row_id: "r3" })
    await waitFor(() => expect(asked()).toHaveLength(1))
    expect(windowsFrom()).toEqual([])
  })

  // CR-62 (summary bar SF1): every settled burst of changes asked for the
  // count and the sums again, each a pass over the whole view.
  it("asks for the sums again at most every 2 s while rows keep changing, and once after, reading each row at once", async () => {
    const { result } = renderHook(() => useTableRows("t", summed({})))
    await waitFor(() => expect(result.current.summaries).toBeTruthy())
    queryRows.mockClear()
    // Rows the view holds (newest first): each is read again at once.
    await tell({ action: "updated", row_id: "r1199" })
    await waitFor(() => expect(asked()).toHaveLength(1))
    await tell({ action: "updated", row_id: "r1198" })
    await waitFor(() => expect(rowsByIds.mock.calls.at(-1)?.[1]).toEqual(["r1198"]))
    await act(() => new Promise((r) => setTimeout(r, 500)))
    expect(asked()).toHaveLength(1)
    await waitFor(() => expect(asked()).toHaveLength(2), { timeout: 3000 })
  }, 10_000)

  // V-48: right after a big import, a first window's sums ran past their
  // budget and the server left them out; the view waited for them for good,
  // and its bar said "Sum …" with no end.
  const later = (ms: number) => act(async () => void vi.advanceTimersByTime(ms))

  it("says when the server left its sums out, and asks again a little later until they come", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    leaveOut = 1
    const { result } = renderHook(() => useTableRows("t", summed({ cost: "average" }, ["who"])))
    await waitFor(() => expect(result.current.leftOut).toBe(true))
    expect(result.current.summaries).toBeNull()
    expect(result.current.count).toBe(1200)
    await later(4000)
    expect(asked()).toHaveLength(1)
    await later(2000)
    await waitFor(() => expect(result.current.summaries).toEqual({ "field:cost": { average: 42 }, "field:paid": { checked: 42, count: 1200 } }))
    expect(result.current.leftOut).toBe(false)
    expect(asked()).toHaveLength(2)
    expect(windowsFrom()).toEqual([""])
  })

  it("asks again three times at most, each wait three times the last", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    leaveOut = 10
    const { result } = renderHook(() => useTableRows("t", summed({ cost: "sum" })))
    await waitFor(() => expect(result.current.leftOut).toBe(true))
    // 5 s, 15 s and 45 s after each answer that left them out.
    for (const [wait, early, asks] of [
      [5000, 1000, 2],
      [15_000, 2000, 3],
      [45_000, 5000, 4],
    ]) {
      await later(wait - early)
      expect(asked()).toHaveLength(asks - 1)
      await later(2 * early)
      await waitFor(() => expect(asked()).toHaveLength(asks))
    }
    await later(600_000)
    expect(asked()).toHaveLength(4)
    expect(result.current.leftOut).toBe(true)
    expect(result.current.summaries).toBeNull()
  })

  // V-118 (the live walk at 100k, 30 Oct): the server left the sums out of
  // every count, the three re-asks' too, and the bar said "Sum …" for good,
  // with no reason and nothing to try again, as it did after a reload.
  it("says why, with a Try again, once the last re-ask left its sums out too, and drops it once a count has them", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    leaveOut = 5
    const { result } = renderHook(() => useTableRows("t", summed({ cost: "sum" })))
    await waitFor(() => expect(result.current.leftOut).toBe(true))
    expect(result.current.sumsOut).toBeNull()
    expect(result.current.recount).toBeNull()
    for (const wait of [5000, 15_000, 45_000]) await later(wait + 1000)
    await waitFor(() => expect(result.current.sumsOut ?? "").toMatch(/take too long to add up/))
    expect(result.current.summaries).toBeNull()
    expect(asked()).toHaveLength(4)
    // Left out again: the words stay, and nothing asks again by itself.
    act(() => result.current.recount?.())
    expect(result.current.recounting).toBe(true)
    await waitFor(() => expect(result.current.recounting).toBe(false))
    expect(asked()).toHaveLength(5)
    expect(result.current.sumsOut ?? "").toMatch(/take too long to add up/)
    await later(600_000)
    expect(asked()).toHaveLength(5)
    // Added up this time.
    act(() => result.current.recount?.())
    await waitFor(() => expect(result.current.summaries?.["field:cost"]).toEqual({ sum: 42 }))
    expect(result.current.sumsOut).toBeNull()
    expect(result.current.recount).toBeNull()
    expect(asked()).toHaveLength(6)
  })

  it("keeps the sums it shows when they're asked again and left out, then asks a little later", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const { result } = renderHook(() => useTableRows("t", summed({})))
    await waitFor(() => expect(result.current.summaries).toBeTruthy())
    const shown = result.current.summaries
    leaveOut = 1
    await tell({ action: "updated", row_id: "r3" })
    await waitFor(() => expect(result.current.leftOut).toBe(true))
    expect(result.current.summaries).toBe(shown)
    await later(6000)
    await waitFor(() => expect(result.current.leftOut).toBe(false))
    expect(result.current.summaries).toEqual(shown)
    expect(asked()).toHaveLength(3)
  })

  // CR-76: a re-ask that waits is for the view it was asked for.
  it("drops a re-ask that waits when the reader filters the view, and counts the filtered view at once", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    leaveOut = 1
    const whole = summed({ cost: "sum" })
    const { result, rerender } = renderHook(({ v }) => useTableRows("t", v), { initialProps: { v: whole } })
    await waitFor(() => expect(result.current.leftOut).toBe(true))
    await later(2000)
    rerender({ v: { ...whole, rules: { ...whole.rules, filters: [{ field: "item", op: "contains", value: "line 11" }] } } })
    await waitFor(() => expect(result.current.count).toBe(111))
    await waitFor(() => expect(result.current.summaries?.["field:cost"]).toEqual({ sum: 42 }))
    expect(result.current.leftOut).toBe(false)
    await later(600_000)
    // The whole view's one count, then the filtered view's: never the whole view's again.
    expect(queryRows.mock.calls.filter((c) => c[1].count).map((c) => !!c[1].spec.filter)).toEqual([false, true])
  })
})

// Tables V2b: a grouped view's groups lead its order; the server counts every
// group beside its first window, and its windows leave out the rows of the
// groups this reader collapsed, which it still counts.
// airtable-03 (main's call, 29 Oct): a formula's or a rollup's summaries are
// the server's, over every row the reader may see, as a stored field's are. A
// sum the server won't work out is refused in its words for its columns
// alone, and a window it won't read says why, never "Couldn't load the rows".
describe("a formula's summaries, and a window the server refuses, in a view read in windows", () => {
  const WORDS = "This table has too many rows to work out a formula or a rollup over all of them yet"
  beforeEach(() => {
    moreFields = [
      { id: "cost", table_id: "t", name: "Cost", type: "number", config: "{}", position: 2 },
      { id: "calc", table_id: "t", name: "Calc", type: "formula", config: JSON.stringify({ formula: "{Cost} * 2", result: "number" }), position: 3 },
    ]
    bundle = bundleNow()
  })
  const asked = () => queryRows.mock.calls.filter((c) => c[1].count).map((c) => c[1].spec.summaries)
  const summed = (rules: Partial<ViewRules> = {}): RowView => ({ ...view({ sort: [{ field: "item", dir: "desc" }], ...rules }), summary: {}, hidden: ["who"] })
  const both = [
    { field: "field:cost", fns: ["sum"] },
    { field: "field:calc", fns: ["sum"] },
  ]

  it("asks a formula's sums with the rest, beside the first window's count: the server's, over every row the view keeps", async () => {
    const { result } = renderHook(() => useTableRows("t", summed()))
    await waitFor(() => expect(result.current.summaries).toEqual({ "field:cost": { sum: 42 }, "field:calc": { sum: 42 } }))
    expect(asked()).toEqual([both])
    expect(result.current.refusedSums).toBeNull()
  })

  it("counts again without a formula's sums the server refuses, so the count and the other sums still answer, and says why for its columns alone", async () => {
    refuseSums = WORDS
    const { result } = renderHook(() => useTableRows("t", summed()))
    await waitFor(() => expect(result.current.refusedSums).toEqual({ why: WORDS, fields: ["field:calc"] }))
    expect(result.current.summaries).toEqual({ "field:cost": { sum: 42 } })
    expect(result.current.count).toBe(1200)
    expect(asked()).toEqual([both, [{ field: "field:cost", fns: ["sum"] }]])
    // The view itself is read: only those columns' sums were refused.
    expect(result.current.refused).toBeNull()
    expect(result.current.rows).toHaveLength(500)
  })

  it("says a refused window's own words, not that it couldn't load them, and reads no more windows until the view's rules change", async () => {
    refuseAll = WORDS
    const { result, rerender } = renderHook(({ r }) => useTableRows("t", r), { initialProps: { r: summed() } })
    await waitFor(() => expect(result.current.refused).toBe(WORDS))
    expect(result.current.failed).toBe(false)
    expect(result.current.stopped).toBe(true)
    expect(result.current.rows).toEqual([])
    expect(result.current.count).toBe(0)
    act(() => result.current.more(600))
    expect(windowsFrom()).toEqual([""])
    refuseAll = null
    rerender({ r: summed({ sort: [{ field: "item", dir: "asc" }] }) })
    await waitFor(() => expect(result.current.rows).toHaveLength(500))
    expect(result.current.refused).toBeNull()
    expect(result.current.stopped).toBe(false)
  })

  // airtable-03b (the live walk at 100k): a sort by a formula the server was
  // still filling was refused, and stayed refused once it was filled.
  it("says how far a formula's fill has got, not a refusal, and reads the view again by itself until it's filled", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    working = [{ done: 30000, total: 100000 }, { done: 80000, total: 100000 }]
    const { result } = renderHook(() => useTableRows("t", summed()))
    await waitFor(() => expect(result.current.workingOut).toEqual({ words: filling({ done: 30000, total: 100000 }), done: 30000, total: 100000 }))
    expect(result.current.refused).toBeNull()
    expect(result.current.failed).toBe(false)
    expect(result.current.rows).toEqual([])
    await act(async () => void (await vi.advanceTimersByTimeAsync(2_000)))
    await waitFor(() => expect(result.current.workingOut?.done).toBe(80000))
    // The next ask waits twice as long (CR-95 M2).
    await act(async () => void (await vi.advanceTimersByTimeAsync(4_000)))
    await waitFor(() => expect(result.current.rows).toHaveLength(500))
    expect(result.current.workingOut).toBeNull()
    expect(result.current.refused).toBeNull()
    expect(result.current.stopped).toBe(false)
  })

  // CR-95 M2: a fill that runs long (or never ends) isn't asked every 2 s for
  // good: each ask waits twice the last, 2, 4, 8, 16, then 30 s at most.
  it("asks again less often the longer a formula's fill runs, at most every 30 s", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    working = Array.from({ length: 7 }, (_, i) => ({ done: (i + 1) * 10000, total: 100000 }))
    const { result } = renderHook(() => useTableRows("t", summed()))
    await waitFor(() => expect(result.current.workingOut?.done).toBe(10000))
    const asks = () => windowsFrom().length
    for (const wait of [2_000, 4_000, 8_000, 16_000, 30_000, 30_000]) {
      const before = asks()
      await act(async () => void (await vi.advanceTimersByTimeAsync(wait - 500)))
      expect(asks(), `not asked again before ${wait} ms`).toBe(before)
      await act(async () => void (await vi.advanceTimersByTimeAsync(500)))
      await waitFor(() => expect(asks(), `asked again at ${wait} ms`).toBe(before + 1))
    }
  })

  // CR-95 M2: a hidden tab doesn't ask; shown again, it asks at once.
  it("doesn't ask again while the page is hidden, and asks at once when it's shown", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    let hidden = false
    const was = Object.getOwnPropertyDescriptor(Document.prototype, "hidden")
    Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden })
    try {
      working = [{ done: 30000, total: 100000 }]
      const { result } = renderHook(() => useTableRows("t", summed()))
      await waitFor(() => expect(result.current.workingOut?.done).toBe(30000))
      const before = windowsFrom().length
      hidden = true
      act(() => void document.dispatchEvent(new Event("visibilitychange")))
      await act(async () => void (await vi.advanceTimersByTimeAsync(120_000)))
      expect(windowsFrom().length).toBe(before)
      hidden = false
      act(() => void document.dispatchEvent(new Event("visibilitychange")))
      await act(async () => void (await vi.advanceTimersByTimeAsync(0)))
      await waitFor(() => expect(result.current.rows).toHaveLength(500))
      expect(windowsFrom().length).toBe(before + 1)
    } finally {
      delete (document as { hidden?: boolean }).hidden
      if (was) Object.defineProperty(Document.prototype, "hidden", was)
    }
  })

  // DB-42: a read again that fails while the formula is being filled (offline,
  // a 5xx, a timeout) said how far for good and never read again. It says it
  // couldn't load, with Try again, which reads from the first.
  it("says it couldn't load, with Try again, when a read during a fill fails, and reads from the first again", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    working = [{ done: 30000, total: 100000 }]
    down = 1
    const { result } = renderHook(() => useTableRows("t", summed()))
    await waitFor(() => expect(result.current.workingOut?.done).toBe(30000))
    await act(async () => void (await vi.advanceTimersByTimeAsync(2_000)))
    await waitFor(() => expect(result.current.failed).toBe(true))
    expect(result.current.workingOut).toBeNull()
    expect(result.current.refused).toBeNull()
    act(() => result.current.retry())
    await waitFor(() => expect(result.current.rows).toHaveLength(500))
    expect(result.current.failed).toBe(false)
    expect(result.current.workingOut).toBeNull()
  })
})

describe("a grouped view read in windows", () => {
  beforeEach(() => {
    moreFields = [{ id: "stage", table_id: "t", name: "Stage", type: "select", config: JSON.stringify({ options: STAGES.map((label) => ({ label })) }), position: 2 }]
    bundle = bundleNow()
  })
  const grouped = (shut?: string[][]): RowView => ({ ...view({ groups: [{ field: "stage", dir: "asc" }] }), shut })
  const counts = () => queryRows.mock.calls.filter((c) => c[1].count)
  const windowGroups = () => queryRows.mock.calls.filter((c) => !c[1].count).map((c) => c[1].spec.groups)
  const everyGroup = [
    { key: ["Won"], count: 400 },
    { key: ["Lost"], count: 400 },
    { key: ["Open"], count: 400 },
  ]

  it("counts its groups beside its first window, and reads its windows without the groups collapsed", async () => {
    const { result } = renderHook(() => useTableRows("t", grouped([["Won"]])))
    await waitFor(() => expect(result.current.groups).toEqual(everyGroup))
    await waitFor(() => expect(result.current.rows).toHaveLength(500))
    expect(ids(result.current.rows).slice(0, 2)).toEqual(["r1", "r4"])
    // Every row is the view's, a collapsed group's too.
    expect(result.current.count).toBe(1200)
    expect(counts().map((c) => c[1].spec.groups)).toEqual([[{ field: "field:stage" }]])
    expect(windowGroups()).toEqual([[{ field: "field:stage", collapsed: ['["Won"]'] }]])
    expect(result.current.shutRead).toEqual([["Won"]])
  })

  it("reads its windows again as the reader collapses a group, without counting again, and keeps the rows read until they come", async () => {
    const { result, rerender } = renderHook(({ v }) => useTableRows("t", v), { initialProps: { v: grouped() } })
    await waitFor(() => expect(result.current.groups).toEqual(everyGroup))
    await waitFor(() => expect(result.current.rows).toHaveLength(500))
    const answer = queryRows.getMockImplementation()!
    let release = () => {}
    const held = new Promise<void>((r) => (release = r))
    queryRows.mockImplementationOnce(async (...a) => {
      await held
      return answer(...a)
    })
    rerender({ v: grouped([["Won"]]) })
    await waitFor(() => expect(windowGroups()).toHaveLength(2))
    expect(ids(result.current.rows).slice(0, 2)).toEqual(["r0", "r3"])
    expect(result.current.shutRead).toEqual([])
    await act(async () => release())
    await waitFor(() => expect(result.current.shutRead).toEqual([["Won"]]))
    expect(ids(result.current.rows).slice(0, 2)).toEqual(["r1", "r4"])
    expect(result.current.groups).toEqual(everyGroup)
    expect(counts()).toHaveLength(1)
  })

  // CR-62 (V2b SF1): the server takes at most 1,000 groups collapsed a level
  // (QuerySpec MaxGroupCounts) and refuses the window past that.
  it("leaves out the last 1,000 groups collapsed a level at most, as many as the server takes", async () => {
    const many = Array.from({ length: 1200 }, (_, i) => [`G${i}`])
    renderHook(() => useTableRows("t", grouped(many)))
    await waitFor(() => expect(windowGroups()).toHaveLength(1))
    const collapsed = windowGroups()[0]?.[0]?.collapsed ?? []
    expect(collapsed).toHaveLength(1000)
    expect(collapsed[0]).toBe(JSON.stringify(["G200"]))
  })

  it("keeps its rows, in their groups' order, and says why when the server won't count its groups", async () => {
    refuse = "grouped this way, the rows fall into more than 1000 groups"
    const { result } = renderHook(() => useTableRows("t", grouped()))
    await waitFor(() => expect(result.current.refused).toBe(refuse))
    await waitFor(() => expect(result.current.rows).toHaveLength(500))
    expect(ids(result.current.rows).slice(0, 2)).toEqual(["r0", "r3"])
    expect(result.current.groups).toBeNull()
  })

  // V-48: a first count past its budget left the groups out too, and a
  // grouping the server won't count showed neither its groups nor why.
  it("asks again a little later when the server left its groups out, and shows them then", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    leaveOut = 1
    const { result } = renderHook(() => useTableRows("t", grouped()))
    await waitFor(() => expect(result.current.leftOut).toBe(true))
    expect(result.current.groups).toBeNull()
    await act(async () => void vi.advanceTimersByTime(6000))
    await waitFor(() => expect(result.current.groups).toEqual(everyGroup))
    expect(result.current.leftOut).toBe(false)
    expect(counts()).toHaveLength(2)
  })

  it("says why, when the server left its groups out and then won't count them", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    leaveOut = 1
    refuse = "grouped this way, the rows fall into more than 1000 groups"
    const { result } = renderHook(() => useTableRows("t", grouped()))
    await waitFor(() => expect(result.current.leftOut).toBe(true))
    expect(result.current.refused).toBeNull()
    await act(async () => void vi.advanceTimersByTime(6000))
    await waitFor(() => expect(result.current.refused).toBe(refuse))
    expect(result.current.groups).toBeNull()
  })

  // CR-76 MF1: when every count left the groups out, the three re-asks' too,
  // the grid drew rows on their way for good: no rows, no reason.
  it("shows its rows ungrouped, and says why, once the last re-ask left its groups out too", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    leaveOut = 10
    const { result } = renderHook(() => useTableRows("t", grouped()))
    await waitFor(() => expect(result.current.leftOut).toBe(true))
    for (const [wait, asks] of [
      [5000, 2],
      [15_000, 3],
      [45_000, 4],
    ]) {
      expect(result.current.refused).toBeNull()
      await act(async () => void vi.advanceTimersByTime(wait + 1000))
      await waitFor(() => expect(counts()).toHaveLength(asks))
    }
    await waitFor(() => expect(result.current.refused ?? "").toMatch(/ungrouped/))
    expect(result.current.groups).toBeNull()
    await waitFor(() => expect(result.current.rows).toHaveLength(500))
  })

  it("groups its rows again, and drops what it said, once a later count has the groups", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    leaveOut = 4
    const { result } = renderHook(() => useTableRows("t", grouped()))
    await waitFor(() => expect(result.current.leftOut).toBe(true))
    for (const wait of [5000, 15_000, 45_000]) await act(async () => void vi.advanceTimersByTime(wait + 1000))
    await waitFor(() => expect(result.current.refused ?? "").toMatch(/ungrouped/))
    // A row someone changed counts the view again, and this count has them.
    await tell({ action: "updated", row_id: "r3" })
    await waitFor(() => expect(result.current.groups).toEqual(everyGroup))
    expect(result.current.refused).toBeNull()
    expect(result.current.leftOut).toBe(false)
  })

  // DB-29: the notice's Try again counts once, at once.
  it("counts once when the reader tries again: the notice stays while it's left out, and the groups come when they're counted", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    leaveOut = 5
    const { result } = renderHook(() => useTableRows("t", grouped()))
    await waitFor(() => expect(result.current.leftOut).toBe(true))
    expect(result.current.recount).toBeNull()
    for (const wait of [5000, 15_000, 45_000]) await act(async () => void vi.advanceTimersByTime(wait + 1000))
    await waitFor(() => expect(result.current.recount).toBeTruthy())
    // Left out again: the rows stay ungrouped, and nothing asks again by itself.
    act(() => result.current.recount?.())
    expect(result.current.recounting).toBe(true)
    await waitFor(() => expect(result.current.recounting).toBe(false))
    expect(counts()).toHaveLength(5)
    expect(result.current.refused ?? "").toMatch(/ungrouped/)
    await act(async () => void vi.advanceTimersByTime(600_000))
    expect(counts()).toHaveLength(5)
    // Counted this time.
    act(() => result.current.recount?.())
    await waitFor(() => expect(result.current.groups).toEqual(everyGroup))
    expect(result.current.refused).toBeNull()
    expect(result.current.recount).toBeNull()
    expect(counts()).toHaveLength(6)
  })

  it("reads its windows again, without counting again, when a row someone changed moves to another group", async () => {
    const { result } = renderHook(() => useTableRows("t", grouped()))
    await waitFor(() => expect(result.current.groups).toEqual(everyGroup))
    await waitFor(() => expect(result.current.rows).toHaveLength(500))
    staged = { r0: "Lost" }
    queryRows.mockClear()
    await tell({ action: "updated", row_id: "r0" })
    await waitFor(() => expect(ids(result.current.rows)[0]).toBe("r3"))
    expect(result.current.groups).toEqual([
      { key: ["Won"], count: 399 },
      { key: ["Lost"], count: 401 },
      { key: ["Open"], count: 400 },
    ])
    expect(counts()).toHaveLength(1)
    expect(windowsFrom()).toEqual([""])
  })

  it("never draws the table's own first page while its first window comes", () => {
    const { result } = renderHook(() => useTableRows("t", grouped()))
    expect(result.current.rows).toHaveLength(0)
  })
})
