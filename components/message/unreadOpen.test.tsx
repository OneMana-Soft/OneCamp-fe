import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { createRef, forwardRef, useImperativeHandle, type ReactNode } from "react"
import type { VListHandle } from "virtua"
import type { FlatItem } from "@/types/virtual"
import { clockTime } from "@/lib/utils/date/clock"
import { TEST_TODAY } from "@/lib/testing/testClock"

// Where a conversation opens (chat B27, D-SD6): at the newest message with the
// line drawn from the marker, unless more than a screen is unread; then at the
// first unread, with a banner that says how many since when, with Jump and
// Mark as read. The line sits clear of the banner, with the last read message
// above it (DESIGN-BUILD-4, 22 Oct: it sat at the very top, under the banner).

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
const list = (items: FlatItem<Msg>[], unreadKnown = true) => (
  <MessageListVirtua
    unreadKnown={unreadKnown}
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
// The line at row 2, placed under the banner's 42px and an 8px gap, with the
// read row above it (100px) for context.
const UNDER_BANNER = { align: "start", offset: -(42 + 8 + 100) }

beforeEach(() => {
  // The fake timers set the clock too (lib/testing/testClock): the one today.
  vi.useFakeTimers({ now: TEST_TODAY, toFake: ["requestAnimationFrame", "cancelAnimationFrame", "setTimeout", "clearTimeout", "Date"] })
  handle.scrollToIndex.mockReset()
  handle.getItemOffset = (i: number) => i * 100
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
    expect(handle.scrollToIndex).toHaveBeenLastCalledWith(2, UNDER_BANNER)
    const banner = screen.getByRole("status", { name: "" })
    // The first unread's time, as the person's clock writes it (lib/utils/date/clock).
    expect(banner.textContent).toContain(`38 new messages since ${clockTime(at(0))}`)
  })

  it("keeps at most a third of the screen of the read message above the line", () => {
    handle.scrollOffset = 3400
    handle.getItemOffset = (i: number) => (i < 2 ? i * 100 : 900 + (i - 2) * 100) // m2 is 800px tall
    render(list(rows(40, 3)))
    frame()
    expect(handle.scrollToIndex).toHaveBeenLastCalledWith(2, { align: "start", offset: -(42 + 8 + 600 / 3) })
  })

  it("puts the line straight under the banner when nothing above it was read", () => {
    handle.scrollOffset = 3400
    render(list(rows(40, 1)))
    frame()
    expect(handle.scrollToIndex).toHaveBeenLastCalledWith(0, { align: "start", offset: -(42 + 8) })
  })

  it("says it short on a phone, each phrase whole, and gives both buttons a finger's reach", () => {
    handle.scrollOffset = 3400
    render(list(rows(40, 3)))
    frame()
    const banner = screen.getByRole("status", { name: "" })
    const time = clockTime(at(0))
    const [short, long] = Array.from(banner.querySelectorAll("span.font-medium"))
    expect(short.textContent).toBe(`38 new since ${time}`)
    expect(short.className).toContain("sm:hidden")
    expect(long.textContent).toBe(`38 new messages since ${time}`)
    expect(long.className).toMatch(/\bhidden\b.*\bsm:inline\b/)
    const pill = short.parentElement!
    expect(pill.className).toContain("whitespace-nowrap")
    expect(pill.className).toContain("min-h-8")
    expect(pill.className).not.toMatch(/(^|\s)h-8(\s|$)/)
    for (const name of ["Jump", "Mark as read"]) expect(screen.getByRole("button", { name }).hasAttribute("data-touch-target")).toBe(true)
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
    expect(handle.scrollToIndex).toHaveBeenCalledWith(2, UNDER_BANNER)
  })

  // Opened by its address, the count comes after the messages (hooks/useUnreadOnOpen):
  // the list opens at the first unread once it is known, not before, and not never.
  it("opens at the first unread once the count is known, when it came after the messages", () => {
    handle.scrollOffset = 3400
    const { rerender } = render(list(rows(40, 3), false))
    frame()
    expect(handle.scrollToIndex).not.toHaveBeenCalled()
    expect(document.querySelector("[data-unread-banner]")).toBeNull()
    rerender(list(rows(40, 3), true))
    frame()
    expect(handle.scrollToIndex).toHaveBeenLastCalledWith(2, UNDER_BANNER)
    expect(document.querySelector("[data-unread-banner]")).not.toBeNull()
  })
})
