// Shared by the timeline's guards: what ProjectTimeline needs to render in
// jsdom, which lays nothing out (so every row is "visible") and has no store.
import { vi } from "vitest"

vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: ({ count, estimateSize, scrollMargin = 0 }: { count: number; estimateSize: (i: number) => number; scrollMargin?: number }) => {
    let start = scrollMargin
    const items = Array.from({ length: count }, (_, index) => {
      const item = { index, key: index, start, size: estimateSize(index) }
      start += item.size
      return item
    })
    return { getVirtualItems: () => items, getTotalSize: () => start - scrollMargin, scrollToIndex: () => {} }
  },
}))
vi.mock("@/hooks/useFetch", () => {
  const nothing = () => ({ data: undefined, isLoading: false, isError: false, mutate: () => Promise.resolve() })
  return { useFetch: nothing, useFetchOnlyOnce: nothing }
})
vi.mock("react-redux", async (orig) => ({ ...(await orig<typeof import("react-redux")>()), useSelector: () => "" }))
vi.mock("@/hooks/useTimelineView", async (orig) => ({ ...(await orig<typeof import("@/hooks/useTimelineView")>()), useTimelineView: ({ scrollRef }: { scrollRef: { current: HTMLDivElement | null } }) => ({ onScroll: () => {}, goToday: () => {}, scrollerRef: (el: HTMLDivElement | null) => void (scrollRef.current = el) }) }))
