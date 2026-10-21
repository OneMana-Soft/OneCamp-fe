import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render } from "@testing-library/react"
import { createRef, forwardRef, useImperativeHandle, type ReactNode } from "react"
import type { VListHandle } from "virtua"
import type { FlatItem } from "@/types/virtual"
import { pinTestClock } from "@/lib/testing/testClock"

pinTestClock()

// A link opens the conversation at its message, in place and lit up (chat A1:
// "every link opens the message in place, highlighted"). It showed the
// message and what followed it, with nothing scrolled to or lit: on a
// computer the thread panel was the only sign of which message was meant.

const handle = {
  scrollToIndex: vi.fn(),
  findStartIndex: () => 0,
  getItemOffset: () => 0,
  scrollOffset: 0,
  scrollSize: 2000,
  viewportSize: 600,
}
vi.mock("virtua", () => ({
  Virtualizer: forwardRef(function FakeVirtualizer({ children }: { children: ReactNode }, ref) {
    useImperativeHandle(ref, () => handle)
    return <div>{children}</div>
  }),
}))
class FakeResizeObserver {
  observe() {}
  disconnect() {}
  unobserve() {}
}

const { MessageListVirtua } = await import("./MessageListVirtua")

type Msg = { id: string }
const rows = (ids: string[]): FlatItem<Msg>[] => [
  { type: "separator", key: "sep-1", date: "2026-10-14" },
  ...ids.map((id): FlatItem<Msg> => ({ type: "item", key: id, data: { id } })),
]
const list = (ids: string[], extra: Record<string, unknown> = {}) => (
  <MessageListVirtua
    items={rows(ids)}
    // The row carries its message's DOM id, as a message card does.
    renderItem={(m: Msg) => <p id={`msg-${m.id}`}>{m.id}</p>}
    getDateHeading={(d) => d}
    fetchOlderMessage={() => {}}
    fetchNewMessage={() => {}}
    hasOldMessage={false}
    hasNewMessage={false}
    clickedScrollToBottom={() => {}}
    ref={createRef<VListHandle>()}
    {...extra}
  />
)
const centred = () => handle.scrollToIndex.mock.calls.filter(([, o]) => (o as { align?: string })?.align === "center").map(([i]) => i)
const frame = () => act(() => new Promise<void>((r) => requestAnimationFrame(() => r())))

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", FakeResizeObserver)
  handle.scrollToIndex.mockClear()
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe("a link's message", () => {
  it("is gone to, in the middle of the list, and lit up a moment", async () => {
    render(list(["m1", "m2", "m3"], { anchor: "m2" }))
    // The day's heading is row 0: m2 is row 2.
    expect(centred()).toEqual([2])
    await frame()
    expect(document.getElementById("msg-m2")!.hasAttribute("data-highlighted")).toBe(true)
    expect(document.getElementById("msg-m1")!.hasAttribute("data-highlighted")).toBe(false)
  })

  it("wins over where the reader last left the list", () => {
    render(list(["m1", "m2", "m3"], { anchor: "m3", initialTopMostItemIndex: 1, initialScrollOffsetFromTop: 40 }))
    expect(centred()).toEqual([3])
    expect(handle.scrollToIndex.mock.calls.some(([, o]) => (o as { align?: string })?.align === "start")).toBe(false)
  })

  it("is gone to once it arrives, when the list didn't hold it yet", () => {
    const { rerender } = render(list(["m1"], { anchor: "m9" }))
    expect(centred()).toEqual([])
    rerender(list(["m8", "m9", "m10"], { anchor: "m9" }))
    expect(centred()).toEqual([2])
  })

  it("stays in the middle as older messages load above it, until the reader takes the list", () => {
    const { container, rerender } = render(list(["m5", "m6"], { anchor: "m5" }))
    expect(centred()).toEqual([1])
    // The older page lands above it: it's centred again, where it now is.
    rerender(list(["m3", "m4", "m5", "m6"], { anchor: "m5" }))
    expect(centred()).toEqual([1, 3])
    // The reader scrolls: the list is theirs now.
    fireEvent.wheel(container.querySelector("[data-message-viewport]")!, { deltaY: -200 })
    rerender(list(["m1", "m2", "m3", "m4", "m5", "m6"], { anchor: "m5" }))
    expect(centred()).toEqual([1, 3])
  })

  it("leaves a list with no link to open at its end, as before", () => {
    render(list(["m1", "m2"]))
    expect(centred()).toEqual([])
  })
})
