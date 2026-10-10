import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, render, renderHook } from "@testing-library/react"
import { Provider } from "react-redux"

// Active, Archived and Discover draw in one frame (channelListFrame):
//  - first load: Active and Archived drew nothing, Discover a generic
//    skeleton of 40px round avatars outside the list's column;
//  - a failed load: Discover said "All caught up!";
//  - a search: Active and Archived emptied their rows until the answer came.

const state = { loading: false, error: false }
vi.mock("@/hooks/useFetch", () => ({
  useFetch: () => ({ data: undefined, isLoading: state.loading, isError: state.error, mutate: vi.fn() }),
}))
vi.mock("@/hooks/useApi", () => ({
  useApi: () => ({ data: undefined, isLoading: state.loading, isError: state.error, mutate: vi.fn() }),
}))
vi.mock("@/hooks/usePost", () => ({ usePost: () => ({ makeRequest: vi.fn(async () => []), isSubmitting: false }) }))

const { default: store } = await import("@/store/store")
const { ChannelListTabActive } = await import("./channelListTabActive")
const { ChannelListTabArchive } = await import("./channelListTabArchive")
const { ChannelListTabAllActive } = await import("./channelListTabAllActive")
const { useRowsWhileSearching } = await import("./channelListFrame")

afterEach(() => {
  cleanup()
  state.loading = false
  state.error = false
})

const TABS = [
  ["Active", () => <ChannelListTabActive searchQuery="" />],
  ["Archived", () => <ChannelListTabArchive searchQuery="" />],
  ["Discover", () => <ChannelListTabAllActive searchQuery="" />],
] as const

const draw = (Tab: () => React.ReactElement) => render(<Provider store={store}>{Tab()}</Provider>)

describe("every channel tab", () => {
  it.each(TABS)("%s loads with the rows' own skeleton, in the list's column", (_name, Tab) => {
    state.loading = true
    const { container } = draw(Tab)
    const sk = container.querySelector("[data-channel-skeleton]")!
    expect(sk).toBeTruthy()
    expect(sk.className).toContain("max-w-[880px]")
    expect(sk.querySelector(".size-8.rounded-md")).toBeTruthy()
    expect(container.querySelector(".rounded-full.h-10")).toBeNull()
  })

  it.each(TABS)("%s says a failed load failed, in the shared place", (_name, Tab) => {
    state.error = true
    const { container } = draw(Tab)
    const slot = container.querySelector("[data-channel-state]")!
    expect(slot).toBeTruthy()
    expect(slot.textContent).not.toContain("All caught up")
    expect(slot.querySelector("button")?.textContent).toMatch(/try again/i)
  })
})

describe("a search on its way", () => {
  it("keeps the rows already shown, marked stale, until its answer", () => {
    const first = ["a", "b"]
    const { result, rerender } = renderHook(({ rows, pending }) => useRowsWhileSearching(rows, pending), {
      initialProps: { rows: first, pending: false },
    })
    act(() => rerender({ rows: [] as string[], pending: true }))
    expect(result.current).toEqual({ rows: first, stale: true })
    act(() => rerender({ rows: ["b"], pending: false }))
    expect(result.current).toEqual({ rows: ["b"], stale: false })
  })
})
