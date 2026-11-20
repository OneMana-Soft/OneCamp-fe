import { afterEach, describe, expect, it, vi } from "vitest"

import { revealRow } from "@/lib/ui/listNav"

// The keys' reveal (fluid-17 part 2): a key focuses its row with no scroll and
// reads nothing of the page's layout; the row is brought into view in the
// frame, by the platform's own scrollIntoView({ block: "nearest", inline:
// "nearest" }). jsdom lays nothing out, so what is checked here is the call:
// on which row, with what, and when (in the key, or in its frame).

const NEAREST = { block: "nearest", inline: "nearest" }

describe("revealRow: a key's row focused at once and brought into view in its frame", () => {
  afterEach(() => {
    vi.restoreAllMocks()
    document.body.innerHTML = ""
  })
  const frame = () => new Promise<void>((done) => requestAnimationFrame(() => done()))

  /** A scroller of `count` rows. Each scrollIntoView call is kept as [row's id, its options]; each layout read is counted. */
  function list(count = 30) {
    const scroller = document.createElement("div")
    const rows = Array.from({ length: count }, (_, i) => {
      const r = document.createElement("div")
      r.tabIndex = -1
      r.dataset.taskId = `t${i}`
      scroller.append(r)
      return r
    })
    document.body.append(scroller)
    const calls: Array<[string | undefined, unknown]> = []
    vi.spyOn(Element.prototype, "scrollIntoView").mockImplementation(function (this: Element, arg?: boolean | ScrollIntoViewOptions) {
      calls.push([(this as HTMLElement).dataset.taskId, arg])
    })
    const rects = vi.spyOn(Element.prototype, "getBoundingClientRect")
    const styles = vi.spyOn(window, "getComputedStyle")
    return { rows, calls, reads: () => rects.mock.calls.length + styles.mock.calls.length }
  }

  it("focuses with no scroll in the key and calls nothing there; in the frame, one scrollIntoView on its row, nearest both ways", async () => {
    const { rows, calls, reads } = list()
    const focus = vi.spyOn(HTMLElement.prototype, "focus")
    revealRow(rows[12])
    expect(focus.mock.calls).toEqual([[{ preventScroll: true }]])
    expect(document.activeElement).toBe(rows[12])
    expect(calls, "scrollIntoView calls in the key").toEqual([])
    expect(reads(), "layout reads in the key").toBe(0)
    await frame()
    expect(calls).toEqual([["t12", NEAREST]])
  })

  it("brings a row into view without the focus when asked to", async () => {
    const { rows, calls } = list()
    const focus = vi.spyOn(HTMLElement.prototype, "focus")
    revealRow(rows[11], false)
    expect(focus).not.toHaveBeenCalled()
    expect(calls).toEqual([])
    await frame()
    expect(calls).toEqual([["t11", NEAREST]])
  })

  it("keys faster than a frame: the last row wins, brought in once in the frame, and the rows before it never are", async () => {
    const { rows, calls, reads } = list()
    revealRow(rows[25])
    revealRow(rows[14])
    revealRow(rows[3])
    expect(document.activeElement).toBe(rows[3])
    expect(calls, "scrollIntoView calls in the keys").toEqual([])
    expect(reads(), "layout reads in the keys").toBe(0)
    await frame()
    expect(calls).toEqual([["t3", NEAREST]])
    await frame()
    expect(calls, "nothing left for a later frame").toEqual([["t3", NEAREST]])
  })

  it("keys a frame apart (J at 80 ms): each frame brings in its own key's row once", async () => {
    const { rows, calls } = list()
    for (const i of [9, 10, 11]) {
      const before = calls.length
      revealRow(rows[i])
      expect(calls.length, `t${i}: scrollIntoView calls in its key`).toBe(before)
      await frame()
    }
    expect(calls).toEqual([
      ["t9", NEAREST],
      ["t10", NEAREST],
      ["t11", NEAREST],
    ])
  })

  it("a row gone from the page before the frame (the list drew it no more) is not brought in", async () => {
    const { rows, calls, reads } = list()
    revealRow(rows[20])
    rows[20].remove()
    await frame()
    expect(calls).toEqual([])
    expect(reads()).toBe(0)
  })
})

