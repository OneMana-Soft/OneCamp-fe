import { describe, expect, it } from "vitest"
import splitSlice from "./splitSlice"
import { closeSplit, evenOut, moveView, openInSplit, restoreSplit, selectSplitOn, setActive, setFocused, setHere, setRoom, setSplitOn, swapViews } from "./splitActions"
import { MAIN } from "@/lib/split"
import { viewRow } from "@/lib/splitLayout"

const r = splitSlice.reducer
const a = { kind: "doc" as const, id: "aaaaaa" }, b = { kind: "chat" as const, id: "bbbbbb" }, c = { kind: "task" as const, id: "cccccc" }
const call = { kind: "call-channel" as const, id: "llllll" }
type S = ReturnType<typeof r>
const run = (...actions: Parameters<typeof r>[1][]) => actions.reduce<S>((s, x) => r(s, x), r(undefined, { type: "init" }))
const row = (s: S) => viewRow(s.panes, s.order)

describe("splitSlice", () => {
  it("makes a pane it opens the active view", () => {
    const s = run(openInSplit(a), openInSplit(b))
    expect(s.panes).toEqual([a, b])
    expect(s.active).toBe(1)
  })
  it("keeps active and focused pointing at the same views when one closes", () => {
    let s = run(openInSplit(a), openInSplit(b), setActive(1), setFocused(1))
    s = r(s, closeSplit(0))
    expect(s.panes).toEqual([b])
    expect(s.active).toBe(0)
    expect(s.focused).toBe(0)
    s = r(s, closeSplit(0))
    expect(s.active).toBe(MAIN)
    expect(s.focused).toBeNull()
  })
  // Split view's case 14 (20 Oct 2026): where the shell shows no views side by
  // side (a phone, a tablet), an open went into a pane nobody could see.
  it("opens nothing while the shell shows no views side by side, and opens again once it does", () => {
    let s = run(setSplitOn(false), openInSplit(a))
    expect(s.panes).toEqual([])
    expect(selectSplitOn({ split: s })).toBe(false)
    s = r(r(s, setSplitOn(true)), openInSplit(a))
    expect(s.panes).toEqual([a])
    expect(selectSplitOn({ split: s })).toBe(true)
    expect(selectSplitOn({})).toBe(true)
  })
  it("ignores a view that isn't there", () => {
    const s = run(setActive(3), setFocused(2))
    expect(s.active).toBe(MAIN)
    expect(s.focused).toBeNull()
  })
})

describe("one item, one view (cases 2 to 4)", () => {
  it("brings an item already open forward instead of opening it twice, and points at it", () => {
    const s = run(openInSplit(a), openInSplit(b), setActive(MAIN), openInSplit(a))
    expect(s.panes).toEqual([a, b])
    expect(s.active).toBe(0)
    expect(s.pulse).toMatchObject({ key: "doc:aaaaaa" })
  })
  it("brings the page forward when what opens beside is the page itself, unless it is pinned there", () => {
    let s = run(setHere(a), openInSplit(b), openInSplit(a))
    expect(s.panes).toEqual([b])
    expect(s.active).toBe(MAIN)
    expect(s.pulse).toMatchObject({ key: "main" })
    s = r(s, openInSplit({ ...a, pin: true }))
    expect(s.panes).toEqual([b, a])
  })
  it("swaps when the page goes to an item open beside: the pane takes the page it left", () => {
    let s = run(setHere(a), openInSplit(b), setHere(b))
    expect(s.panes).toEqual([a])
    expect(s.here).toEqual(b)
    // Back again swaps back.
    s = r(s, setHere(a))
    expect(s.panes).toEqual([b])
  })
  it("closes that pane when the page left can't sit beside (Home), and never moves a call", () => {
    expect(run(setHere(null), openInSplit(b), setHere(b)).panes).toEqual([])
    expect(run(setHere(a), openInSplit(call), setHere(call)).panes).toEqual([])
  })
  it("drops a kept pane that is the page itself", () => {
    expect(run(setHere(a), restoreSplit({ panes: [a, b] })).panes).toEqual([b])
  })
})

describe("the room (case 1, rules W and L)", () => {
  it("closes the least recently used side view past the room, with the layout before for its Undo", () => {
    let s = run(setRoom(2), openInSplit(a), openInSplit(b), setActive(0))
    s = r(s, openInSplit(c))
    expect(s.panes).toEqual([a, c])
    expect(s.change).toMatchObject({ what: "room", key: "chat:bbbbbb", pane: b })
    expect(s.change?.before.panes).toEqual([a, b])
    // Undo puts it back as it was.
    s = r(s, restoreSplit(s.change!.before))
    expect(s.panes).toEqual([a, b])
  })
  it("keeps one side view even where none fits beside the page (it shows alone, rule T)", () => {
    const s = run(setRoom(0), openInSplit(a), openInSplit(b))
    expect(s.panes).toEqual([b])
  })
  it("never closes a running call to make room", () => {
    const s = run(setRoom(1), openInSplit(call), openInSplit(a))
    expect(s.panes).toEqual([call, a])
    expect(s.change).toBeNull()
  })
})

describe("rearranging (rule O)", () => {
  it("moves a view along the row, the page among them, with an Undo", () => {
    let s = run(openInSplit(a), openInSplit(b))
    expect(row(s)).toEqual([MAIN, 0, 1])
    s = r(s, moveView({ view: 1, by: -1 }))
    expect(row(s)).toEqual([MAIN, 1, 0])
    s = r(s, moveView({ view: MAIN, to: 2 }))
    expect(row(s)).toEqual([1, 0, MAIN])
    expect(s.change).toMatchObject({ what: "move", key: "main" })
    // Off either end, nothing moves.
    expect(r(s, moveView({ view: 1, by: -1 }))).toBe(s)
    // The panes keep their places (data-split-view) whatever the order.
    expect(s.panes).toEqual([a, b])
  })
  it("swaps two views' places", () => {
    const s = run(openInSplit(a), openInSplit(b), swapViews({ a: MAIN, b: 1 }))
    expect(row(s)).toEqual([1, 0, MAIN])
    expect(s.change).toMatchObject({ what: "swap", key: "main", other: "chat:bbbbbb" })
  })
  it("opens a new view at the right end of the row as arranged", () => {
    const s = run(openInSplit(a), moveView({ view: MAIN, to: 1 }), openInSplit(b))
    expect(row(s)).toEqual([0, MAIN, 1])
  })
  it("gives the keys to the most recently used view left when the one they were on closes", () => {
    const s = run(openInSplit(a), openInSplit(b), setActive(0), setActive(1), closeSplit(1))
    expect(s.active).toBe(0)
  })
})

describe("widths (rule S)", () => {
  it("evens every view out", () => {
    const s = run(openInSplit(a), openInSplit(b), evenOut())
    expect(s.sizes).toEqual({ main: 1, "doc:aaaaaa": 1, "chat:bbbbbb": 1 })
    expect(s.evened).toBe(1)
  })
})
