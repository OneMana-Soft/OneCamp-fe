import { describe, expect, it } from "vitest"
import { MAIN } from "./split"
import { moveTo, readSplit, shares, shownViews, stepView, swapIn, viewRow, viewsThatFit, withPane } from "./splitLayout"

// Split view's rules for many views (release-1010/design/split/ANALYSIS.md):
// W width, T tuck, L least recently used, O order, S sizes, P persistence.

const doc = { kind: "doc" as const, id: "dddddd" }
const chat = { kind: "chat" as const, id: "cccccc" }
const task = { kind: "task" as const, id: "tttttt" }
const call = { kind: "call-channel" as const, id: "llllll" }

describe("rule W: views fit by width", () => {
  it("gives every view 360px and every seam 8, one view at least and four at most", () => {
    expect(viewsThatFit(0)).toBe(1)
    expect(viewsThatFit(727)).toBe(1)
    expect(viewsThatFit(728)).toBe(2)
    // The panel group at 1280, 1440 and 1920 with the 248px sidebar.
    expect(viewsThatFit(1016)).toBe(2)
    expect(viewsThatFit(1176)).toBe(3)
    expect(viewsThatFit(1656)).toBe(4)
    expect(viewsThatFit(4000)).toBe(4)
  })
})

describe("rule L: past the room, the least recently used side view closes", () => {
  it("closes the one used longest ago, never a running call nor the one opening, and one at most", () => {
    // doc was used more recently than chat: chat goes.
    expect(withPane([doc, chat], task, 2, ["doc:dddddd", "chat:cccccc"])).toEqual([doc, task])
    // Never used goes before used; among the never used, the oldest.
    expect(withPane([doc, chat], task, 2, ["doc:dddddd"])).toEqual([doc, task])
    expect(withPane([doc, chat], task, 2, [])).toEqual([chat, task])
    // A running call stays, however long ago it was used.
    expect(withPane([call, doc], task, 2, ["doc:dddddd"])).toEqual([call, task])
    // Two over (the window shrank since): one closes, the rest tuck (rule T).
    expect(withPane([doc, chat, call], task, 1, [])).toEqual([chat, call, task])
  })
})

describe("rule O: the views' order", () => {
  it("reads the row from the keys kept, with any it lacks at the end", () => {
    expect(viewRow([doc, chat], [])).toEqual([MAIN, 0, 1])
    expect(viewRow([doc, chat], ["chat:cccccc", "main", "doc:dddddd"])).toEqual([1, MAIN, 0])
    expect(viewRow([doc, chat], ["chat:cccccc", "gone:xxxxxx"])).toEqual([1, MAIN, 0])
  })

  it("moves a view to a place, the page among them", () => {
    expect(moveTo([doc, chat], [], MAIN, 2)).toEqual(["doc:dddddd", "chat:cccccc", "main"])
    expect(moveTo([doc, chat], [], 1, 0)).toEqual(["chat:cccccc", "main", "doc:dddddd"])
  })

  it("swaps two views' places", () => {
    expect(swapIn([doc, chat], [], MAIN, 1)).toEqual(["chat:cccccc", "doc:dddddd", "main"])
  })

  it("steps through the row, wrapping", () => {
    expect(stepView([1, MAIN, 0], MAIN, 1)).toBe(0)
    expect(stepView([1, MAIN, 0], 0, 1)).toBe(1)
    expect(stepView([1, MAIN, 0], 1, -1)).toBe(0)
  })
})

describe("rule T: the views on screen when fewer fit", () => {
  const row = [MAIN, 0, 1, 2]
  const panes = [doc, chat, task]
  it("keeps the active view, then a running call, then the most recently used, in screen order", () => {
    expect(shownViews(panes, row, ["chat:cccccc", "main"], 2, 2)).toEqual([1, 2])
    expect(shownViews(panes, row, [], MAIN, 4)).toEqual(row)
    expect(shownViews([doc, call, task], row, ["doc:dddddd"], 2, 2)).toEqual([1, 2])
    expect(shownViews(panes, row, [], 0, 1)).toEqual([0])
  })
})

describe("rule S: each view keeps its width", () => {
  it("shares out what the views have by their kept shares, even for a new one, none under the minimum", () => {
    expect(shares(["a", "b"], {}, 100, 0)).toEqual([50, 50])
    expect(shares(["a", "b"], { a: 70, b: 30 }, 100, 0)).toEqual([70, 30])
    // A new view takes an even share; the others scale down and keep their proportion.
    const three = shares(["a", "b", "c"], { a: 70, b: 30 }, 90, 0)
    expect(three.map((x) => Math.round(x * 10) / 10)).toEqual([42, 18, 30])
    // A view under its minimum is raised, from the widest.
    const kept = shares(["a", "b"], { a: 90, b: 10 }, 100, 30)
    expect(kept).toEqual([70, 30])
  })
})

describe("rule P: what a browser keeps", () => {
  it("reads the layout kept, and the bare list kept before 20 Oct 2026", () => {
    expect(readSplit([doc])).toEqual({ panes: [doc], order: [], sizes: {} })
    expect(readSplit({ panes: [doc], order: ["doc:dddddd", "main", 4], sizes: { main: 40, "doc:dddddd": 60, junk: "x", huge: 1000 } })).toEqual({
      panes: [doc],
      order: ["doc:dddddd", "main"],
      sizes: { main: 40, "doc:dddddd": 60 },
    })
    expect(readSplit({ panes: [{ kind: "nope", id: "x" }] })).toBeNull()
    expect(readSplit("junk")).toBeNull()
    expect(readSplit(null)).toBeNull()
  })
})