// The keys' mark (V-1054): a key that moves a list's cursor marks the list's root data-kbd-nav, and the row-hover
// variants (app/globals.css) hold a row's hover look while it is there, since the browser moves :hover with the rows
// a key's scroll carries under a resting pointer. The pointer's first real move, or a press, takes it off; a move to
// where the pointer already was (the page moved under it) leaves it. Set and taken off once a streak, never per key.
describe("keysDrive: the keys' mark on a list, off at the pointer's first real move or press", () => {
  const fire = (type: string, x: number, y: number) =>
    document.body.dispatchEvent(new ((window.PointerEvent ?? MouseEvent) as typeof MouseEvent)(type, { bubbles: true, clientX: x, clientY: y }))
  const list = () => {
    const el = document.createElement("div")
    document.body.append(el)
    return el
  }

  it("marks the list once a streak: one write for many keys", async () => {
    const { keysDrive } = await import("@/lib/ui/listNav")
    const el = list()
    const set = vi.spyOn(el, "setAttribute")
    for (let i = 0; i < 20; i++) keysDrive(el)
    expect(el.hasAttribute("data-kbd-nav")).toBe(true)
    expect(set).toHaveBeenCalledTimes(1)
    fire("pointerdown", 5, 5)
    el.remove()
  })

  it("keeps the mark through a move to where the pointer already was, and takes it off at a move of a pixel", async () => {
    const { keysDrive } = await import("@/lib/ui/listNav")
    fire("pointermove", 100, 200)
    const el = list()
    keysDrive(el)
    // The page scrolled under the resting pointer, and the browser said so with a move to the same place.
    fire("pointermove", 100, 200)
    fire("pointermove", 100.4, 200)
    expect(el.hasAttribute("data-kbd-nav")).toBe(true)
    const off = vi.spyOn(el, "removeAttribute")
    fire("pointermove", 100.4, 202)
    expect(el.hasAttribute("data-kbd-nav")).toBe(false)
    // Off once: more moves write nothing.
    fire("pointermove", 120, 240)
    expect(off).toHaveBeenCalledTimes(1)
    el.remove()
  })

  it("takes the mark off at a press with no move, and marks again at the next key", async () => {
    const { keysDrive } = await import("@/lib/ui/listNav")
    fire("pointermove", 10, 10)
    const el = list()
    keysDrive(el)
    fire("pointerdown", 10, 10)
    expect(el.hasAttribute("data-kbd-nav")).toBe(false)
    keysDrive(el)
    expect(el.hasAttribute("data-kbd-nav")).toBe(true)
    fire("pointermove", 30, 10)
    expect(el.hasAttribute("data-kbd-nav")).toBe(false)
    el.remove()
  })

  it("takes the mark off every list it is on", async () => {
    const { keysDrive } = await import("@/lib/ui/listNav")
    fire("pointermove", 0, 0)
    const a = list()
    const b = list()
    keysDrive(a)
    keysDrive(b)
    fire("pointermove", 4, 0)
    expect([a.hasAttribute("data-kbd-nav"), b.hasAttribute("data-kbd-nav")]).toEqual([false, false])
    a.remove()
    b.remove()
  })

  // V-1054 R1 (CR-340 #2): only a pointer event emptied the hold, so a list that went while marked stayed in it,
  // detached subtree and all, for as long as a keyboard-only user sent none.
  it("lets go of a list released while marked: the mark is off and the hold no longer has it", async () => {
    const { keysDrive, keysRelease } = await import("@/lib/ui/listNav")
    fire("pointermove", 0, 0)
    const el = list()
    keysDrive(el)
    el.remove()
    keysRelease(el)
    expect(el.hasAttribute("data-kbd-nav")).toBe(false)
    // The hold is what a real move takes the mark off; a released list is not in it, so a mark put back by hand stays.
    el.setAttribute("data-kbd-nav", "")
    const off = vi.spyOn(el, "removeAttribute")
    fire("pointermove", 6, 0)
    expect(off).not.toHaveBeenCalled()
  })
})
