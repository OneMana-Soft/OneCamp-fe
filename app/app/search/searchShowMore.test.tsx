import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"

// The page says "20+ results" while the search has more than it fetched,
// marks every count "at least", and Show more asks for the next page
// (SA-BUG-9). With nothing more, it counts as before.

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams("q=rollout"),
  useRouter: () => ({ replace: vi.fn(), back: vi.fn(), push: vi.fn() }),
}))
vi.mock("@/hooks/useFetch", () => ({ useFetchOnlyOnce: () => ({ data: undefined }) }))
vi.mock("@/hooks/useClientConfig", async (orig) => ({ ...(await orig<typeof import("@/hooks/useClientConfig")>()), useAIAvailable: () => false }))
vi.mock("@/hooks/useBotKinds", () => ({ useBotKindMap: () => undefined }))
vi.mock("@/components/ai/SearchAnswer", () => ({ default: () => null }))
vi.mock("@/components/ai/ConnectorSearchResults", () => ({ default: () => null }))

const task = (n: number) => ({ type: "task", task: { task_id: `t${n}`, task_name: `Rollout task ${n}`, task_project_name: "Q4", created_date: 1791614952 } })
const loadMore = vi.fn()
let state = { results: [] as unknown[], hasMore: false }
vi.mock("@/hooks/useSearch", () => ({
  useSearch: () => ({
    inputValue: "rollout",
    setInputValue: vi.fn(),
    debouncedValue: "rollout",
    results: state.results,
    isLoading: false,
    isRefreshing: false,
    isError: false,
    retry: vi.fn(),
    handleResultClick: vi.fn(),
    handlePreview: vi.fn(),
    handleSearchSubmit: vi.fn(),
    hasMore: state.hasMore,
    loadMore,
    isLoadingMore: false,
  }),
}))

const { default: SearchPage } = await import("@/app/app/search/page")

afterEach(() => {
  cleanup()
  loadMore.mockReset()
  state = { results: [], hasMore: false }
})

describe("a search with more than a page", () => {
  it("says 20+ results, marks the chips, and Show more asks for the next page", () => {
    state = { results: Array.from({ length: 20 }, (_, i) => task(i)), hasMore: true }
    render(<SearchPage />)
    expect(document.querySelector("[data-search-count]")!.textContent).toBe("20+ results for “rollout”")
    const chips = document.querySelector("[data-scope-chips]")!
    expect(chips.textContent).toContain("20+")
    fireEvent.click(screen.getByRole("button", { name: "Show more" }))
    expect(loadMore).toHaveBeenCalledTimes(1)
  })

  it("counts as before, with no Show more, when there is nothing more", () => {
    state = { results: [task(1), task(2)], hasMore: false }
    render(<SearchPage />)
    expect(document.querySelector("[data-search-count]")!.textContent).toBe("2 results for “rollout”")
    expect(screen.queryByRole("button", { name: "Show more" })).toBeNull()
  })
})
