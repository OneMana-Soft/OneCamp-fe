// Presenting a board's frames as slides outside a call (miro-28): the deck is
// the Frames panel's order (lib/calls/slides), the presenter steps through it by
// Previous and Next, a clicker's keys and the outline, and ends on Esc or Back to
// canvas; the presenting stamp carries the slide, so every follower lands on it
// fitted to their own screen, and may open the outline to see where they are.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import * as React from "react"
import { act as during, cleanup, fireEvent, render, renderHook, screen, waitFor, within } from "@testing-library/react"
import * as Y from "yjs"
import BoardSlides from "./boardSlides"
import { usePresenterFollow } from "./usePresenterFollow"
import { FIRST_SLIDE, PRESENTING_FIELD, presentersIn, presentingStamp } from "@/lib/board/presenting"
import { moveFrame } from "@/lib/board/frames"
import { listenForEscape } from "@/lib/keys/escape"

// The page's one Escape (lib/keys/escape), as the app shell installs it.
listenForEscape()

let mobile = false
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: mobile, isDesktop: !mobile }) }))

// The slide's hold (presentFrame.holdOnBoard), each drop counted: a hold the canvas doesn't drop puts the slide back on
// the next change of room, a panel opening or a bar changing (presentFrame.test: "lets the camera go when dropped").
const drops = vi.hoisted(() => vi.fn())
vi.mock("@/components/board/presentFrame", async (real) => {
  const m = await real<typeof import("@/components/board/presentFrame")>()
  return {
    ...m,
    holdOnBoard: (api: Parameters<typeof m.holdOnBoard>[0]) => {
      const hold = m.holdOnBoard(api)
      return { ...hold, drop: () => (drops(), hold.drop()) }
    },
  }
})

type El = { id: string; type: string; x: number; y: number; width: number; height: number; name?: string | null; isDeleted?: boolean; frameId?: string }
const frame = (id: string, x: number, name: string | null = null): El => ({ id, type: "frame", x, y: 0, width: 400, height: 300, name })
const note = (id: string): El => ({ id, type: "rectangle", x: 20, y: 20, width: 100, height: 100 })
/** Three frames side by side (reading order Intro, Q4 numbers, Plan) and a note. */
const deck = () => [frame("f1", 0, "Intro"), frame("f2", 500, "Q4 numbers"), frame("f3", 1000, "Plan"), note("n1")]

/** Excalidraw's API as a board's slides use it: a new array on every scene change, the same one on a pan. */
function fakeScene(first: El[] = deck()) {
  let elements: readonly El[] = first
  let selected: Record<string, true> = {}
  const camera = { scrollX: 10, scrollY: 20, zoom: { value: 0.5 } }
  const listeners = new Set<(els: readonly El[]) => void>()
  const api = {
    getSceneElements: () => elements,
    onChange: (l: (els: readonly El[]) => void) => {
      listeners.add(l)
      return () => void listeners.delete(l)
    },
    onScrollChange: () => () => {},
    scrollToContent: vi.fn(),
    updateScene: vi.fn(),
    getAppState: () => ({ selectedElementIds: selected, width: 1000, height: 600, offsetLeft: 0, offsetTop: 0, ...camera }),
  }
  return {
    api: api as never,
    scroll: api.scrollToContent,
    update: api.updateScene,
    set: (next: El[]) => ((elements = next), during(() => [...listeners].forEach((l) => l(elements)))),
    select: (ids: string[]) => (selected = Object.fromEntries(ids.map((id) => [id, true as const]))),
  }
}

/** The frame the camera was put on last, and whether it was fitted as a slide (fitted both ways, the zoom pinned). */
function shown(s: ReturnType<typeof fakeScene>) {
  const [target, opts] = (s.scroll.mock.lastCall ?? []) as [{ id?: string } | undefined, Record<string, unknown> | undefined]
  return { id: target?.id, fits: opts?.fitToViewport === true && typeof opts?.minZoom === "number" && opts.minZoom === opts.maxZoom }
}

const press = (key: string, target: Element = document.body) => during(() => void fireEvent.keyDown(target, { key }))
const rows = () => within(screen.getByRole("list", { name: "Slides, in order" })).getAllByRole("listitem").map((li) => li.textContent)

