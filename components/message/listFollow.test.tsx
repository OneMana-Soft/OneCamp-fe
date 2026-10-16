import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { createRef, forwardRef, useImperativeHandle, type ReactNode } from "react"
import type { VListHandle } from "virtua"
import type { FlatItem } from "@/types/virtual"

// A conversation follows what arrives while the reader is at the bottom, and
// keeps still while they read further up, counting what arrived on the button
// that takes them back. A message that arrived while you watched used to land
// below the fold: the list only kept to the bottom for a second after opening.

// virtua lays out nothing in jsdom, so a stand-in reports where the reader is.
const handle = {
  scrollToIndex: vi.fn(),
  findStartIndex: () => 0,
  getItemOffset: () => 0,
  scrollOffset: 0,
  scrollSize: 2000,
  viewportSize: 600,
}
let reportScroll: (offset: number) => void = () => {}
// The reader scrolls with a wheel, a touch or a key: input on the list, then the
// scroll. A scroll with no input is the layout's (components/message/followEnd).
const readerScrolls = (offset: number) => {
  const scroller = document.querySelector<HTMLElement>('div[style*="overflow-y: auto"]')
  if (scroller) fireEvent.wheel(scroller, { deltaY: -400 })
  reportScroll(offset)
}
vi.mock("virtua", () => ({
  Virtualizer: forwardRef(function FakeVirtualizer({ children, onScroll }: { children: ReactNode; onScroll?: (o: number) => void }, ref) {
    useImperativeHandle(ref, () => handle)
    reportScroll = (o) => onScroll?.(o)
    return <div>{children}</div>
  }),
}))

const { MessageListVirtua } = await import("./MessaageListVirtua")

type Msg = { id: string }
const items = (n: number, extra: FlatItem<Msg>[] = []): FlatItem<Msg>[] => [
  ...Array.from({ length: n }, (_, i): FlatItem<Msg> => ({ type: "item", key: `m${i + 1}`, data: { id: `m${i + 1}` } })),
  ...extra,
]
const cache = new Map<string, FlatItem<Msg>>()
const stable = (list: FlatItem<Msg>[]) => list.map((i) => cache.get(i.key) ?? cache.set(i.key, i).get(i.key)!)
const jumped = vi.fn()
const list = (its: FlatItem<Msg>[]) => (
  <MessageListVirtua
    items={stable(its)}
    renderItem={(m: Msg) => <p>{m.id}</p>}
    getDateHeading={(d) => d}
    fetchOlderMessage={() => {}}
    fetchNewMessage={() => {}}
    hasOldMessage={false}
    hasNewMessage={false}
    clickedScrollToBottom={jumped}
    ref={createRef<VListHandle>()}
  />
)

beforeEach(() => {
  handle.scrollToIndex.mockReset()
  jumped.mockReset()
  cache.clear()
})
afterEach(cleanup)

describe("a conversation the reader is at the bottom of", () => {
  it("follows a message that arrives, long after opening", () => {
    vi.useFakeTimers()
    try {
      const { rerender } = render(list(items(10)))
      act(() => void vi.advanceTimersByTime(5000))
      handle.scrollToIndex.mockReset()
      rerender(list(items(11)))
      expect(handle.scrollToIndex).toHaveBeenCalledWith(10, expect.objectContaining({ align: "end" }))
    } finally {
      vi.useRealTimers()
    }
  })
})

describe("a conversation the reader has scrolled up in", () => {
  it("keeps still, and counts what arrived on the way back down", () => {
    const { rerender } = render(list(items(10)))
    act(() => readerScrolls(400)) // 1,000 px from the end
    handle.scrollToIndex.mockReset()
    rerender(list(items(12)))
    expect(handle.scrollToIndex).not.toHaveBeenCalled()
    const back = screen.getByRole("button", { name: "2 new messages" })
    fireEvent.click(back)
    expect(jumped).toHaveBeenCalled()
    expect(handle.scrollToIndex).toHaveBeenCalledWith(11, expect.objectContaining({ align: "end" }))
  })

  it("offers the way back, labelled, once a screenful away", () => {
    render(list(items(10)))
    act(() => readerScrolls(400))
    expect(screen.getByRole("button", { name: "Jump to latest" })).toBeTruthy()
    act(() => readerScrolls(1400)) // at the end
    expect(screen.queryByRole("button", { name: "Jump to latest" })).toBeNull()
  })
})

