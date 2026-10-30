import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, renderHook, screen, waitFor } from "@testing-library/react"
import { useFreeWords } from "@/hooks/useFreeWords"

// The grammar reads a search's filters out of its words, and it is a chunk of
// its own. Who knows' place above the results waits on those words, so when
// the results came before the grammar, the place opened over them and pushed
// them down. A search without a colon has no filter: its words are known at
// once. A filtered one's list waits for its words, so the place is settled
// before the first result draws.

const grammar = vi.hoisted(() => {
  let arrive = () => {}
  const here = new Promise<void>((resolve) => {
    arrive = resolve
  })
  return { here, arrive: () => arrive() }
})
vi.mock("@/lib/search/query", async (orig) => {
  await grammar.here
  return orig()
})
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ replace: vi.fn(), back: vi.fn(), push: vi.fn() }),
}))
vi.mock("@/hooks/useFetch", () => ({ useFetchOnlyOnce: () => ({ data: undefined }), useFetch: () => ({ data: undefined }) }))
vi.mock("@/hooks/useBotKinds", () => ({ useBotKindMap: () => undefined }))
vi.mock("@/components/ai/SearchAnswer", () => ({ default: () => null }))
vi.mock("@/components/ai/ConnectorSearchResults", () => ({ default: () => null }))
vi.mock("@/components/whoKnows/WhoKnowsStrip", () => ({ WhoKnowsStrip: ({ words }: { words: string }) => <div data-who-knows={words} /> }))

const task = { type: "task", task: { task_id: "t1", task_name: "Launch task 1", task_project_name: "Q4 launch", created_date: 1791614952 } }
const counts = { all: 1, messages: 0, tasks: 1, docs: 0, projects: 0, people: 0, channels: 0, files: 0 }
let searched = "launch plan"
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
    counts,
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
const whoKnowsPlace = () => document.querySelector("[data-who-knows-strip], [data-who-knows]")

afterEach(cleanup)

describe("the search page before the grammar is here", () => {
  it("knows a search's words at once when it has no colon, and waits for the grammar when it has one", () => {
    expect(renderHook(() => useFreeWords("  launch plan  ")).result.current).toBe("launch plan")
    expect(renderHook(() => useFreeWords("launch plan from:@sam")).result.current).toBeUndefined()
  })

  it("draws a search without filters with Who knows' place above its first result", () => {
    searched = "launch plan"
    render(<SearchPage />)
    expect(screen.getByText("Launch task 1")).toBeTruthy()
    expect(whoKnowsPlace()).not.toBeNull()
  })

  it("holds a filtered search's count and results until its words are read, then draws them with Who knows' place", async () => {
    searched = "launch plan from:@sam"
    render(<SearchPage />)
    expect(screen.getByRole("status", { name: "Searching across all records" })).toBeTruthy()
    expect(screen.queryByText("Launch task 1")).toBeNull()
    expect(whoKnowsPlace()).toBeNull()
    // The count is announced (aria-live): never "1 result" over rows still loading.
    expect(document.querySelector("[data-search-count]")).toBeNull()

    grammar.arrive()
    await waitFor(() => expect(screen.getByText("Launch task 1")).toBeTruthy())
    expect(whoKnowsPlace()).not.toBeNull()
    expect(document.querySelector("[data-search-count]")).not.toBeNull()
    await waitFor(() => expect(document.querySelector("[data-who-knows]")?.getAttribute("data-who-knows")).toBe("launch plan"))
  })
})
