import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { createRef, forwardRef, useImperativeHandle, type ReactNode } from "react"
import type { VListHandle } from "virtua"
import type { FlatItem } from "@/types/virtual"
import { clockTime } from "@/lib/utils/date/clock"
import { TEST_TODAY } from "@/lib/testing/testClock"

// Where a conversation opens (chat B27, D-SD6): at the newest message with the
// line drawn from the marker, unless more than a screen is unread; then at the
// first unread, its line at the top, with a banner that says how many since
// when, with Jump and Mark as read.

// virtua lays out nothing in jsdom: a stand-in says where each row is and
// where the reader is (at the end of a long conversation, 100px a row).
const handle = {
  scrollToIndex: vi.fn(),
  findStartIndex: () => 0,
  getItemOffset: (i: number) => i * 100,
  scrollOffset: 0,
  scrollSize: 4000,
  viewportSize: 600,
}
vi.mock("virtua", () => ({
  Virtualizer: forwardRef(function FakeVirtualizer({ children }: { children: ReactNode }, ref) {
    useImperativeHandle(ref, () => handle)
    return <div>{children}</div>
  }),
}))

const { MessageListVirtua } = await import("./MessageListVirtua")

type Msg = { id: string; at: string }
const at = (n: number) => new Date(Date.UTC(2026, 9, 20, 10, 14 + n)).toISOString()
const rows = (n: number, unreadFrom: number): FlatItem<Msg>[] => {
  const out: FlatItem<Msg>[] = []
  for (let i = 1; i <= n; i++) {
    if (i === unreadFrom) out.push({ type: "unread", key: "unread" })
    out.push({ type: "item", key: `m${i}`, data: { id: `m${i}`, at: at(i - unreadFrom) } })
  }
  return out
}
const markRead = vi.fn()
const list = (items: FlatItem<Msg>[]) => (
  <MessageListVirtua
    items={items}
    renderItem={(m: Msg) => <p>{m.id}</p>}
    getDateHeading={(d) => d}
    fetchOlderMessage={() => {}}
    fetchNewMessage={() => {}}
    hasOldMessage={false}
    hasNewMessage={false}
    clickedScrollToBottom={() => {}}
    timeOf={(m: Msg) => m.at}
    onMarkRead={markRead}
    ref={createRef<VListHandle>()}
  />
)
const frame = () => act(() => void vi.advanceTimersByTime(20))

beforeEach(() => {
  // The fake timers set the clock too (lib/testing/testClock): the one today.
  vi.useFakeTimers({ now: TEST_TODAY, toFake: ["requestAnimationFrame", "cancelAnimationFrame", "setTimeout", "clearTimeout", "Date"] })
  handle.scrollToIndex.mockReset()
  markRead.mockReset()
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe("a conversation opened onto unread messages", () => {
  it("opens at the first unread when more than a screen is unread, with the banner", () => {
    handle.scrollOffset = 3400 // the end: the line, row 3, is far above the screen
    render(list(rows(40, 3)))
    frame()
    expect(handle.scrollToIndex).toHaveBeenLastCalledWith(2, { align: "start" })
    const banner = screen.getByRole("status", { name: "" })
    // The first unread's time, as the person's clock writes it (lib/utils/date/clock).
    expect(banner.textContent).toContain(`38 new messages since ${clockTime(at(0))}`)
  })

  it("opens at the newest with the line when the unread fit on the screen", () => {
    handle.scrollOffset = 3400
    render(list(rows(40, 38))) // the line at row 38: 3,700px, on the screen
    frame()
    expect(handle.scrollToIndex).not.toHaveBeenCalledWith(37, { align: "start" })
    expect(document.querySelector("[data-unread-banner]")).toBeNull()
    expect(document.querySelector("[data-unread-line]")).not.toBeNull()
  })

  it("marks it read from the banner: the banner and the line go", () => {
    handle.scrollOffset = 3400
    render(list(rows(40, 3)))
    frame()
    fireEvent.click(screen.getByRole("button", { name: "Mark as read" }))
    expect(markRead).toHaveBeenCalledTimes(1)
    expect(document.querySelector("[data-unread-banner]")).toBeNull()
    expect(document.querySelector("[data-unread-line]")).toBeNull()
  })

  it("jumps back to the line from the banner", () => {
    handle.scrollOffset = 3400
    render(list(rows(40, 3)))
    frame()
    handle.scrollToIndex.mockReset()
    fireEvent.click(screen.getByRole("button", { name: "Jump" }))
    expect(handle.scrollToIndex).toHaveBeenCalledWith(2, { align: "start" })
  })
})
