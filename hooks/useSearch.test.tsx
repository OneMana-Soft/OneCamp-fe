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
vi.mock("@/lib/axiosInstance", () => ({
  default: {
    get: (url: string) =>
      new Promise((resolve) => {
        pending.set(url, (data) => resolve({ data }))
      }),
  },
}))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {} }) }))

import { useSearch } from "./useSearch"

afterEach(() => {
  cleanup()
  pending.clear()
})

const wrapper = ({ children }: { children: ReactNode }) => (
  <Provider store={store}>
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>{children}</SWRConfig>
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
