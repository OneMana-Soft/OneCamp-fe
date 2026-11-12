import { afterEach, describe, expect, it } from "vitest"
import { act, renderHook } from "@testing-library/react"

import { activityKey as keyOf } from "@/lib/activity/feedPages"
import { isUnread, useReadState } from "@/lib/activity/readState"
import { pinTestClock } from "@/lib/testing/testClock"
import type { UnifiedActivityItem } from "@/types/activity"

// CR-B10 M1 (5 Nov): the dots are the server's item.unread, newer than the
// last look. Opening the Inbox moves the last look to now, so the next read of
// its first page (focus, a phone's back to the Inbox, a live item, a reload)
// marked nothing unread, and every dot went, the counted rows never opened
// among them. The rows the badge counted keep their dots in this browser until
// they're read here, or where they are (the server demotes them).

const at = (id: string, over: Partial<UnifiedActivityItem> = {}): UnifiedActivityItem => ({
  activity_type: "MENTION",
  time: "2026-11-05T09:00:00Z",
  priority: "high",
  mention: { mention_created_at: "2026-11-05T09:00:00Z", mention_post: { post_uuid: id, post_text: id } },
  ...over,
}) as UnifiedActivityItem

pinTestClock()
afterEach(() => window.localStorage.clear())

describe("the rows the badge counted", () => {
  it("keep their dots once the first page is read again with nothing unread", () => {
    const { result } = renderHook(() => useReadState())
    const counted = [at("p-1", { unread: true }), at("p-2", { unread: true }), at("p-0", { unread: false })]
    act(() => result.current.keep(counted))

    // After the seen write: the server marks nothing unread.
    const again = counted.map((i) => ({ ...i, unread: false }))
    expect(result.current.counted.size).toBe(2)
    expect(again.map((i) => isUnread(i, keyOf(i), result.current.read, result.current.markedUnread, result.current.counted))).toEqual([true, true, false])
  })

  it("lose a dot when it's opened or marked read here, and every dot on Mark all read", () => {
    const { result } = renderHook(() => useReadState())
    const items = [at("p-1", { unread: true }), at("p-2", { unread: true }), at("p-3", { unread: true })]
    act(() => result.current.keep(items))
    const dotted = () =>
      items.map((i) => ({ ...i, unread: false })).filter((i) => isUnread(i, keyOf(i), result.current.read, result.current.markedUnread, result.current.counted)).length

    act(() => result.current.mark([keyOf(items[0])], true))
    expect(dotted()).toBe(2)
    expect(result.current.counted.has(keyOf(items[0]))).toBe(false)

    act(() => result.current.mark([...result.current.counted.keys()], true))
    expect(dotted()).toBe(0)
    expect(result.current.counted.size).toBe(0)
  })

  it("lose their dots once read where they are: the server demotes them", () => {
    const { result } = renderHook(() => useReadState())
    const mention = at("p-1", { unread: true, priority: "high" })
    const reaction = at("r-1", { unread: true, priority: "low" })
    act(() => result.current.keep([mention, reaction]))
    const c = () => result.current.counted
    // Read in its channel, on this device or another: demoted to low.
    expect(isUnread({ ...mention, unread: false, priority: "low" }, keyOf(mention), new Set(), undefined, c())).toBe(false)
    // A reaction was low when counted: low says nothing new, so its dot stays until it's read here.
    expect(isUnread({ ...reaction, unread: false }, keyOf(reaction), new Set(), undefined, c())).toBe(true)
  })

  it("are the same in every tab and after a reload, bounded, and kept for this visit when storage fails", () => {
    const first = renderHook(() => useReadState())
    act(() => first.result.current.keep([at("p-1", { unread: true })]))
    const second = renderHook(() => useReadState())
    expect(second.result.current.counted.has(keyOf(at("p-1")))).toBe(true)

    const many = Array.from({ length: 520 }, (_, n) => at(`q-${n}`, { unread: true }))
    act(() => first.result.current.keep(many))
    const third = renderHook(() => useReadState())
    expect(third.result.current.counted.size).toBe(500)
    // The oldest go first.
    expect(third.result.current.counted.has(keyOf(at("p-1")))).toBe(false)
    expect(third.result.current.counted.has(keyOf(many[519]))).toBe(true)

    const setItem = Storage.prototype.setItem
    Storage.prototype.setItem = () => {
      throw new Error("quota")
    }
    try {
      act(() => third.result.current.keep([at("z-1", { unread: true })]))
      expect(third.result.current.counted.has(keyOf(at("z-1")))).toBe(true)
    } finally {
      Storage.prototype.setItem = setItem
    }
  })

  it("never lose what another tab kept: a mark reads what's stored before it writes (CR-B11 LOW 1)", () => {
    const stored = (store: string) => JSON.parse(window.localStorage.getItem(store) ?? "[]") as unknown[]
    const key = (id: string) => keyOf(at(id))
    const here = renderHook(() => useReadState())
    act(() => here.result.current.keep([at("p-0", { unread: true })]))
    // Another tab, open since: it counts two more rows and marks one read.
    const there = renderHook(() => useReadState())
    act(() => there.result.current.keep([at("p-1", { unread: true }), at("p-2", { unread: true })]))
    act(() => there.result.current.mark([key("p-3")], true))
    // This tab reads the row it counted, then marks another unread.
    act(() => here.result.current.mark([key("p-0")], true))
    act(() => here.result.current.mark([key("p-5")], false))
    expect((stored("activity:counted") as [string, string][]).map(([k]) => k)).toEqual([key("p-1"), key("p-2")])
    expect(stored("activity:read")).toEqual(expect.arrayContaining([key("p-3"), key("p-0")]))
    expect(stored("activity:unread")).toEqual([key("p-5")])
    // And this tab draws the other tab's marks from then on.
    expect(here.result.current.read.has(key("p-3"))).toBe(true)
    expect(here.result.current.counted.has(key("p-1"))).toBe(true)
  })
})
