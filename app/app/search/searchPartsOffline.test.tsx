import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen, waitFor } from "@testing-library/react"

// The filter chips are a chunk of their own. Offline, where
// lib/chunkRecovery doesn't reload the page, a part whose code can't come is
// nothing and the page carries on. React.lazy threw to the page's error
// screen, and kept the failure, so its Try again couldn't bring the page back.
vi.mock("@/components/search/queryFilters", () => {
  throw new Error("Loading chunk components/search/queryFilters failed")
})
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ replace: vi.fn(), back: vi.fn(), push: vi.fn() }),
}))
vi.mock("@/hooks/useFetch", () => ({ useFetchOnlyOnce: () => ({ data: undefined }), useFetch: () => ({ data: undefined }) }))
vi.mock("@/hooks/useBotKinds", () => ({ useBotKindMap: () => undefined }))
vi.mock("@/components/whoKnows/WhoKnowsStrip", () => ({ WhoKnowsStrip: () => null }))

const task = { type: "task", task: { task_id: "t1", task_name: "Launch task 1", task_project_name: "Q4 launch", created_date: 1791614952 } }
const searched = "launch plan"
vi.mock("@/hooks/useQuerySearch", () => ({
  useQuerySearch: () => ({
    inputValue: searched,
    setInputValue: vi.fn(),
    debouncedValue: searched,
    results: [task],
    resultsFor: searched,
    scope: "all",
    setScope: vi.fn(),
    sort: "best",
    setSort: vi.fn(),
    counts: { all: 1, messages: 0, tasks: 1, docs: 0, projects: 0, people: 0, channels: 0, files: 0 },
    total: 1,
    notes: [],
    isLoading: false,
    isRefreshing: false,
    isError: false,
    isRetrying: false,
    retry: vi.fn(),
    handleResultClick: vi.fn(),
    handlePreview: vi.fn(),
    handleSearchSubmit: vi.fn(),
    hasMore: false,
    loadMore: vi.fn(),
    isLoadingMore: false,
  }),
}))

const { default: SearchPage } = await import("@/app/app/search/page")

// The page reads the grammar with import(); unmounted after the case, its late
// arrival finds no page to update once the test's browser is gone.
afterEach(cleanup)

describe("a search page whose filter chips can't load", () => {
  it("keeps its heading and its results", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    render(<SearchPage />)
    const partsFailed = () => warn.mock.calls.filter(([said]) => String(said).startsWith("[lazyPart]")).length
    // Settled: the part said it failed (lib/lazy/lazyPart warns), or the page went with it.
    await waitFor(() => expect(partsFailed() >= 1 || !screen.queryByText("Launch task 1")).toBe(true))
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Search")
    expect(screen.getByText("Launch task 1")).toBeTruthy()
    warn.mockRestore()
  })
})
