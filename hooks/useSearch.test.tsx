import { afterEach, describe, expect, it, vi } from "vitest"
import type { ReactNode } from "react"
import { Provider } from "react-redux"
import { SWRConfig } from "swr"
import { act, cleanup, renderHook, waitFor } from "@testing-library/react"
import store from "@/store/store"

// Refining a search keeps the last answer up until the next one arrives. Each
// new query was a new cache key with nothing in it, so the results blinked to
// a skeleton and back on every pause in typing, and the command palette
// swapped its commands in and out under the cursor.

const pending = new Map<string, (data: unknown) => void>()
const failing = new Map<string, (status: number) => void>()
vi.mock("@/lib/axiosInstance", async () => (await import("@/lib/testing/axiosInstance")).axiosInstanceModule({
  default: {
    get: (url: string) =>
      new Promise((resolve, reject) => {
        pending.set(url, (data) => resolve({ data }))
        failing.set(url, (status) => reject(Object.assign(new Error(`Request failed with status code ${status}`), { response: { status, data: {} } })))
      }),
  },
}))
const { push } = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }))

import { useSearch } from "./useSearch"

afterEach(() => {
  cleanup()
  pending.clear()
  failing.clear()
  push.mockClear()
})

const wrapper = ({ children }: { children: ReactNode }) => (
  <Provider store={store}>
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0, shouldRetryOnError: false }}>{children}</SWRConfig>
  </Provider>
)

const answer = (match: string, title: string) => {
  const url = [...pending.keys()].find((u) => u.includes(match))
  expect(url, `a request for ${match}`).toBeTruthy()
  act(() => pending.get(url!)!({ data: { page: [{ type: "doc", doc: { doc_uuid: title, doc_title: title } }] } }))
}

describe("search while typing", () => {
  it("keeps the last results, not a skeleton, while a refined query loads", async () => {
    const { result } = renderHook(() => useSearch({ debounceMs: 0 }), { wrapper })
    act(() => result.current.setInputValue("laun"))
    await waitFor(() => expect([...pending.keys()].some((u) => u.includes("laun"))).toBe(true))
    expect(result.current.isLoading).toBe(true)
    answer("laun", "Q4 launch plan")
    await waitFor(() => expect(result.current.results).toHaveLength(1))

    act(() => result.current.setInputValue("launch p"))
    await waitFor(() => expect([...pending.keys()].some((u) => u.includes("launch%20p") || u.includes("launch p"))).toBe(true))
    // The second answer hasn't come: the first one is still what's shown.
    expect(result.current.isLoading).toBe(false)
    expect(result.current.results).toHaveLength(1)
  })

  it("shows nothing for a query too short to send", async () => {
    const { result } = renderHook(() => useSearch({ debounceMs: 0 }), { wrapper })
    act(() => result.current.setInputValue("l"))
    await new Promise((r) => setTimeout(r, 10))
    expect(result.current.results).toEqual([])
    expect(result.current.isLoading).toBe(false)
  })
})

describe("a search that fails", () => {
  // QA DSA-04 (14 Oct 2026): a new query whose search failed kept the last
  // query's results, under "1 result for" the new words, and said nothing.
  it("says so, and never shows the last query's results under the new one", async () => {
    const { result } = renderHook(() => useSearch({ debounceMs: 0 }), { wrapper })
    act(() => result.current.setInputValue("laun"))
    await waitFor(() => expect([...pending.keys()].some((u) => u.includes("laun"))).toBe(true))
    answer("laun", "Q4 launch plan")
    await waitFor(() => expect(result.current.results).toHaveLength(1))
    expect(result.current.resultsFor).toBe("laun")

    act(() => result.current.setInputValue("roadmap"))
    await waitFor(() => expect([...failing.keys()].some((u) => u.includes("roadmap"))).toBe(true))
    // While the new answer is on its way, the last one stands, said as the last one's.
    expect(result.current.results).toHaveLength(1)
    expect(result.current.resultsFor).toBe("laun")
    const url = [...failing.keys()].find((u) => u.includes("roadmap"))!
    act(() => failing.get(url)!(500))
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.results).toEqual([])
    expect(result.current.resultsFor).toBe("")
    expect(result.current.isLoading).toBe(false)
    expect(result.current.hasMore).toBe(false)
  })
})

describe("Enter in the search field", () => {
  // QA F-15: a search from a conversation's header searches that conversation,
  // and the page says so with a chip. Enter in its field opened the whole
  // workspace's search for the same words, with the conversation dropped.
  it("keeps a search narrowed to one conversation narrowed", () => {
    const { result } = renderHook(() => useSearch({ initialQuery: "launch", debounceMs: 0, within: { kind: "channel", id: "c1" } }), { wrapper })
    act(() => result.current.handleSearchSubmit())
    expect(push).toHaveBeenLastCalledWith("/app/search?query=launch&channel=c1")
  })

  it("searches everywhere when the search is everywhere", () => {
    const { result } = renderHook(() => useSearch({ initialQuery: " launch ", debounceMs: 0 }), { wrapper })
    act(() => result.current.handleSearchSubmit())
    expect(push).toHaveBeenLastCalledWith("/app/search?query=launch")
  })
})
