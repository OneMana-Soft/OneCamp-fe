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
      expect(handle.scrollToIndex).toHaveBeenCalledWith(10, { align: "end" })
    } finally {
      vi.useRealTimers()
    }
  })
})

describe("a conversation the reader has scrolled up in", () => {
  it("keeps still, and counts what arrived on the way back down", () => {
    const { rerender } = render(list(items(10)))
    act(() => reportScroll(400)) // 1,000 px from the end
    handle.scrollToIndex.mockReset()
    rerender(list(items(12)))
    expect(handle.scrollToIndex).not.toHaveBeenCalled()
    const back = screen.getByRole("button", { name: "2 new messages" })
    fireEvent.click(back)
    expect(jumped).toHaveBeenCalled()
    expect(handle.scrollToIndex).toHaveBeenCalledWith(11, { align: "end" })
  })

  it("offers the way back, labelled, once a screenful away", () => {
    render(list(items(10)))
    act(() => reportScroll(400))
    expect(screen.getByRole("button", { name: "Jump to latest" })).toBeTruthy()
    act(() => reportScroll(1400)) // at the end
    expect(screen.queryByRole("button", { name: "Jump to latest" })).toBeNull()
  })
})

describe("the conversation's furniture", () => {
  it("marks where the unread messages start", () => {
    render(list(items(3, [{ type: "unread", key: "unread" }, { type: "item", key: "m4", data: { id: "m4" } }])))
    expect(screen.getByRole("separator", { name: "New messages" }).textContent).toBe("New")
  })

  it("floats the date over the messages without taking room from them", () => {
    const { container } = render(list(items(10)))
    const floating = container.querySelector(".sticky.top-0")
    expect(floating?.className).toContain("h-0")
  })
})
