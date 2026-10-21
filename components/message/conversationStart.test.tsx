import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render } from "@testing-library/react"
import { createRef, forwardRef, useImperativeHandle, type ReactNode } from "react"
import type { VListHandle } from "virtua"
import type { FlatItem } from "@/types/virtual"

// A conversation reads from the bottom (Slack, Discord): a short one sits at
// its end, just above the composer, with where it began over its first
// message, and it stays at its end when the list itself gets shorter. The
// demo's channels and DMs (four to seven messages each) hung at the top of an
// empty sheet with a hole down to the composer, and a long draft growing the
// composer slid the last messages out of sight while you answered them.

const handle = {
  scrollToIndex: vi.fn(),
  findStartIndex: () => 0,
  getItemOffset: () => 0,
  scrollOffset: 0,
  scrollSize: 2000,
  viewportSize: 600,
}
let reportScroll: (offset: number) => void = () => {}
vi.mock("virtua", () => ({
  Virtualizer: forwardRef(function FakeVirtualizer({ children, onScroll }: { children: ReactNode; onScroll?: (o: number) => void }, ref) {
    useImperativeHandle(ref, () => handle)
    reportScroll = (o) => onScroll?.(o)
    return <div>{children}</div>
  }),
}))

// jsdom has no ResizeObserver: this one records what is watched, and lets a
// test say that something changed size.
const observed: Element[] = []
let resized: () => void = () => {}
class FakeResizeObserver {
  constructor(cb: () => void) {
    resized = cb
  }
  observe(el: Element) {
    observed.push(el)
  }
  disconnect() {}
  unobserve() {}
}

const { MessageListVirtua } = await import("./MessageListVirtua")

type Msg = { id: string }
const items = (n: number): FlatItem<Msg>[] => [
  { type: "separator", key: "sep-1", date: "2026-10-10" },
  ...Array.from({ length: n }, (_, i): FlatItem<Msg> => ({ type: "item", key: `m${i + 1}`, data: { id: `m${i + 1}` } })),
]
const cache = new Map<string, FlatItem<Msg>>()
const stable = (list: FlatItem<Msg>[]) => list.map((i) => cache.get(i.key) ?? cache.set(i.key, i).get(i.key)!)
const list = (its: FlatItem<Msg>[], extra: Record<string, unknown> = {}) => (
  <MessageListVirtua
    items={stable(its)}
    renderItem={(m: Msg) => <p>{m.id}</p>}
    getDateHeading={(d) => d}
    fetchOlderMessage={() => {}}
    fetchNewMessage={() => {}}
    hasOldMessage={false}
    hasNewMessage={false}
    clickedScrollToBottom={() => {}}
    ref={createRef<VListHandle>()}
    start={<p>This is the start of #design</p>}
    {...extra}
  />
)

beforeEach(() => {
  handle.scrollToIndex.mockReset()
  observed.length = 0
  cache.clear()
  vi.stubGlobal("ResizeObserver", FakeResizeObserver)
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe("a short conversation", () => {
  it("sits at its end, above the composer, not at the top of an empty sheet", () => {
    const { container } = render(list(items(3)))
    const scroller = container.querySelector<HTMLElement>('div[style*="overflow-y: auto"]')!
    expect(scroller.className).toContain("flex-col")
    const content = container.querySelector<HTMLElement>("[data-list-content]")!
    expect(content.parentElement).toBe(scroller)
    expect(content.className).toContain("mt-auto")
  })

  it("opens with where it began once nothing older is left to load", () => {
    const { container, rerender } = render(list(items(3)))
    const start = container.querySelector("[data-conversation-start]")
    expect(start?.textContent).toBe("This is the start of #design")
    // On the first row, so no row's index moves for it.
    expect(start?.nextElementSibling?.getAttribute("data-day-divider")).not.toBeNull()
    rerender(list(items(3), { hasOldMessage: true }))
    expect(container.querySelector("[data-conversation-start]")).toBeNull()
    rerender(list(items(3), { olderMessageLoading: true }))
    expect(container.querySelector("[data-conversation-start]")).toBeNull()
  })

  it("leaves the start to the empty state when there are no messages", () => {
    const { container } = render(list([]))
    expect(container.querySelector("[data-conversation-start]")).toBeNull()
  })
})

describe("a list that gets shorter", () => {
  it("watches its own height as well as its content", () => {
    const { container } = render(list(items(10)))
    const scroller = container.querySelector('div[style*="overflow-y: auto"]')
    expect(observed).toContain(scroller)
    expect(observed).toContain(container.querySelector("[data-list-content]"))
  })

  it("keeps a reader who was at the end at the end (a long draft, a banner, the keyboard)", () => {
    render(list(items(10)))
    act(() => reportScroll(1400)) // at the end
    handle.scrollToIndex.mockReset()
    act(() => resized())
    expect(handle.scrollToIndex).toHaveBeenCalledWith(10, expect.objectContaining({ align: "end" }))
  })

  it("leaves a reader who scrolled up where they are", () => {
    const { container } = render(list(items(10)))
    const scroller = container.querySelector<HTMLElement>('div[style*="overflow-y: auto"]')!
    fireEvent.wheel(scroller, { deltaY: -400 })
    act(() => reportScroll(400))
    handle.scrollToIndex.mockReset()
    act(() => resized())
    expect(handle.scrollToIndex).not.toHaveBeenCalled()
  })
})

describe("the way back to the latest", () => {
  it("is centred over the composer's column, not the whole sheet", () => {
    const { container, getByRole } = render(list(items(10)))
    const scroller = container.querySelector<HTMLElement>('div[style*="overflow-y: auto"]')!
    fireEvent.wheel(scroller, { deltaY: -400 })
    act(() => reportScroll(400))
    const pill = getByRole("button", { name: "Jump to latest" })
    expect(pill.className).toContain("left-[min(50%,420px)]")
    expect(pill.className).not.toContain("left-1/2")
  })
})
