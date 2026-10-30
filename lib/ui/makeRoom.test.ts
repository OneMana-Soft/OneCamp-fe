import { afterEach, describe, expect, it, vi } from "vitest"

import { makeRoom, slotAt } from "@/lib/ui/makeRoom"

// Rows 40px tall from 0, with a 36px group header between the third and the fourth.
const ROWS = [
  { top: 0, bottom: 40 },
  { top: 40, bottom: 80 },
  { top: 80, bottom: 120 },
  { top: 156, bottom: 196 },
  { top: 196, bottom: 236 },
]

describe("slotAt", () => {
  it("is before the row the copy's middle is over", () => {
    expect(slotAt(ROWS, 0, 80)).toEqual({ row: 0, after: false })
    expect(slotAt(ROWS, 79, 80)).toEqual({ row: 1, after: false })
    expect(slotAt(ROWS, 80, 80)).toEqual({ row: 2, after: false })
    expect(slotAt(ROWS, 200, 80)).toEqual({ row: 4, after: false })
  })

  it("between rows, takes the nearer side: the end of one group or the top of the next", () => {
    expect(slotAt(ROWS, 130, 80)).toEqual({ row: 2, after: true })
    expect(slotAt(ROWS, 150, 80)).toEqual({ row: 3, after: false })
  })

  it("past either end, within reach, is at that end; further off, nowhere", () => {
    expect(slotAt(ROWS, -30, 80)).toEqual({ row: 0, after: false })
    expect(slotAt(ROWS, 300, 80)).toEqual({ row: 4, after: true })
    expect(slotAt(ROWS, -81, 80)).toBeNull()
    expect(slotAt(ROWS, 317, 80)).toBeNull()
    expect(slotAt([], 10, 80)).toBeNull()
  })
})

describe("makeRoom", () => {
  afterEach(() => {
    vi.useRealTimers()
    document.body.innerHTML = ""
  })

  const list = (n: number) => {
    const box = document.createElement("div")
    const items = Array.from({ length: n }, () => box.appendChild(document.createElement("div")))
    document.body.appendChild(box)
    return { box, items }
  }
  const lower = (items: HTMLElement[]) => items.map((el) => el.hasAttribute("data-room-shift"))
  const writes = (box: HTMLElement, act: () => void) => {
    const seen = new MutationObserver(() => {})
    seen.observe(box, { subtree: true, attributes: true, attributeFilter: ["data-room-shift"] })
    act()
    const n = seen.takeRecords().length
    seen.disconnect()
    return n
  }

  it("moves the items from the slot down, by the held row's height", () => {
    const { box, items } = list(5)
    const room = makeRoom(56)
    room.items(items)
    room.open(2)
    // Its height on each item that moves, never on the list (an inherited value there restyles all of it).
    expect(items.map((el) => el.style.getPropertyValue("--room"))).toEqual(["56px", "56px", "56px", "56px", "56px"])
    expect(box.style.getPropertyValue("--room")).toBe("")
    expect(lower(items)).toEqual([false, false, true, true, true])
    expect(items.every((el) => el.hasAttribute("data-room-flow"))).toBe(true)
  })

  it("writes only the items between the last slot and the next: a step of one row is one write", () => {
    const { box, items } = list(6)
    const room = makeRoom(40)
    room.items(items)
    room.open(1)
    expect(writes(box, () => room.open(2))).toBe(1)
    expect(writes(box, () => room.open(2))).toBe(0)
    expect(writes(box, () => room.open(5))).toBe(3)
    expect(lower(items)).toEqual([false, false, false, false, false, true])
    expect(writes(box, () => room.open(null))).toBe(1)
    expect(lower(items)).toEqual([false, false, false, false, false, false])
  })

  it("checks every item again when the items are read again, and writes only what's wrong", () => {
    const { box, items } = list(4)
    const room = makeRoom(40)
    room.items(items)
    room.open(1)
    const fresh = box.appendChild(document.createElement("div"))
    room.items([...items, fresh])
    expect(writes(box, () => room.open(1))).toBe(1)
    expect(fresh.hasAttribute("data-room-shift")).toBe(true)
    // An item gone from the list is let go.
    room.items(items.slice(1))
    expect(items[0].hasAttribute("data-room-flow")).toBe(false)
  })

  it("closes at once for a drop, or slides back for a cancel and then lets go", () => {
    vi.useFakeTimers()
    const { items } = list(3)
    const room = makeRoom(40)
    room.items(items)
    room.open(0)
    room.close(true)
    // Back down, still sliding: the transition stays until the slide is over.
    expect(lower(items)).toEqual([false, false, false])
    expect(items[0].hasAttribute("data-room-flow")).toBe(true)
    vi.advanceTimersByTime(200)
    expect(items[0].hasAttribute("data-room-flow")).toBe(false)
    expect(items[0].style.getPropertyValue("--room")).toBe("")

    const again = makeRoom(40)
    again.items(items)
    again.open(1)
    again.close(false)
    expect(items.some((el) => el.hasAttribute("data-room-flow") || el.hasAttribute("data-room-shift"))).toBe(false)
  })
})
