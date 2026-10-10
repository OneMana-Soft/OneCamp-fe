import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"

// The search page on one set of lines (the final visual check, 10 Oct): the
// back arrow in the results' glyph column and the title on their words' line,
// the box as wide as the rows, every state in one frame, and a skeleton in the
// rows' shape.

let query = "launch"
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(query ? `q=${query}` : ""),
  useRouter: () => ({ replace: vi.fn(), back: vi.fn(), push: vi.fn() }),
}))
vi.mock("@/hooks/useFetch", () => ({ useFetchOnlyOnce: () => ({ data: undefined }) }))
vi.mock("@/components/ai/SearchAnswer", () => ({ default: () => null }))
vi.mock("@/components/ai/ConnectorSearchResults", () => ({ default: () => null }))
vi.mock("@/lib/utils/helpers/search", () => ({
  getIcon: () => <span data-testid="tile" />,
  getHighlightedTitle: (r: { title: string }) => r.title,
  getHighlightedContext: () => "Q4 launch · Sam Rivera",
  isResultPreviewable: () => false,
  searchResultKeys: (rs: unknown[]) => rs.map((_, i) => String(i)),
}))
let state = { results: [] as { title: string }[], isLoading: false, debounced: "launch" }
vi.mock("@/hooks/useSearch", () => ({
  useSearch: () => ({
    inputValue: state.debounced,
    setInputValue: vi.fn(),
    debouncedValue: state.debounced,
    results: state.results,
    isLoading: state.isLoading,
    isRefreshing: false,
    handleResultClick: vi.fn(),
    handlePreview: vi.fn(),
    handleSearchSubmit: vi.fn(),
  }),
}))

const { default: SearchPage } = await import("@/app/app/search/page")

afterEach(() => {
  cleanup()
  query = "launch"
  state = { results: [], isLoading: false, debounced: "launch" }
})

describe("the search page", () => {
  it("puts the back arrow in the results' glyph column and the title on their words' line", () => {
    state.results = [{ title: "Q4 launch" }]
    render(<SearchPage />)
    const back = screen.getByRole("button", { name: "Go back" })
    // 8px gap after a 32px button pulled 4px into the gutter: the arrow's
    // centre is the tiles' centre and the title starts where row text does.
    expect(back.className).toContain("-ml-1")
    expect(back.parentElement!.className).toContain("gap-2")
    // The header's column is the results' column, so the box ends where the rows do.
    const header = screen.getByRole("heading", { level: 1 }).closest(".max-w-3xl")
    expect(header).not.toBeNull()
    expect(screen.getByRole("search").className).not.toContain("max-w-2xl")
  })

  it("leaves its name to the phone's top bar: the back-and-title row shows from sm up", () => {
    render(<SearchPage />)
    const row = document.querySelector("[data-search-title-row]")!
    expect(row.className.split(" ")).toEqual(expect.arrayContaining(["hidden", "sm:flex"]))
    // The empty state's heading says what to do, not the page's name again.
    expect(screen.queryByRole("heading", { name: "Search", exact: true, level: 2 })).toBeNull()
  })

  it("says nothing was found and that there is nothing yet in one frame", () => {
    render(<SearchPage />)
    const none = screen.getByRole("heading", { name: /Nothing matches/ }).parentElement!
    cleanup()
    query = ""
    state = { results: [], isLoading: false, debounced: "" }
    render(<SearchPage />)
    const blank = screen.getByRole("heading", { name: "Search your workspace" }).parentElement!
    expect(blank.className).toBe(none.className)
    // Both with the magnifier above their words.
    expect(blank.querySelector("svg")).not.toBeNull()
  })

  it("loads in the rows' shape: a 24px tile, a 20px title line and an 18px line, in the rows' padding", () => {
    state.isLoading = true
    const { container } = render(<SearchPage />)
    expect(screen.getByRole("status", { name: "Searching across all records" })).toBeTruthy()
    // The count's line is held while it loads, so the rows land where the skeleton was.
    expect(container.querySelector('p[aria-live="polite"]')?.className).toContain("h-[18px]")
    const row = container.querySelector("[data-search-skeleton-row]")!
    expect(row.className).toContain("px-2")
    expect(row.className).toContain("py-3")
    expect(row.className).toContain("gap-3")
    const [tile, lines] = [...row.children]
    expect(tile.className).toContain("size-6")
    expect(lines.children[0].className).toContain("h-5")
    expect(lines.children[1].className).toContain("h-[18px]")
  })
})
