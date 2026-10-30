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

// fluid-17 (FLUIDITY-LEAD's named run, a phone at 4x): each page arriving
// rendered the list, and the list made every row's element (373 on a long
// project list) for the dozen virtua draws, in the frame the page came in.
describe("a long list's render", () => {
  it("makes elements only for the rows virtua draws", () => {
    let made = 0
    const renderItem = (t: string) => {
      made++
      return <div>{t}</div>
    }
    const items = tasks(400)
    const list = (isLoading: boolean) => <VirtualInfiniteScroll items={items} renderItem={renderItem} onLoadMore={() => {}} isLoading={isLoading} keyExtractor={(t: string) => t} />
    const { rerender, getByText } = render(list(false))
    expect(getByText("Task 1")).toBeInTheDocument()
    expect(made).toBeLessThan(40)
    // A load starting draws the list again: still only its window.
    made = 0
    rerender(list(true))
    expect(made).toBeLessThan(40)
  })

  it("shows a row of a list with one row height as soon as it is placed", () => {
    // virtua hid each new row until measured (jsdom never measures), and drew it again to show it.
    const row = (itemSize?: number) => {
      const { getByText, unmount } = render(<VirtualInfiniteScroll items={tasks(3)} renderItem={(t: string) => <div>{t}</div>} onLoadMore={() => {}} itemSize={itemSize} />)
      const item = getByText("Task 1").parentElement!.parentElement as HTMLElement
      // virtua's box is hidden, and each row says visible itself once shown.
      const shown = [item.parentElement!.style.visibility, item.style.visibility]
      unmount()
      return shown
    }
    expect(row(56)).toEqual(["hidden", "visible"])
    // A list whose rows vary keeps virtua's way.
    expect(row()).toEqual(["hidden", "hidden"])
  })

  it("still ends with the loading row and the end message", () => {
    const { getByText, rerender } = render(<VirtualInfiniteScroll items={tasks(3)} renderItem={(t: string) => <div>{t}</div>} onLoadMore={() => {}} isLoading />)
    expect(getByText("Loading more…")).toBeInTheDocument()
    rerender(<VirtualInfiniteScroll items={tasks(3)} renderItem={(t: string) => <div>{t}</div>} onLoadMore={() => {}} hasMore={false} endMessage={<span>All caught up</span>} />)
    expect(getByText("Task 3")).toBeInTheDocument()
    expect(getByText("All caught up")).toBeInTheDocument()
  })
})

// A band over a list (the Inbox's who filter, app/hub.css) draws a hairline
// only while rows run under it: the list's scroller says when it has more
// above or below, as an overlay's body does (components/ui/moreMarks).
describe("a list's edges", () => {
  it("says when its scroller has more above or below", () => {
    const { container } = render(<List items={tasks(40)} isLoading={false} onLoadMore={() => {}} />)
    const scroller = container.querySelector(".scrollbar-thin") as HTMLElement
    // jsdom lays nothing out: the sizes a browser would give.
    Object.defineProperty(scroller, "clientHeight", { configurable: true, value: 300 })
    Object.defineProperty(scroller, "scrollHeight", { configurable: true, value: 1600 })
    fireEvent.scroll(scroller)
    expect([scroller.hasAttribute("data-more-above"), scroller.hasAttribute("data-more-below")]).toEqual([false, true])
    act(() => {
      scroller.scrollTop = 1300
      fireEvent.scroll(scroller)
    })
    expect([scroller.hasAttribute("data-more-above"), scroller.hasAttribute("data-more-below")]).toEqual([true, false])
  })
})
