import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, renderHook, waitFor } from "@testing-library/react"
import { SWRConfig } from "swr"
import type { ReactNode } from "react"

// The search page's search on the one grammar (docs C2-1): what it asks the
// server for, the counts it shows (D-23: the server's while there's more, the
// rows once every page is in), Show more, and a failed search.

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }))
vi.mock("@/hooks/useDebounce", () => ({ useDebounce: <T,>(v: T) => v }))
vi.mock("@/hooks/useSearchResultActions", () => ({ useSearchResultActions: () => ({ handleResultClick: vi.fn(), handlePreview: vi.fn() }) }))
vi.mock("@/lib/utils/timeZone", () => ({ browserTZ: () => "Europe/London" }))
const asked = vi.fn()
vi.mock("@/lib/search/queryApi", async (orig) => ({
  ...(await orig<typeof import("@/lib/search/queryApi")>()),
  querySearch: (req: unknown) => asked(req),
}))

const { useQuerySearch } = await import("@/hooks/useQuerySearch")

const task = (n: number) => ({ type: "task", task: { task_id: `t${n}` } })
const answer = (page: unknown[], more: { totals: Record<string, number>; total: number; next?: string }, notes: unknown[] = []) => ({
  page,
  totals: more.totals,
  total: more.total,
  has_more: !!more.next,
  next: more.next,
  notes,
  query: { runs: true, text: "", issues: [] },
})

const wrapper = ({ children }: { children: ReactNode }) => <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>{children}</SWRConfig>

afterEach(() => {
  cleanup()
  asked.mockReset()
})

describe("the search page's search", () => {
  it("asks for the text as the server reads it, and shows the server's counts while there's more", async () => {
    asked.mockResolvedValue(answer([task(1), task(2)], { totals: { task: 40, doc: 3 }, total: 43, next: "n1" }))
    const { result } = renderHook(() => useQuerySearch({ initialQuery: "launch from:@sam" }), { wrapper })
    await waitFor(() => expect(result.current.results).toHaveLength(2))
    expect(asked).toHaveBeenLastCalledWith({ q: "launch from:@sam", zone: "Europe/London" })
    expect(result.current.counts).toMatchObject({ all: 43, tasks: 40, docs: 3 })
    expect(result.current.total).toBe(43)
    expect(result.current.hasMore).toBe(true)
  })

  it("asks the server for a chip's kinds and an order, and pages on with the cursor", async () => {
    asked.mockResolvedValueOnce(answer([task(1)], { totals: { task: 2 }, total: 2, next: "n1" }))
    const { result } = renderHook(() => useQuerySearch({ initialQuery: "launch" }), { wrapper })
    await waitFor(() => expect(result.current.results).toHaveLength(1))
    asked.mockResolvedValueOnce(answer([task(1)], { totals: { task: 2 }, total: 2, next: "n2" }))
    act(() => {
      result.current.setScope("tasks")
      result.current.setSort("oldest")
    })
    await waitFor(() => expect(asked).toHaveBeenLastCalledWith({ q: "launch", zone: "Europe/London", kinds: ["task"], sort: "oldest" }))
    await waitFor(() => expect(result.current.hasMore).toBe(true))
    // The last page: the count is the rows the pages showed, here one fewer
    // than the first page's count (a hit the graph dropped).
    asked.mockResolvedValueOnce(answer([], { totals: { task: 1 }, total: 1 }))
    await act(async () => {
      await result.current.loadMore()
    })
    expect(asked).toHaveBeenLastCalledWith(expect.objectContaining({ after: "n2", kinds: ["task"] }))
    expect(result.current.hasMore).toBe(false)
    expect(result.current.counts.tasks).toBe(1)
    expect(result.current.total).toBe(1)
  })

  it("says what the server read differently, once", async () => {
    asked.mockResolvedValue(
      answer([], { totals: {}, total: 0 }, [{ code: "unfiltered", span: [0, 0], level: "note", message: "Search can't filter by due: yet, so that part was left out." }]),
    )
    const { result } = renderHook(() => useQuerySearch({ initialQuery: "due:today launch" }), { wrapper })
    await waitFor(() => expect(result.current.notes).toEqual(["Search can't filter by due: yet, so that part was left out."]))
  })

  it("says a failed search failed, with no other search's rows", async () => {
    asked.mockRejectedValue(new Error("index down"))
    const { result } = renderHook(() => useQuerySearch({ initialQuery: "launch" }), { wrapper })
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.results).toHaveLength(0)
  })

  it("asks nothing for under two characters", () => {
    const { result } = renderHook(() => useQuerySearch({ initialQuery: "l" }), { wrapper })
    expect(asked).not.toHaveBeenCalled()
    expect(result.current.isLoading).toBe(false)
  })
})
