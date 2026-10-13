import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, render } from "@testing-library/react"

// Search said "20 results" for the first 20 of any number, with no way to
// the rest (SA-BUG-9). The hook says there is more while the server does,
// and Show more appends the page after the cursor the last page gave.

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock("react-redux", () => ({ useDispatch: () => vi.fn() }))
vi.mock("@/hooks/useDebounce", () => ({ useDebounce: <T,>(v: T) => v }))
const hit = (n: number) => ({ type: "task", task: { task_id: `t${n}`, task_name: `rollout ${n}` } })
const firstPage = { data: { page: Array.from({ length: 20 }, (_, i) => hit(i)), has_more: true, next: "cursor-1" } }
vi.mock("@/hooks/useFetch", () => ({
  useFetch: (url: string) => ({ data: url ? firstPage : undefined, isLoading: false }),
  useFetchOnlyOnce: () => ({ data: { data: { user_uuid: "me" } } }),
}))
const fetchSearchPage = vi.fn()
vi.mock("@/services/searchService", async (orig) => ({
  ...(await orig<typeof import("@/services/searchService")>()),
  fetchSearchPage: (q: string, after: string) => fetchSearchPage(q, after),
}))

const { useSearch } = await import("@/hooks/useSearch")

afterEach(() => {
  cleanup()
  fetchSearchPage.mockReset()
})

function probe() {
  const out: { current?: ReturnType<typeof useSearch> } = {}
  function Probe() {
    out.current = useSearch({ initialQuery: "rollout" })
    return null
  }
  render(<Probe />)
  return out
}

describe("search's Show more", () => {
  it("says there is more, and appends the page after the last one's cursor", async () => {
    fetchSearchPage.mockResolvedValueOnce({ page: [hit(20), hit(21), hit(22)], has_more: false })
    const s = probe()
    expect(s.current!.results).toHaveLength(20)
    expect(s.current!.hasMore).toBe(true)
    await act(async () => {
      await s.current!.loadMore()
    })
    expect(fetchSearchPage).toHaveBeenCalledWith("rollout", "cursor-1")
    expect(s.current!.results).toHaveLength(23)
    expect(s.current!.hasMore).toBe(false)
    // Nothing more to ask for.
    await act(async () => {
      await s.current!.loadMore()
    })
    expect(fetchSearchPage).toHaveBeenCalledTimes(1)
  })

  it("follows each page's own cursor", async () => {
    fetchSearchPage
      .mockResolvedValueOnce({ page: [hit(20)], has_more: true, next: "cursor-2" })
      .mockResolvedValueOnce({ page: [hit(21)], has_more: false })
    const s = probe()
    await act(async () => {
      await s.current!.loadMore()
    })
    await act(async () => {
      await s.current!.loadMore()
    })
    expect(fetchSearchPage.mock.calls.map((c) => c[1])).toEqual(["cursor-1", "cursor-2"])
    expect(s.current!.results).toHaveLength(22)
  })
})
