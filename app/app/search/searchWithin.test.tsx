import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"

// Search from a channel's header searches that channel (QA F-15): the scope is
// said as a chip, kept as the address follows typing, and removable.

let address = "query=launch&channel=c1"
const replace = vi.fn()
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(address),
  useRouter: () => ({ replace, back: vi.fn(), push: vi.fn() }),
}))
vi.mock("@/hooks/useFetch", () => ({
  useFetchOnlyOnce: (url: string) =>
    url === "/user/sidebarNav" ? { data: { data: { user_channels: [{ ch_uuid: "c1", ch_name: "engineering" }] } } } : { data: undefined },
}))
vi.mock("@/hooks/useClientConfig", async (orig) => ({ ...(await orig<typeof import("@/hooks/useClientConfig")>()), useAIAvailable: () => false }))
vi.mock("@/hooks/useBotKinds", () => ({ useBotKindMap: () => undefined }))
vi.mock("@/components/ai/SearchAnswer", () => ({ default: () => null }))
vi.mock("@/components/ai/ConnectorSearchResults", () => ({ default: () => null }))
const searched = vi.fn()
vi.mock("@/hooks/useSearch", () => ({
  useSearch: (props: unknown) => {
    searched(props)
    return {
      inputValue: "launch",
      setInputValue: vi.fn(),
      debouncedValue: "launch",
      results: [],
      isLoading: false,
      isRefreshing: false,
      isError: false,
      retry: vi.fn(),
      handleResultClick: vi.fn(),
      handlePreview: vi.fn(),
      handleSearchSubmit: vi.fn(),
      hasMore: false,
      loadMore: vi.fn(),
      isLoadingMore: false,
    }
  },
}))

const { default: SearchPage } = await import("@/app/app/search/page")

afterEach(() => {
  cleanup()
  replace.mockReset()
  searched.mockReset()
  address = "query=launch&channel=c1"
})

describe("a search from a channel's header", () => {
  it("searches the channel, and says so", () => {
    render(<SearchPage />)
    expect(searched).toHaveBeenLastCalledWith(expect.objectContaining({ within: { kind: "channel", id: "c1" } }))
    expect(document.querySelector("[data-search-within]")!.textContent).toBe("In #engineering")
    expect(screen.getByRole("searchbox", { name: "Search" }).getAttribute("placeholder")).toBe("Search in #engineering…")
  })

  it("searches everywhere once the scope is taken off, with the same words", () => {
    render(<SearchPage />)
    fireEvent.click(screen.getByRole("button", { name: "Search everywhere, not only in #engineering" }))
    expect(replace).toHaveBeenCalledWith("/app/search?query=launch", { scroll: false })
  })

  it("is a plain search without a scope", () => {
    address = "query=launch"
    render(<SearchPage />)
    expect(searched).toHaveBeenLastCalledWith(expect.objectContaining({ within: null }))
    expect(document.querySelector("[data-search-within]")).toBeNull()
  })
})
