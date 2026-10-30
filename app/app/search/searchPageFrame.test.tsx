import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { readFileSync } from "node:fs"
import { join } from "node:path"

// The search page, design v3 (hub.md S7, S8, S9, S13): a 52px header with a
// ghost back and "Search", the hub's 760px column, a raised 44px field,
// scope chips, the count line, results grouped by type, and every state
// start-aligned in the column.

let query = "launch"
const push = vi.fn()
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(query ? `q=${encodeURIComponent(query)}` : ""),
  useRouter: () => ({ replace: vi.fn(), back: vi.fn(), push }),
}))
vi.mock("@/hooks/useFetch", () => ({ useFetchOnlyOnce: () => ({ data: undefined }), useFetch: () => ({ data: undefined }) }))
vi.mock("@/hooks/useClientConfig", async (orig) => ({ ...(await orig<typeof import("@/hooks/useClientConfig")>()), useAIAvailable: () => true }))
vi.mock("@/hooks/useBotKinds", () => ({ useBotKindMap: () => undefined }))
vi.mock("@/components/ai/SearchAnswer", () => ({ default: () => null }))
// Who knows asks its own endpoint; whoKnows.test.tsx and e2e/whoKnows.spec.ts cover it.
vi.mock("@/components/whoKnows/WhoKnowsStrip", () => ({ WhoKnowsStrip: ({ words }: { words: string }) => <div data-who-knows={words} /> }))
vi.mock("@/components/ai/ConnectorSearchResults", () => ({ default: () => null }))
const toasted = vi.hoisted(() => vi.fn(() => ({ id: "t", dismiss: () => {}, update: () => {} })))
vi.mock("@/hooks/use-toast", async (orig) => ({ ...(await orig<typeof import("@/hooks/use-toast")>()), toast: toasted }))

const task = (n: number) => ({ type: "task", task: { task_id: `t${n}`, task_name: `Launch task ${n}`, task_status: "todo", task_project_id: "p1", task_project_name: "Q4 launch", created_date: 1791614952 } })
const doc = { type: "doc", doc: { doc_uuid: "d1", doc_title: "Q4 launch plan", created_date: 1791614952 } }
let state = { results: [] as unknown[], isLoading: false, isError: false, debounced: "launch" }
// The page's search, as the hook gives it: the chip on show is the hook's
// state, so Show all re-renders, and the counts are the rows' own (a complete
// listing, D-23).
vi.mock("@/hooks/useQuerySearch", async () => {
  const React = await import("react")
  const { scopeCounts } = await import("@/lib/search/scopes")
  return {
    useQuerySearch: () => {
      const [scope, setScope] = React.useState<"all" | "tasks" | "docs">("all")
      const counts = scopeCounts(state.results as never)
      return {
        inputValue: state.debounced,
        setInputValue: vi.fn(),
        debouncedValue: state.debounced,
        results: state.results,
        resultsFor: state.results.length ? state.debounced : "",
        scope,
        setScope,
        sort: "best",
        setSort: vi.fn(),
        counts,
        total: counts[scope],
        notes: [],
        isLoading: state.isLoading,
        isRefreshing: false,
        isError: state.isError,
        isRetrying: false,
        retry: vi.fn(),
        handleResultClick: vi.fn(),
        handlePreview: vi.fn(),
        handleSearchSubmit: vi.fn(),
        hasMore: false,
        loadMore: vi.fn(),
        isLoadingMore: false,
      }
    },
  }
})

const { default: SearchPage } = await import("@/app/app/search/page")
const PAGE = readFileSync(join(process.cwd(), "app/app/search/page.tsx"), "utf8")

afterEach(() => {
  cleanup()
  query = "launch"
  state = { results: [], isLoading: false, isError: false, debounced: "launch" }
})