beforeEach(() => {
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: mobile, media: q, addEventListener: () => {}, removeEventListener: () => {} }))
})
afterEach(() => {
  cleanup()
  mobile = false
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

/** The presenter's slides on `slide`; `on` moves them as the board's facilitation does on onSlide. */
function present(o: { slide?: string; scene?: ReturnType<typeof fakeScene>; doc?: Y.Doc; outline?: boolean } = {}) {
  const s = o.scene ?? fakeScene()
  const doc = o.doc ?? new Y.Doc()
  const onSlide = vi.fn()
  const onOutline = vi.fn()
  const ui = (slide: string, outline: boolean) => <BoardSlides api={s.api} doc={doc} slide={slide} onSlide={onSlide} outline={outline} onOutline={onOutline} />
  const view = render(ui(o.slide ?? "f2", o.outline ?? false))
  return { s, doc, onSlide, onOutline, on: (slide: string, outline = o.outline ?? false) => view.rerender(ui(slide, outline)) }
}

describe("presenting a board's frames as slides, outside a call", () => {
  it("starts at the first slide in the Frames panel's order, and shows each slide fitted to the screen", () => {
    const doc = new Y.Doc()
    doc.getMap("boardMeta").set("frameOrder", ["f3", "f1", "f2"])
    const p = present({ slide: FIRST_SLIDE, doc })
    expect(p.onSlide).toHaveBeenCalledWith("f3")
    p.on("f3")
    expect(shown(p.s)).toEqual({ id: "f3", fits: true })
    p.on("f1")
    expect(shown(p.s)).toEqual({ id: "f1", fits: true })
  })

  it("steps by Previous and Next, and stops at either end", () => {
    const p = present({ slide: "f1" })
    expect(screen.getByRole("button", { name: /^1 of 3 · Intro/ })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Previous slide" })).toBeDisabled()
    fireEvent.click(screen.getByRole("button", { name: "Next slide" }))
    expect(p.onSlide).toHaveBeenLastCalledWith("f2")
    p.on("f3")
    expect(screen.getByRole("button", { name: "Next slide" })).toBeDisabled()
    fireEvent.click(screen.getByRole("button", { name: "Previous slide" }))
    expect(p.onSlide).toHaveBeenLastCalledWith("f2")
  })

  it("follows the Frames panel's order when the frames are reordered while presenting", () => {
    const doc = new Y.Doc()
    const p = present({ slide: "f2", doc, outline: true })
    expect(rows()).toEqual(["1Intro", "2Q4 numbers", "3Plan"])
    // Plan dragged to the top of the Frames panel, by anyone.
    during(() => void doc.getMap("boardMeta").set("frameOrder", moveFrame(["f1", "f2", "f3"], 2, 0)))
    expect(rows()).toEqual(["1Plan", "2Intro", "3Q4 numbers"])
    expect(screen.getAllByRole("button", { name: /^3 of 3 · Q4 numbers/ }).length).toBeGreaterThan(0)
    expect(screen.getByRole("button", { name: "Next slide" })).toBeDisabled()
    fireEvent.click(screen.getByRole("button", { name: "Previous slide" }))
    expect(p.onSlide).toHaveBeenLastCalledWith("f1")
  })

  it("jumps from the outline to any slide, and marks the one that's up", () => {
    const p = present({ slide: "f2", outline: true })
    const list = screen.getByRole("list", { name: "Slides, in order" })
    expect(within(list).getByRole("button", { name: /Q4 numbers/ })).toHaveAttribute("aria-current", "step")
    expect(within(list).getByRole("button", { name: /Plan/ })).not.toHaveAttribute("aria-current")
    fireEvent.click(within(list).getByRole("button", { name: /Plan/ }))
    expect(p.onSlide).toHaveBeenLastCalledWith("f3")
    // The bar's middle opens and closes the outline.
    fireEvent.click(screen.getByRole("button", { name: /^2 of 3 · Q4 numbers/ }))
    expect(p.onOutline).toHaveBeenLastCalledWith(false)
  })

  it("moves on a clicker's PageUp and PageDown, and on the arrows only while nothing on the board is selected", () => {
    const p = present({ slide: "f2" })
    press("PageDown")
    expect(p.onSlide).toHaveBeenLastCalledWith("f3")
    press("ArrowLeft")
    expect(p.onSlide).toHaveBeenLastCalledWith("f1")
    p.onSlide.mockClear()
    p.s.select(["n1"])
    press("ArrowRight")
    const field = document.body.appendChild(document.createElement("input"))
    press("PageDown", field)
    field.remove()
    expect(p.onSlide).not.toHaveBeenCalled()
  })

  it("ends on Esc or End slides, back where the canvas was before the slides", () => {
    const p = present({ slide: FIRST_SLIDE })
    p.on("f1")
    fireEvent.click(screen.getByRole("button", { name: "End slides" }))
    expect(p.onSlide).toHaveBeenLastCalledWith("")
    expect(p.s.update).toHaveBeenLastCalledWith({ appState: { scrollX: 10, scrollY: 20, zoom: { value: 0.5 } } })
    p.on("f2")
    p.onSlide.mockClear()
    // Esc with something selected is Excalidraw's (it lets the selection go).
    p.s.select(["n1"])
    press("Escape")
    expect(p.onSlide).not.toHaveBeenCalled()
    p.s.select([])
    press("Escape")
    expect(p.onSlide).toHaveBeenLastCalledWith("")
    // Back on the canvas, the keys are the board's again.
    p.on("")
    p.onSlide.mockClear()
    press("PageDown")
    expect(p.onSlide).not.toHaveBeenCalled()
    expect(screen.queryByRole("group", { name: "Slides" })).toBeNull()
  })

  it("goes to the canvas while presenting goes on, and Back to slide brings that slide back, fitted", () => {
    const p = present({ slide: FIRST_SLIDE })
    p.on("f2")
    expect(shown(p.s)).toEqual({ id: "f2", fits: true })
    p.s.scroll.mockClear()
    expect(drops).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole("button", { name: "Go to canvas" }))
    // The stamp carries no slide (everyone follows the presenter's view, as plain Present), and the camera stays put:
    // the slide's hold is dropped, so the outline or the grid opening, or a bar changing, doesn't put the slide back.
    expect(p.onSlide).toHaveBeenLastCalledWith("")
    p.on("")
    expect(drops).toHaveBeenCalledTimes(1)
    expect(p.s.update).not.toHaveBeenCalled()
    expect(p.s.scroll).not.toHaveBeenCalled()
    expect(screen.queryByRole("group", { name: "Slides" })).toBeNull()
    // On the canvas the keys are the canvas's: no step, and Esc ends nothing.
    p.onSlide.mockClear()
    press("PageDown")
    press("Escape")
    expect(p.onSlide).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole("button", { name: "Back to slide 2" }))
    expect(p.onSlide).toHaveBeenLastCalledWith("f2")
    p.on("f2")
    expect(shown(p.s)).toEqual({ id: "f2", fits: true })
    expect(screen.queryByRole("button", { name: /^Back to slide/ })).toBeNull()
    expect(screen.getByRole("button", { name: /^2 of 3 · Q4 numbers/ })).toBeTruthy()
  })

  it("ends the slides from the canvas in one press, leaving the camera where it is", () => {
    const p = present({ slide: FIRST_SLIDE })
    p.on("f1")
    fireEvent.click(screen.getByRole("button", { name: "Go to canvas" }))
    p.on("")
    fireEvent.click(screen.getByRole("button", { name: "End slides" }))
    expect(p.onSlide).toHaveBeenLastCalledWith("")
    expect(p.onOutline).toHaveBeenLastCalledWith(false)
    expect(p.s.update).not.toHaveBeenCalled()
    expect(screen.queryByRole("button", { name: /^Back to slide/ })).toBeNull()
  })

  it("waits on the frame in its place when the one it waits on is deleted, and ends with none left", () => {
    const p = present({ slide: "f2" })
    fireEvent.click(screen.getByRole("button", { name: "Go to canvas" }))
    p.on("")
    p.s.set([frame("f1", 0, "Intro"), frame("f3", 1000, "Plan")])
    fireEvent.click(screen.getByRole("button", { name: "Back to slide 2" }))
    expect(p.onSlide).toHaveBeenLastCalledWith("f3")
    p.s.set([note("n1")])
    expect(screen.queryByRole("button", { name: /^Back to slide/ })).toBeNull()
    // The slides end, the camera left where the presenter took it on the canvas.
    expect(p.onSlide).toHaveBeenLastCalledWith("")
    expect(p.s.update).not.toHaveBeenCalled()
  })

  it("ends the slides when the frame of the slide that's up is deleted and none is left, back where the canvas was", () => {
    const p = present({ slide: FIRST_SLIDE })
    p.on("f2")
    p.s.set([frame("f1", 0, "Intro"), frame("f3", 1000, "Plan")])
    expect(p.onSlide).toHaveBeenLastCalledWith("f3")
    p.on("f3")
    p.s.set([note("n1")])
    expect(p.onSlide).toHaveBeenLastCalledWith("")
    expect(p.onOutline).toHaveBeenLastCalledWith(false)
    expect(p.s.update).toHaveBeenLastCalledWith({ appState: { scrollX: 10, scrollY: 20, zoom: { value: 0.5 } } })
  })

  it("marks the slide the deck waits on in the outline's list and grid while the presenter is on the canvas", () => {
    const p = present({ slide: "f2", outline: true })
    fireEvent.click(screen.getByRole("button", { name: "Go to canvas" }))
    p.on("", true)
    const list = screen.getByRole("list", { name: "Slides, in order" })
    expect(within(list).getByRole("button", { name: "2 Q4 numbers" })).toHaveAttribute("aria-current", "step")
    fireEvent.click(screen.getByRole("radio", { name: "Grid" }))
    const grid = screen.getByRole("list", { name: "Slides, in order" })
    expect(grid).toHaveAttribute("data-slides-grid")
    expect(within(grid).getByRole("button", { name: "2 Q4 numbers" })).toHaveAttribute("aria-current", "step")
    expect(within(grid).getByRole("button", { name: "1 Intro" })).not.toHaveAttribute("aria-current")
  })

  it("shows the deck as a grid, each tile with what its frame holds drawn small; a press jumps, the arrows move between tiles", () => {
    // The board's screen, where the slides' own arrows step: the grid's arrows are the grid's.
    document.body.dataset.boardPage = ""
    try {
      const scene = fakeScene([...deck(), { id: "n2", type: "rectangle", x: 520, y: 20, width: 100, height: 100, frameId: "f2" }])
      const p = present({ slide: "f2", outline: true, scene })
      fireEvent.click(screen.getByRole("radio", { name: "Grid" }))
      const grid = screen.getByRole("list", { name: "Slides, in order" })
      expect(grid).toHaveAttribute("data-slides-grid")
      expect(within(grid).getAllByRole("listitem").map((t) => t.textContent)).toEqual(["1Intro", "2Q4 numbers", "3Plan"])
      const [intro, q4, plan] = within(grid).getAllByRole("button")
      // A tile's name keeps a space between its number and its frame's name, though its text runs them together.
      expect(intro).toHaveAccessibleName("1 Intro")
      // The slide that's up is tinted, as the list's row is, and the ring is focus's alone: on the tile a press lands on,
      // never on the current one's thumb, so arrowing from the current tile leaves one ring on screen, not two.
      expect(q4.className).toMatch(/\bbg-brand-muted\b/)
      expect(q4.className).not.toMatch(/(^| )ring-/)
      expect(q4.firstElementChild?.className).not.toMatch(/ring-brand|ring-2/)
      expect(q4.className).toMatch(/\bfocus-visible:ring-2\b/)
      expect(intro.className).not.toMatch(/\bbg-brand-muted\b/)
      // Its paper, and the note in it.
      expect(q4.querySelectorAll("svg rect")).toHaveLength(2)
      expect(q4).toHaveAttribute("aria-current", "step")
      expect(intro).not.toHaveAttribute("aria-current")
      intro.focus()
      press("ArrowRight", intro)
      expect(document.activeElement).toBe(q4)
      press("ArrowLeft", q4)
      press("ArrowDown", intro)
      expect(document.activeElement).toBe(plan)
      expect(p.onSlide).not.toHaveBeenCalled()
      fireEvent.click(plan)
      expect(p.onSlide).toHaveBeenLastCalledWith("f3")
    } finally {
      delete document.body.dataset.boardPage
    }
  })

  it("closes the outline on Esc before Esc ends the slides", () => {
    const p = present({ slide: "f2", outline: true })
    press("Escape")
    expect(p.onOutline).toHaveBeenLastCalledWith(false)
    expect(p.onSlide).not.toHaveBeenCalled()
    p.on("f2", false)
    press("Escape")
    expect(p.onSlide).toHaveBeenLastCalledWith("")
  })

  it("presents as today on a board with no frames, and its outline says how to add one", () => {
    const p = present({ slide: FIRST_SLIDE, scene: fakeScene([note("n1")]), outline: true })
    expect(p.onSlide).toHaveBeenCalledWith("")
    p.on("", true)
    expect(screen.queryByRole("group", { name: "Slides" })).toBeNull()
    expect(screen.getByText("No frames yet")).toBeTruthy()
    expect(screen.getByText(/Add a frame from the Frames panel, or draw one with F/)).toBeTruthy()
    expect(p.s.scroll).not.toHaveBeenCalled()
  })

  it("on a touch screen, the empty outline says how to add a frame without the F key", () => {
    mobile = true
    const p = present({ slide: FIRST_SLIDE, scene: fakeScene([note("n1")]), outline: true })
    p.on("", true)
    const sheet = screen.getByRole("dialog")
    expect(within(sheet).getByText("No frames yet")).toBeTruthy()
    expect(within(sheet).getByText(/^Add a frame from the Frames panel: each frame presents as a slide/)).toBeTruthy()
    expect(sheet.textContent).not.toMatch(/with F\b/)
  })

  it("on a phone, the outline is a sheet with the bar pinned at its foot, its controls 44 px", () => {
    mobile = true
    const p = present({ slide: "f2", outline: true })
    const sheet = screen.getByRole("dialog")
    const bar = within(sheet).getByRole("group", { name: "Slides" })
    expect(bar.closest("[data-sheet-footer]")).not.toBeNull()
    for (const name of ["Previous slide", "Next slide"]) expect(within(bar).getByRole("button", { name }).className).toMatch(/\bsize-11\b/)
    expect(within(sheet).getByRole("list", { name: "Slides, in order" })).toBeTruthy()
    // The grid, two to a row, in the same sheet; on the canvas its foot holds Back to slide.
    fireEvent.click(within(sheet).getByRole("radio", { name: "Grid" }))
    expect(within(sheet).getByRole("list", { name: "Slides, in order" }).className).toMatch(/\bgrid-cols-2\b/)
    fireEvent.click(within(bar.closest("[data-sheet-footer]") as HTMLElement).getByRole("button", { name: "Go to canvas" }))
    p.on("", true)
    expect(within(screen.getByRole("dialog")).getByRole("button", { name: "Back to slide 2" }).closest("[data-sheet-footer]")).not.toBeNull()
  })
})

describe("following a presenter's slides", () => {
  const VIEW = { scrollX: 0, scrollY: 0, zoom: 1, width: 800, height: 600 }
  const editor = { name: "Ann", edit: true }

  /** A board's awareness: each screen's state by client (this one is 1), and its changes. */
  function anAwareness() {
    const states = new Map<number, Record<string, unknown>>([[1, {}]])
    const listeners = new Set<() => void>()
    return {
      awareness: {
        clientID: 1,
        getStates: () => states,
        on: (_: "change", l: () => void) => void listeners.add(l),
        off: (_: "change", l: () => void) => void listeners.delete(l),
      },
      state: (clientId: number, state: Record<string, unknown>) =>
        during(() => {
          states.set(clientId, state)
          listeners.forEach((l) => l())
        }),
    }
  }

  it("the presenting stamp carries the slide the presenter shows, and only a slide", () => {
    const user = { id: "ann", name: "Ann" }
    expect(presentingStamp(user, VIEW, false, "f2")).toEqual({ userId: "ann", name: "Ann", view: VIEW, hold: false, slide: "f2" })
    expect(presentingStamp(user, VIEW, true, "")).toEqual({ userId: "ann", name: "Ann", view: VIEW, hold: true })
    expect(presentingStamp(user, VIEW, false, FIRST_SLIDE)).not.toHaveProperty("slide")
    const a = anAwareness()
    a.state(4, { user: editor, [PRESENTING_FIELD]: presentingStamp(user, VIEW, false, "f2") })
    expect(presentersIn(a.awareness)).toEqual([{ clientId: 4, userId: "ann", name: "Ann", view: VIEW, hold: false, slide: "f2" }])
    // A tab can claim anything: a slide that's no frame's id is dropped, the view still followed.
    a.state(4, { user: editor, [PRESENTING_FIELD]: { userId: "ann", name: "Ann", view: VIEW, slide: "a b" } })
    expect(presentersIn(a.awareness)[0]).not.toHaveProperty("slide")
  })

  it("lands a follower on the presenter's slide, fitted to its own screen, and moves with it", async () => {
    const s = fakeScene()
    const a = anAwareness()
    renderHook(() => usePresenterFollow(s.api, a.awareness))
    a.state(4, { user: editor, [PRESENTING_FIELD]: presentingStamp({ id: "ann", name: "Ann" }, VIEW, false, "f2") })
    await waitFor(() => expect(shown(s)).toEqual({ id: "f2", fits: true }))
    a.state(4, { user: editor, [PRESENTING_FIELD]: presentingStamp({ id: "ann", name: "Ann" }, { ...VIEW, scrollX: -500 }, false, "f3") })
    await waitFor(() => expect(shown(s)).toEqual({ id: "f3", fits: true }))
    // A slide not on this screen's board yet: the presenter's view, as today.
    s.update.mockClear()
    a.state(4, { user: editor, [PRESENTING_FIELD]: presentingStamp({ id: "ann", name: "Ann" }, VIEW, false, "f9") })
    await waitFor(() => expect(s.update).toHaveBeenCalled())
    expect(shown(s).id).toBe("f3")
  })

  it("follows the presenter's view when the slide's code can't come, says so in the slides' place, and Try again asks again", async () => {
    // A fresh copy of the hook, whose slide code (presentFrame, in the slides' own chunk) is refused until `refuse` is
    // lifted. Not a deploy (there's no early script here), so lib/loadChunk says it rather than reloading the page.
    let refuse = true
    vi.resetModules()
    vi.doMock("./boardSlides", async (actual: () => Promise<unknown>) => {
      if (refuse) throw new TypeError("Failed to fetch dynamically imported module")
      return actual()
    })
    try {
      const { usePresenterFollow: follow } = await import("./usePresenterFollow")
      const { SlidesFailed } = await import("./slidesDock")
      const s = fakeScene()
      const a = anAwareness()
      const { result } = renderHook(() => follow(s.api, a.awareness))
      a.state(4, { user: editor, [PRESENTING_FIELD]: presentingStamp({ id: "ann", name: "Ann" }, VIEW, false, "f2") })
      await waitFor(() => expect(result.current.slideFailed).toBe(true))
      // Their view, as for a slide not on this board, and no slide shown.
      expect(s.update).toHaveBeenCalled()
      expect(s.scroll).not.toHaveBeenCalled()
      render(<SlidesFailed retry={() => result.current.retrySlide()} />)
      const part = screen.getByRole("button", { name: /Couldn't load the slides/ })
      expect(part.closest("[data-board-slides]")).not.toBeNull()
      refuse = false
      fireEvent.click(part)
      await waitFor(() => expect(shown(s)).toEqual({ id: "f2", fits: true }))
      expect(result.current.slideFailed).toBe(false)
    } finally {
      vi.doUnmock("./boardSlides")
    }
  })

  it("shows a follower which slide is up, and an outline that moves no one", () => {
    const s = fakeScene()
    const onOutline = vi.fn()
    const { rerender } = render(<BoardSlides api={s.api} doc={new Y.Doc()} slide="f2" outline={false} onOutline={onOutline} />)
    fireEvent.click(screen.getByRole("button", { name: "Slide 2 of 3, Q4 numbers: open the outline" }))
    expect(onOutline).toHaveBeenLastCalledWith(true)
    rerender(<BoardSlides api={s.api} doc={new Y.Doc()} slide="f2" outline onOutline={onOutline} />)
    const list = screen.getByRole("list", { name: "Slides, in order" })
    expect(within(list).queryAllByRole("button")).toEqual([])
    expect(within(list).getByText("Q4 numbers").closest("[aria-current]")).toHaveAttribute("aria-current", "step")
    expect(screen.queryByRole("button", { name: "Next slide" })).toBeNull()
    press("PageDown")
    expect(s.scroll).not.toHaveBeenCalled()
    // Its grid too only shows where the deck is.
    fireEvent.click(screen.getByRole("radio", { name: "Grid" }))
    const grid = screen.getByRole("list", { name: "Slides, in order" })
    expect(within(grid).queryAllByRole("button")).toEqual([])
    expect(within(grid).getByText("Q4 numbers").closest("[aria-current]")).toHaveAttribute("aria-current", "step")
  })
})

// Polls on a presented slide (miro-28 to_win 4): the slides read the board's polls (useSlidePolls) and put the slide's
// card on it (components/board/slidePoll, a piece of its own); Add a poll in the slide bar is the presenter's.
describe("a poll on a presented slide", () => {
  const view = (patch: Record<string, unknown> = {}) => ({
    id: "p1", channel_uuid: "", question: "Ship it?", multiple: false, options: [{ id: "y", text: "Yes", votes: 0 }, { id: "n", text: "No", votes: 0 }],
    voters: 0, mine: [], closed: false, can_close: true, created_by: "u-sam", board_uuid: "b1", frame_id: "f2", ...patch,
  })

  /** The slides on `slide` with the board's polls read through `http` (the presenter's when `presenting`). */
  function withPolls(o: { list?: unknown[]; fails?: boolean; presenting?: boolean } = {}) {
    const s = fakeScene()
    const doc = new Y.Doc()
    const http = {
      get: vi.fn(async () => (o.fails ? Promise.reject({ response: { status: 500, data: {} } }) : { data: { data: o.list ?? [] } })),
      post: vi.fn(async (url: string) => ({ data: { data: url.endsWith("/close") ? view({ closed: true }) : view() } })),
    }
    const presenting = o.presenting ?? true
    const ui = (slide: string) => (
      <BoardSlides api={s.api} doc={doc} slide={slide} onSlide={presenting ? vi.fn() : undefined} outline={false} onOutline={vi.fn()} board="b1" polls={{ board: "b1", http: http as never, topic: "boards/b1" }} />
    )
    const view_ = render(ui("f2"))
    return { http, on: (slide: string) => view_.rerender(ui(slide)) }
  }
  const addAPoll = () => screen.queryByRole("button", { name: "Add a poll" })
  const region = () => screen.findByRole("region", { name: "Poll on this slide" })

  it("Add a poll is the presenter's only, gone while the slide's frame has an open poll, and back, focused, once it's closed", async () => {
    const follower = withPolls({ presenting: false })
    await waitFor(() => expect(follower.http.get).toHaveBeenCalled())
    expect(addAPoll()).toBeNull()
    cleanup()

    const { on } = withPolls({ list: [view()] })
    const card = await region()
    expect(within(card).getByText("Ship it?")).toBeTruthy()
    expect(addAPoll()).toBeNull()
    // Another slide's frame has none: Add a poll is there.
    on("f3")
    await waitFor(() => expect(addAPoll()).not.toBeNull())
    on("f2")
    await waitFor(() => expect(addAPoll()).toBeNull())
    fireEvent.click(within(await region()).getByRole("button", { name: "Close poll" }))
    await waitFor(() => expect(addAPoll()).not.toBeNull())
    await waitFor(() => expect(document.activeElement).toBe(addAPoll()))
  })

  // miro-28's Add a poll made the phone's bar five 44 px controls and the name, and at 390 "2 of 3 · Q4 numbers" (119 px
  // of Inter) was cut (DB-133 F2). Chromium at 390 with touch gives the bar 354 px; the group's gap there is its classes'
  // only when it is no touch group, for under a finger phone.css F3b sets a touch group's (12 px for "32") whatever its
  // classes say: that is what kept the name cut once the classes' gaps were gone. On a phone the bar drops its divider,
  // the slide group is no touch group and has no gap, and the name's padding is the phone's own, so the name gets 126 px;
  // every control stays 44 px. A computer's bar is as it was, its arrows a touch group of 32 px controls.
  it("on a phone, the presenter's bar holds the slides, Add a poll, Go to canvas and End slides at 44 px, with no divider and no touch spacing", async () => {
    mobile = true
    withPolls()
    await waitFor(() => expect(addAPoll()).not.toBeNull())
    const bar = screen.getByRole("toolbar", { name: "Slide controls" })
    expect(within(bar).getAllByRole("button").map((b) => b.getAttribute("aria-label") ?? b.textContent)).toEqual([
      "Previous slide",
      "2 of 3 · Q4 numbers",
      "Next slide",
      "Add a poll",
      "Go to canvas",
      "End slides",
    ])
    for (const b of within(bar).getAllByRole("button")) expect(b.className).toMatch(/\b(size-11|h-11)\b/)
    expect(bar.querySelector(":scope > [aria-hidden=true]")).toBeNull()
    const slides = within(bar).getByRole("group", { name: "Slides" })
    expect(slides.hasAttribute("data-touch-group"), "under a finger a touch group's gap is phone.css F3b's, not its classes'").toBe(false)
    expect(slides.className).not.toMatch(/\bgap-/)
    expect(within(bar).getByRole("button", { name: /^2 of 3/ }).className).toMatch(/\bpx-1\b/)
  })

  it("on a computer, the presenter's bar keeps its divider and its spacing", async () => {
    withPolls()
    await waitFor(() => expect(addAPoll()).not.toBeNull())
    const bar = screen.getByRole("toolbar", { name: "Slide controls" })
    expect(bar.querySelectorAll(":scope > [aria-hidden=true]")).toHaveLength(1)
    expect(within(bar).getByRole("group", { name: "Slides" }).className).toMatch(/\bgap-1\b/)
    expect(within(bar).getByRole("group", { name: "Slides" }).getAttribute("data-touch-group")).toBe("32")
    expect(within(bar).getByRole("button", { name: /^2 of 3/ }).className).toMatch(/\bpx-2\.5\b/)
  })

  it("a failed read puts its card on the slide, with Try again", async () => {
    const { http } = withPolls({ fails: true })
    const card = await region()
    expect(within(card).getByText("Couldn't load this slide's poll")).toBeTruthy()
    const asked = http.get.mock.calls.length
    fireEvent.click(within(card).getByRole("button", { name: "Try again" }))
    await waitFor(() => expect(http.get.mock.calls.length).toBe(asked + 1))
  })

  it("the composer closes when the slide changes", async () => {
    const { on } = withPolls()
    await waitFor(() => expect(addAPoll()).not.toBeNull())
    fireEvent.click(addAPoll()!)
    expect(await screen.findByRole("form", { name: "New poll" })).toBeTruthy()
    on("f3")
    await waitFor(() => expect(screen.queryByRole("form", { name: "New poll" })).toBeNull())
  })

  it("on a phone, the poll's bar sits in the slides' dock above the slide bar, so the slide's fit leaves its strip", async () => {
    mobile = true
    withPolls({ list: [view()] })
    const bar = await screen.findByRole("button", { name: /^Poll on this slide: Ship it\?/ })
    const dock = bar.closest<HTMLElement>("[data-board-slides]")
    expect(dock).not.toBeNull()
    expect(within(dock!).getByRole("toolbar", { name: "Slide controls" })).toBeTruthy()
  })

  it("a phone held sideways (a sheet's screen at a computer's width) gets the bar in the dock too: the sheet rule chooses it, not isMobile", async () => {
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: true, media: q, addEventListener: () => {}, removeEventListener: () => {} }))
    withPolls({ list: [view()] })
    const bar = await screen.findByRole("button", { name: /^Poll on this slide: Ship it\?/ })
    expect(bar.closest("[data-board-slides]")).not.toBeNull()
    expect(screen.queryByRole("region", { name: "Poll on this slide" })).toBeNull()
  })
})
