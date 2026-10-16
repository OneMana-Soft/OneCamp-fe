import { act, cleanup, fireEvent, render } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { VirtualInfiniteScroll } from "./virtualInfiniteScroll"

// A list that loads more as it's scrolled to its end (a phone's project and
// task lists, recordings, activity) asks for one page at a time. A caller's
// page number moves a render before its request does, and for that render it
// isn't loading: a scroll then asked again, for the page after next, and the
// page between never reached the list. A phone's project list lost tasks 21
// to 25 of 25 that way (e2e/groupCounts.spec.ts, on a busy machine).

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const tasks = (n: number) => Array.from({ length: n }, (_, i) => `Task ${i + 1}`)

function List({ items, isLoading, onLoadMore }: { items: string[]; isLoading: boolean; onLoadMore: () => void }) {
  return <VirtualInfiniteScroll items={items} renderItem={(t: string) => <div>{t}</div>} onLoadMore={onLoadMore} isLoading={isLoading} hasMore keyExtractor={(t: string) => t} />
}

describe("a list that loads more at its end", () => {
  it("asks for the next page once, and again only when that page has come in or failed", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
    const asked: string[] = []
    const ask = (label: string) => () => void asked.push(label)
    const { container, rerender } = render(<List items={tasks(10)} isLoading={false} onLoadMore={ask("page 2")} />)
    const scroller = container.querySelector(".scrollbar-thin") as HTMLElement
    let at = 1000
    // To the end, and the 100 ms the list waits for the scrolling to stop.
    const scrollToEnd = () => {
      act(() => {
        scroller.scrollTop = at += 10
        fireEvent.scroll(scroller)
      })
      act(() => void vi.advanceTimersByTime(100))
    }

    scrollToEnd()
    expect(asked).toEqual(["page 2"])
    // The caller's page has moved and its request hasn't gone yet: not loading, for a render.
    rerender(<List items={tasks(10)} isLoading={false} onLoadMore={ask("page 3, too soon")} />)
    scrollToEnd()
    rerender(<List items={tasks(10)} isLoading onLoadMore={ask("page 3, while loading")} />)
    scrollToEnd()
    expect(asked).toEqual(["page 2"])
    // Page 2 is in: the next ask is for page 3.
    rerender(<List items={tasks(20)} isLoading={false} onLoadMore={ask("page 3")} />)
    scrollToEnd()
    expect(asked).toEqual(["page 2", "page 3"])
    // A load that failed (no new items) still lets the list ask again.
    rerender(<List items={tasks(20)} isLoading onLoadMore={ask("page 3 again")} />)
    rerender(<List items={tasks(20)} isLoading={false} onLoadMore={ask("page 3 again")} />)
    scrollToEnd()
    expect(asked).toEqual(["page 2", "page 3", "page 3 again"])
  })
})
