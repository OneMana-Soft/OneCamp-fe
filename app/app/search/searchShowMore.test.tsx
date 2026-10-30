import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"

// The page says the server's honest count while the search has more than it
// fetched (D-23: "137 results", every chip its own count, never "20+"), and
// Show more asks for the next page. With nothing more, it counts the rows it
// shows (SA-BUG-9).

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams("q=rollout"),
  useRouter: () => ({ replace: vi.fn(), back: vi.fn(), push: vi.fn() }),
}))
vi.mock("@/hooks/useFetch", () => ({ useFetchOnlyOnce: () => ({ data: undefined }), useFetch: () => ({ data: undefined }) }))
vi.mock("@/hooks/useClientConfig", async (orig) => ({ ...(await orig<typeof import("@/hooks/useClientConfig")>()), useAIAvailable: () => false }))
vi.mock("@/hooks/useBotKinds", () => ({ useBotKindMap: () => undefined }))
vi.mock("@/components/ai/SearchAnswer", () => ({ default: () => null }))
// Who knows asks its own endpoint; whoKnows.test.tsx and e2e/whoKnows.spec.ts cover it.
vi.mock("@/components/whoKnows/WhoKnowsStrip", () => ({ WhoKnowsStrip: () => null }))
vi.mock("@/components/ai/ConnectorSearchResults", () => ({ default: () => null }))

const task = (n: number) => ({ type: "task", task: { task_id: `t${n}`, task_name: `Rollout task ${n}`, task_project_name: "Q4", created_date: 1791614952 } })
const loadMore = vi.fn()
const none = { all: 0, messages: 0, tasks: 0, docs: 0, projects: 0, people: 0, channels: 0, files: 0 }
let state = { results: [] as unknown[], hasMore: false, counts: none }
vi.mock("@/hooks/useQuerySearch", () => ({
  useQuerySearch: () => ({
    inputValue: "rollout",
    setInputValue: vi.fn(),
    debouncedValue: "rollout",
    results: state.results,
    resultsFor: "rollout",
    scope: "all",
    setScope: vi.fn(),
    sort: "best",
    setSort: vi.fn(),
    counts: state.counts,
    total: state.counts.all,
    notes: [],
    isLoading: false,
    isRefreshing: false,
    isError: false,
    isRetrying: false,
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
  state = { results: [], hasMore: false, counts: none }
})

describe("a search with more than a page", () => {
  it("says the server's count, each chip its own, and Show more asks for the next page", async () => {
    state = { results: Array.from({ length: 20 }, (_, i) => task(i)), hasMore: true, counts: { ...none, all: 1137, tasks: 1137 } }
    render(<SearchPage />)
    await waitFor(() => expect(document.querySelector("[data-search-count]")!.textContent).toBe("1,137 results for “rollout”"))
    const chips = [...document.querySelectorAll("[data-scope-chips] [role=tab]")].map((c) => c.textContent)
    expect(chips).toEqual(["All1,137", "Tasks1,137"])
    expect(document.querySelector("[data-scope-chips]")!.textContent).not.toContain("+")
    expect(document.querySelector('[data-search-group="tasks"] h2')!.textContent).toBe("Tasks1,137")
    fireEvent.click(screen.getByRole("button", { name: "Show more" }))
    expect(loadMore).toHaveBeenCalledTimes(1)
  })

  it("counts what it shows, with no Show more, when there is nothing more", async () => {
    state = { results: [task(1), task(2)], hasMore: false, counts: { ...none, all: 2, tasks: 2 } }
    render(<SearchPage />)
    await waitFor(() => expect(document.querySelector("[data-search-count]")!.textContent).toBe("2 results for “rollout”"))
    expect(screen.queryByRole("button", { name: "Show more" })).toBeNull()
  })
})
