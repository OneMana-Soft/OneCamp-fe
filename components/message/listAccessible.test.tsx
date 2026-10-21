import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { createRef, forwardRef, useImperativeHandle, type ReactNode } from "react"
import type { VListHandle } from "virtua"
import type { FlatItem } from "@/types/virtual"
import { pinTestClock } from "@/lib/testing/testClock"

pinTestClock()

// SD-53: the message list was no list to a screen reader, its rows unlabelled.
// SD-54: nothing announced a message arriving. SD-BUG-1: a failed older page
// made the list say the conversation began there. SD-BUG-3: "2 mentions you".

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
class FakeResizeObserver {
  observe() {}
  disconnect() {}
  unobserve() {}
}

const { MessageListVirtua } = await import("./MessageListVirtua")

type Msg = { id: string; by: string; text: string }
const msg = (id: string, by = "Maya Chen", text = `said ${id}`): Msg => ({ id, by, text })
const rows = (msgs: Msg[]): FlatItem<Msg>[] => [
  { type: "separator", key: "sep-1", date: "2026-10-14" },
  ...msgs.map((m): FlatItem<Msg> => ({ type: "item", key: m.id, data: m })),
]
const rowLabel = (m: Msg) => `${m.by}: ${m.text}`
const isOwn = (m: Msg) => m.by === "Sam Rivera"
const list = (msgs: Msg[], extra: Record<string, unknown> = {}) => (
  <MessageListVirtua
    items={rows(msgs)}
    renderItem={(m: Msg) => <p>{m.text}</p>}
    getDateHeading={(d) => d}
    fetchOlderMessage={() => {}}
    fetchNewMessage={() => {}}
    hasOldMessage={false}
    hasNewMessage={false}
    clickedScrollToBottom={() => {}}
    ref={createRef<VListHandle>()}
    start={<p>This is the start of #design</p>}
    label="Messages in #design"
    rowLabel={rowLabel}
    isOwn={isOwn}
    {...extra}
  />
)
const announced = () => document.querySelector("[data-announcer]")!.textContent!.replace(/​/g, "")

beforeEach(() => vi.stubGlobal("ResizeObserver", FakeResizeObserver))
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe("the message list to a screen reader", () => {
  it("is a labelled list whose messages are items labelled by their summary", () => {
    render(list([msg("m1"), msg("m2")]))
    const messages = screen.getByRole("list", { name: "Messages in #design" })
    const items = screen.getAllByRole("listitem")
    expect(items.every((i) => messages.contains(i))).toBe(true)
    expect(screen.getByRole("listitem", { name: "Maya Chen: said m2" })).toBeTruthy()
  })

  it("announces a message that arrives live, and never a load, a backlog or your own", () => {
    const { rerender } = render(list([msg("m1"), msg("m2")]))
    expect(announced()).toBe("")
    rerender(list([msg("m1"), msg("m2"), msg("m3", "Jonas Weber", "on my way")]))
    expect(announced()).toBe("Jonas Weber: on my way")
    rerender(list([msg("m1"), msg("m2"), msg("m3", "Jonas Weber", "on my way"), msg("m4", "Sam Rivera")]))
    expect(announced()).toBe("Jonas Weber: on my way")
    // A reconnect's backlog of five says nothing.
    rerender(list([msg("m1"), msg("m2"), msg("m3", "Jonas Weber", "on my way"), msg("m4", "Sam Rivera"), ...["m5", "m6", "m7", "m8", "m9"].map((id) => msg(id))]))
    expect(announced()).toBe("Jonas Weber: on my way")
  })

  it("says the same words again when the same words arrive again", () => {
    const { rerender } = render(list([msg("m1")]))
    rerender(list([msg("m1"), msg("m2", "Jonas Weber", "ok")]))
    const first = document.querySelector("[data-announcer]")!.textContent
    rerender(list([msg("m1"), msg("m2", "Jonas Weber", "ok"), msg("m3", "Jonas Weber", "ok")]))
    expect(document.querySelector("[data-announcer]")!.textContent).not.toBe(first)
    expect(announced()).toBe("Jonas Weber: ok")
  })
})

describe("the message list to a keyboard", () => {
  it("is one Tab stop, a region named for its conversation around the list", () => {
    render(list([msg("m1"), msg("m2")]))
    const region = screen.getByRole("region", { name: "Messages in #design" })
    expect(region.tabIndex).toBe(0)
    expect(region.contains(screen.getByRole("list", { name: "Messages in #design" }))).toBe(true)
  })

  it("is named Messages when the list has no name of its own", () => {
    render(list([msg("m1")], { label: undefined }))
    expect(screen.getByRole("region", { name: "Messages" }).tabIndex).toBe(0)
  })

  it("pages through the history with Page Up and Page Down, and End goes to the latest", () => {
    render(list([msg("m1"), msg("m2"), msg("m3")]))
    const region = screen.getByRole("region", { name: "Messages in #design" })
    const scrollBy = vi.fn()
    Object.defineProperty(region, "scrollBy", { value: scrollBy, configurable: true })
    Object.defineProperty(region, "clientHeight", { value: 600, configurable: true })

    fireEvent.keyDown(region, { key: "PageUp" })
    expect(scrollBy).toHaveBeenLastCalledWith(expect.objectContaining({ top: -552 }))
    fireEvent.keyDown(region, { key: "PageDown" })
    expect(scrollBy).toHaveBeenLastCalledWith(expect.objectContaining({ top: 552 }))

    handle.scrollToIndex.mockClear()
    fireEvent.keyDown(region, { key: "End" })
    // The last of the four rows (the day, then three messages), at its end.
    expect(handle.scrollToIndex).toHaveBeenCalledWith(3, expect.objectContaining({ align: "end" }))
  })

  it("leaves a key typed in a field inside it alone", () => {
    render(list([msg("m1")]))
    const region = screen.getByRole("region", { name: "Messages in #design" })
    const scrollBy = vi.fn()
    Object.defineProperty(region, "scrollBy", { value: scrollBy, configurable: true })
    const field = document.createElement("textarea")
    region.appendChild(field)
    fireEvent.keyDown(field, { key: "PageDown" })
    expect(scrollBy).not.toHaveBeenCalled()
  })
})

describe("an older page that failed", () => {
  it("says so with Try again, never that the conversation begins there", () => {
    const retry = vi.fn()
    render(list([msg("m1")], { hasOldMessage: true, retryOlder: retry }))
    expect(screen.getByText("Couldn't load older messages")).toBeTruthy()
    expect(screen.queryByText("This is the start of #design")).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: /try again/i }))
    expect(retry).toHaveBeenCalledTimes(1)
  })

  it("asks for no more pages while it says so", () => {
    const older = vi.fn()
    render(list([msg("m1")], { hasOldMessage: true, retryOlder: () => {}, fetchOlderMessage: older }))
    act(() => reportScroll(0))
    expect(older).not.toHaveBeenCalled()
  })
})

describe("the jump pill", () => {
  it("says how many messages mention you, in agreement", () => {
    const { rerender } = render(list([msg("m1")], { isForMe: () => true }))
    // The reader scrolls up (input on the list, then the scroll), and two
    // messages that mention them arrive below.
    act(() => {
      fireEvent.wheel(document.querySelector<HTMLElement>('div[style*="overflow-y: auto"]')!, { deltaY: -400 })
      reportScroll(400)
    })
    rerender(list([msg("m1"), msg("m2"), msg("m3")], { isForMe: () => true }))
    expect(screen.getByText("2 mention you")).toBeTruthy()
    rerender(list([msg("m1"), msg("m2"), msg("m3"), msg("m4")], { isForMe: () => false }))
    rerender(list([msg("m1"), msg("m2"), msg("m3"), msg("m4"), msg("m5")], { isForMe: (m: Msg) => m.id === "m5" }))
    expect(screen.getByText("3 mention you")).toBeTruthy()
  })
})
