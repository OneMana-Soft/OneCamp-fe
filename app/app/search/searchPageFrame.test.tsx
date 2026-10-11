import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
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
vi.mock("@/hooks/useFetch", () => ({ useFetchOnlyOnce: () => ({ data: undefined }) }))
vi.mock("@/hooks/useClientConfig", async (orig) => ({ ...(await orig<typeof import("@/hooks/useClientConfig")>()), useAIAvailable: () => true }))
vi.mock("@/hooks/useBotKinds", () => ({ useBotKindMap: () => undefined }))

const task = (n: number) => ({ type: "task", task: { task_id: `t${n}`, task_name: `Launch task ${n}`, task_status: "todo", task_project_id: "p1", task_project_name: "Q4 launch", created_date: 1791614952 } })
const doc = { type: "doc", doc: { doc_uuid: "d1", doc_title: "Q4 launch plan", created_date: 1791614952 } }
let state = { results: [] as unknown[], isLoading: false, isError: false, debounced: "launch" }
vi.mock("@/hooks/useSearch", () => ({
  useSearch: () => ({
    inputValue: state.debounced,
    setInputValue: vi.fn(),
    debouncedValue: state.debounced,
    results: state.results,
    isLoading: state.isLoading,
    isRefreshing: false,
    isError: state.isError,
    retry: vi.fn(),
    handleResultClick: vi.fn(),
    handlePreview: vi.fn(),
    handleSearchSubmit: vi.fn(),
  }),
}))

const { default: SearchPage } = await import("@/app/app/search/page")
const PAGE = readFileSync(join(process.cwd(), "app/app/search/page.tsx"), "utf8")
const CSS = readFileSync(join(process.cwd(), "app/hub.css"), "utf8")

afterEach(() => {
  cleanup()
  query = "launch"
  state = { results: [], isLoading: false, isError: false, debounced: "launch" }
})

describe("the search page", () => {
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
    const field = document.querySelector("[data-search-field]")!
    expect(field.className).toContain("h-11")
    expect(field.className).toContain("rounded-[10px]")
    expect(field.className).toContain("hub-field")
    expect(CSS).toMatch(/\.hub-field \{\s*background: var\(--raised\);\s*box-shadow: var\(--e1\);/)
  })

  it("says the count without the arrow instruction", () => {
    state.results = [task(1), doc]
    render(<SearchPage />)
    expect(document.querySelector("[data-search-count]")!.textContent).toBe("2 results for “launch”")
  })

  it("groups the results by type, three of each under All, with Show all", () => {
    state.results = [task(1), task(2), task(3), task(4), doc]
    render(<SearchPage />)
    const groups = [...document.querySelectorAll("[data-search-group]")].map((g) => g.getAttribute("data-search-group"))
    expect(groups).toEqual(["tasks", "docs"])
    expect(document.querySelectorAll('[data-search-group="tasks"] [data-search-row]')).toHaveLength(3)
    const more = document.querySelector('[data-search-show-all="tasks"]')!
    expect(more.textContent).toBe("Show all 4 tasks")
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

  it("says nothing matched, start-aligned in the column, and offers no AI, even for a question", () => {
    render(<SearchPage />)
    const none = document.querySelector("[data-search-empty=none]")!
    expect(none.className).toContain("items-start")
    expect(none.querySelector("[data-hub-spot=search]")).toBeTruthy()
    expect(screen.getByText("Check the spelling, or try fewer words.")).toBeTruthy()
    expect(screen.queryByRole("button", { name: /Ask OneCamp AI/ })).toBeNull()
    cleanup()
    state.debounced = "where are we on the launch"
    render(<SearchPage />)
    expect(screen.queryByRole("button", { name: /Ask OneCamp AI/ })).toBeNull()
  })

  it("says search failed in a sunken card, never that nothing matches", () => {
    state.isError = true
    render(<SearchPage />)
    expect(screen.getByText("Search isn’t answering right now.")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy()
    expect(screen.queryByText(/Nothing matches/)).toBeNull()
  })

  it("never centres an empty state on the screen", () => {
    expect(PAGE).not.toMatch(/data-search-empty[^>]*items-center/)
  })
})
