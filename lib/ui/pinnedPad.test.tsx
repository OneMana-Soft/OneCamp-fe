import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, render } from "@testing-library/react"
import * as React from "react"
import { usePinnedPad } from "@/lib/ui/pinnedPad"

function Bar({ pinned }: { pinned: boolean }) {
  const ref = React.useRef<HTMLDivElement>(null)
  usePinnedPad(ref)
  return <div ref={ref} data-bar="" style={{ position: pinned ? "sticky" : "static", top: 0 }} />
}

const page = (pinned: boolean, padding = "") => (
  <div data-page="" style={{ overflowY: "auto", scrollPaddingTop: padding }}>
    <div>
      <Bar pinned={pinned} />
    </div>
  </div>
)
const scroller = () => document.querySelector<HTMLElement>("[data-page]")!
const bar = () => document.querySelector<HTMLElement>("[data-bar]")!

/**
 * A ResizeObserver that, as a browser's does, reports only on the elements it
 * observes: resize() calls each live observer back with what it watches.
 */
function fakeResizeObserver() {
  type Live = { callback: ResizeObserverCallback; watched: Set<Element>; self: ResizeObserver }
  const live = new Set<Live>()
  class Fake {
    private readonly live: Live
    constructor(callback: ResizeObserverCallback) {
      this.live = { callback, watched: new Set(), self: this as unknown as ResizeObserver }
      live.add(this.live)
    }
    observe(el: Element) {
      this.live.watched.add(el)
    }
    unobserve(el: Element) {
      this.live.watched.delete(el)
    }
    disconnect() {
      this.live.watched.clear()
      live.delete(this.live)
    }
  }
  vi.stubGlobal("ResizeObserver", Fake)
  return {
    resize: () =>
      act(() => {
        for (const o of live) {
          if (o.watched.size) o.callback([...o.watched].map((target) => ({ target }) as ResizeObserverEntry), o.self)
        }
      }),
  }
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe("a bar pinned over the top of its page's scroller", () => {
  it("pads the scroller's top by its height while it's pinned, so what the page brings into sight stops under it, and lets go as it goes", () => {
    // jsdom lays nothing out: the bar says its height.
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(96)
    const { unmount } = render(page(true))
    const box = scroller()
    expect(box.style.scrollPaddingTop).toBe("96px")
    unmount()
    expect(box.style.scrollPaddingTop).toBe("")
  })

  it("follows the bar's height while it's pinned, as a row opens in it, so a step's row never stops behind the taller bar", () => {
    const observer = fakeResizeObserver()
    let height = 96
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(() => height)
    render(page(true))
    expect(scroller().style.scrollPaddingTop).toBe("96px")
    // The Replace row opens: the bar is taller, and the padding follows it.
    height = 140
    observer.resize()
    expect(scroller().style.scrollPaddingTop).toBe("140px")
    // It closes again.
    height = 96
    observer.resize()
    expect(scroller().style.scrollPaddingTop).toBe("96px")
  })

  it("lets go of the padding when the bar stops being pinned while it's on the page (a phone turned past 640 px), and pads again when it's pinned again", () => {
    const observer = fakeResizeObserver()
    let height = 96
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(() => height)
    render(page(true))
    expect(scroller().style.scrollPaddingTop).toBe("96px")
    // Wider than a phone: the bar sits in the page's flow, and its width changed.
    bar().style.position = "static"
    observer.resize()
    expect(scroller().style.scrollPaddingTop).toBe("")
    // Turned back: pinned again, at the height it has now.
    bar().style.position = "sticky"
    height = 120
    observer.resize()
    expect(scroller().style.scrollPaddingTop).toBe("120px")
  })

  it("leaves the scroller's padding as it was while the bar sits in the page's flow, as it does on a computer", () => {
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(96)
    const { unmount } = render(page(false, "10px"))
    const box = scroller()
    expect(box.style.scrollPaddingTop).toBe("10px")
    unmount()
    expect(box.style.scrollPaddingTop).toBe("10px")
  })
})