describe("the search page", () => {
  it("asks Who knows about the words searched, not the filters", async () => {
    state = { ...state, results: [task(1)], debounced: "launch plan from:@sam -in:#secret" }
    render(<SearchPage />)
    await waitFor(() => expect(document.querySelector("[data-who-knows]")?.getAttribute("data-who-knows")).toBe("launch plan"))
  })

  it("has a 52px header with a ghost back and the page's name, from sm up", () => {
    render(<SearchPage />)
    const row = document.querySelector("[data-search-title-row]")!
    expect(row.className.split(" ")).toEqual(expect.arrayContaining(["hidden", "sm:flex", "h-[52px]"]))
    expect(screen.getByRole("button", { name: "Go back" })).toBeTruthy()
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Search")
  })

  it("puts everything in the hub's 760px column, and the field at 44px, r10, raised at e1", () => {
    render(<SearchPage />)
    expect(document.querySelector("[data-search-column]")!.className).toContain("max-w-[760px]")
    // The shared search field (SearchInput, an input group) at its large size:
    // the group is the field, raised at e1 (field-surface) with the halo on focus.
    const field = document.querySelector("[data-search-column] [data-search-input]")!
    expect(field.className).toContain("h-11")
    expect(field.className).toContain("rounded-[10px]")
    expect(field.className).toContain("field-surface")
    expect(field.className).not.toContain("md:h-8")
  })

  it("says the count without the arrow instruction", async () => {
    state.results = [task(1), doc]
    render(<SearchPage />)
    await waitFor(() => expect(document.querySelector("[data-search-count]")!.textContent).toBe("2 results for “launch”"))
  })

  // The count spelled out the whole search, filters and all, and a dated one
  // wrapped at 390 round a lone "·". It names the
  // words alone, and only the count when there are none; the chips say the rest.
  it("names the words alone in the count, and no words when the search has only filters", async () => {
    state = { ...state, results: [task(1), doc], debounced: "launch after:2026-10-01 from:@sam" }
    const { unmount } = render(<SearchPage />)
    await waitFor(() => expect(document.querySelector("[data-search-count]")!.textContent).toBe("2 results for “launch”"))
    unmount()
    state = { ...state, debounced: "from:@sam after:2026-10-01" }
    render(<SearchPage />)
    await waitFor(() => expect(document.querySelector("[data-search-count]")!.textContent).toBe("2 results"))
  })

  it("groups the results by type, three of each under All, with Show all", () => {
    state.results = [task(1), task(2), task(3), task(4), doc]
    render(<SearchPage />)
    const groups = [...document.querySelectorAll("[data-search-group]")].map((g) => g.getAttribute("data-search-group"))
    expect(groups).toEqual(["tasks", "docs"])
    expect(document.querySelectorAll('[data-search-group="tasks"] [data-search-row]')).toHaveLength(3)
    const more = document.querySelector('[data-search-show-all="tasks"]')!
    expect(more.textContent).toBe("Show all 4 tasks")
    // A link to the kind's own list, apart from Show more: link ink and a chevron.
    expect(more.className).toContain("text-brand-text")
    expect(more.querySelector("svg")).toBeTruthy()
    fireEvent.click(more)
    expect(document.querySelectorAll('[data-search-group="tasks"] [data-search-row]')).toHaveLength(4)
    expect(document.querySelector('[data-search-group="docs"]')).toBeNull()
  })

  it("shows a scope chip only for types with results, All always, under one sliding knob", () => {
    state.results = [task(1), doc]
    render(<SearchPage />)
    const chips = [...document.querySelectorAll("[data-scope-chips] [role=tab]")].map((c) => c.textContent)
    expect(chips).toEqual(["All2", "Tasks1", "Docs1"])
    expect(document.querySelectorAll("[data-scope-knob]")).toHaveLength(1)
  })

  it("loads in six row-shaped skeletons", () => {
    state.isLoading = true
    render(<SearchPage />)
    expect(screen.getByRole("status", { name: "Searching across all records" }).querySelectorAll("[data-hub-skeleton][data-density=two-line]")).toHaveLength(6)
  })

  it("says nothing matched, start-aligned in the column, and offers the AI only for a question", () => {
    render(<SearchPage />)
    const none = document.querySelector("[data-search-empty=none]")!
    expect(none.className).toContain("items-start")
    expect(none.querySelector("[data-hub-spot=search]")).toBeTruthy()
    expect(screen.getByText("Check the spelling, or try fewer words.")).toBeTruthy()
    expect(screen.queryByRole("button", { name: /Ask OneCamp AI/ })).toBeNull()
    cleanup()
    state.debounced = "where are we on the launch"
    render(<SearchPage />)
    fireEvent.click(screen.getByRole("button", { name: /Ask OneCamp AI/ }))
    expect(push).toHaveBeenCalledWith("/app/ai?ask=where%20are%20we%20on%20the%20launch")
  })

  it("says this query's search failed, in place of the results, never that nothing matches", () => {
    state.isError = true
    render(<SearchPage />)
    expect(screen.getByRole("heading", { name: "Couldn't load results for “launch”" })).toBeTruthy()
    expect(screen.getByRole("button", { name: /Try again/ })).toBeTruthy()
    expect(screen.queryByText(/Nothing matches/)).toBeNull()
    expect(document.querySelector("[data-search-results]")).toBeNull()
  })

  // Design review PG1-03 (14 Oct 2026): a failed search drew its own card and,
  // at the same time, the global toast "Something went wrong". Said once.
  it("says a failed search once: in its card, with no toast over it", async () => {
    const { tellReadFailure, READ_FAILURE_BEAT_MS } = await import("@/lib/http/loadFailure")
    vi.useFakeTimers()
    try {
      // With nothing on screen to say it, a failed read is a toast.
      toasted.mockClear()
      tellReadFailure({ response: { status: 503, data: { msg: "The server is busy" } } })
      await vi.advanceTimersByTimeAsync(READ_FAILURE_BEAT_MS + 50)
      expect(toasted).toHaveBeenCalledTimes(1)
      // The failed search's card says it, and the toast stays quiet.
      state.isError = true
      render(<SearchPage />)
      toasted.mockClear()
      tellReadFailure({ response: { status: 500, data: { msg: "Search is down" } } })
      await vi.advanceTimersByTimeAsync(READ_FAILURE_BEAT_MS + 50)
      expect(toasted).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it("never centres an empty state on the screen", () => {
    expect(PAGE).not.toMatch(/data-search-empty[^>]*items-center/)
  })
})