describe("a conversation still settling as it opens", () => {
  afterEach(() => {
    handle.scrollSize = 2000
  })

  it("stays at the end when the layout moves the reader off it (an image or card measured late)", () => {
    vi.useFakeTimers()
    try {
      render(list(items(10)))
      act(() => reportScroll(1400)) // at the end
      handle.scrollToIndex.mockReset()
      handle.scrollSize = 2600 // rows grew; the view was left 600px above the end
      act(() => reportScroll(1400))
      act(() => void vi.advanceTimersByTime(50))
      expect(handle.scrollToIndex).toHaveBeenCalledWith(9, expect.objectContaining({ align: "end" }))
      expect(screen.queryByRole("button", { name: "Jump to latest" })).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it("leaves the end for a scroll that moved the view while nothing changed size (find in page)", () => {
    const { rerender } = render(list(items(10)))
    act(() => reportScroll(1400)) // at the end
    act(() => reportScroll(400)) // the browser scrolled to a match
    handle.scrollToIndex.mockReset()
    rerender(list(items(11)))
    expect(handle.scrollToIndex).not.toHaveBeenCalled()
  })
})

describe("the conversation's furniture", () => {
  it("marks where the unread messages start", () => {
    render(list(items(3, [{ type: "unread", key: "unread" }, { type: "item", key: "m4", data: { id: "m4" } }])))
    expect(screen.getByRole("separator", { name: "New messages" }).textContent).toBe("NEW")
  })

  it("floats the date over the messages without taking room from them", () => {
    const { container } = render(list(items(10)))
    const floating = container.querySelector(".sticky.top-0")
    expect(floating?.className).toContain("h-0")
  })
})

// QA F-27: below md the composer floats over the list's last 150px, and a
// sticky offset counts from above that padding, so "Jump to latest" hung
// about 100px over the conversation, across a message's author.
describe("the way back on a phone", () => {
  const phone = (matches: boolean) =>
    vi.fn((query: string) => ({ matches: matches && query === "(max-width: 767.98px)", media: query, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false }))
  let card: HTMLElement
  beforeEach(() => {
    card = document.createElement("div")
    card.setAttribute("data-phone-composer", "")
    card.getBoundingClientRect = () => ({ top: 760 }) as DOMRect
    document.body.appendChild(card)
  })
  afterEach(() => {
    card.remove()
    Reflect.deleteProperty(window, "matchMedia")
  })
  const scrolledUp = () => {
    render(list(items(10)))
    const scroller = document.querySelector<HTMLElement>('div[style*="overflow-y: auto"]')!
    scroller.getBoundingClientRect = () => ({ bottom: 844 }) as DOMRect
    act(() => readerScrolls(400))
    return document.querySelector<HTMLElement>("[data-jump-row]")!
  }

  it("hangs 12px above the composer's card", () => {
    window.matchMedia = phone(true) as unknown as typeof window.matchMedia
    // 844 - 760 between the list's foot and the card, + 12, - the 150px room.
    expect(scrolledUp().style.bottom).toBe("-54px")
  })

  it("hangs 12px above a computer's composer under the list, where the list still keeps the room", () => {
    window.matchMedia = phone(true) as unknown as typeof window.matchMedia
    card.remove()
    card = document.createElement("div")
    card.setAttribute("data-composer", "")
    // The composer sits 8px under the list's foot.
    card.getBoundingClientRect = () => ({ top: 852 }) as DOMRect
    document.body.appendChild(card)
    // 844 - 852, + 12, - the 150px room: the pill's foot 12px above the card.
    expect(scrolledUp().style.bottom).toBe("-146px")
  })

  it("keeps the list's own offset on a computer", () => {
    window.matchMedia = phone(false) as unknown as typeof window.matchMedia
    expect(scrolledUp().style.bottom).toBe("")
  })
})
