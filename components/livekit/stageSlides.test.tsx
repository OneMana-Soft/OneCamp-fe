// Slides control on a call's stage (meet-14): everyone's camera follows the
// room's slide (useStageSlide), and the bar (StageSlides) moves it for those
// who may, by button, by the list, and by a clicker's keys, one ask at a time.

import { afterEach, describe, expect, it, vi } from "vitest"
import * as React from "react"
import { act as during, cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react"
import * as Y from "yjs"
import type { CallAct } from "./callHosting"
import { SLIDE_COVER } from "@/components/board/presentFrame"
import { StageSlides, useStageSlide, type SlideCamera, type SlideScene } from "./stageSlides"

type El = { id: string; type: string; x: number; y: number; width: number; height: number; name?: string | null }
const frame = (id: string, x: number, name: string | null = null): El => ({ id, type: "frame", x, y: 0, width: 400, height: 300, name })
const note = (id: string): El => ({ id, type: "rectangle", x: 20, y: 20, width: 100, height: 100 })

/** Excalidraw's API, as the stage uses it: a new array on every scene change, the same one on a pan. */
function fakeScene(first: El[] = []) {
  let elements: readonly El[] = first
  let selected: Record<string, true> = {}
  let size = { width: 1000, height: 600 }
  const listeners = new Set<(els: readonly El[]) => void>()
  const api = {
    getSceneElements: () => elements,
    onChange: (l: (els: readonly El[]) => void) => {
      listeners.add(l)
      return () => void listeners.delete(l)
    },
    scrollToContent: vi.fn(),
    getAppState: () => ({ selectedElementIds: selected, ...size }),
  }
  const tell = () => during(() => [...listeners].forEach((l) => l(elements)))
  return {
    api: api as unknown as SlideCamera & SlideScene,
    scroll: api.scrollToContent,
    set: (next: El[]) => ((elements = next), tell()),
    pan: tell,
    select: (ids: string[]) => (selected = Object.fromEntries(ids.map((id) => [id, true as const]))),
    listening: () => listeners.size,
    /** Excalidraw takes a new canvas size (in an update of its own). */
    resize: (width: number, height: number) => (size = { width, height }),
  }
}

/**
 * The slide the camera showed last: its frame, whether it animated, and whether
 * it filled the stage (DESIGN-BUILD-63's MUST): fitted both ways, with the zoom
 * pinned, and above 1 for a frame smaller than the canvas.
 */
function shown(s: ReturnType<typeof fakeScene>) {
  const [target, opts] = (s.scroll.mock.lastCall ?? []) as [{ id?: string } | string | undefined, Record<string, unknown> | undefined]
  const zoom = opts?.minZoom
  return {
    id: typeof target === "object" ? target?.id : undefined,
    animate: opts?.animate,
    fills: opts?.fitToViewport === true && typeof zoom === "number" && zoom === opts?.maxZoom && zoom > 1,
  }
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

describe("the stage's camera and the room's slide", () => {
  it("goes to the slide once its frame reaches the scene, and stays while people draw and pan", () => {
    const s = fakeScene()
    renderHook(() => useStageSlide(s.api, "b1", "f2"))
    expect(s.scroll).not.toHaveBeenCalled()
    s.set([frame("f1", 0), frame("f2", 500)])
    expect(s.scroll).toHaveBeenCalledTimes(1)
    expect(shown(s)).toEqual({ id: "f2", animate: false, fills: true })
    s.set([frame("f1", 0), frame("f2", 500), note("n1")])
    s.pan()
    expect(s.scroll).toHaveBeenCalledTimes(1)
    expect(s.listening()).toBe(0)
  })

  it("moves to each new slide, animated, and frames the whole drawing once when the slide goes", () => {
    const s = fakeScene([frame("f1", 0), frame("f2", 500), note("n1")])
    const { rerender } = renderHook(({ slide }) => useStageSlide(s.api, "b1", slide), { initialProps: { slide: "f1" } })
    expect(shown(s)).toEqual({ id: "f1", animate: false, fills: true })
    rerender({ slide: "f2" })
    expect(shown(s)).toEqual({ id: "f2", animate: true, fills: true })
    rerender({ slide: "" })
    expect(s.scroll).toHaveBeenLastCalledWith(s.api.getSceneElements(), { fitToContent: true, animate: true })
    rerender({ slide: "" })
    expect(s.scroll).toHaveBeenCalledTimes(3)
  })

  it("leaves a board that opens on the whole board to the canvas's own first camera, on every board", () => {
    const s = fakeScene([frame("f1", 0)])
    const { rerender } = renderHook(({ board, slide }) => useStageSlide(s.api, board, slide), { initialProps: { board: "b1", slide: "" } })
    rerender({ board: "b1", slide: "f1" })
    expect(s.scroll).toHaveBeenCalledTimes(1)
    // Another board up: its first camera is the canvas's again.
    rerender({ board: "b2", slide: "" })
    expect(s.scroll).toHaveBeenCalledTimes(1)
  })

  it("frames the drawing for someone who'd land on a slide that isn't on the board, and fits the slide if it turns up", () => {
    const s = fakeScene()
    renderHook(() => useStageSlide(s.api, "b1", "f9"))
    const drawing = [frame("f1", 0), note("n1")]
    s.set(drawing)
    expect(s.scroll).toHaveBeenCalledTimes(1)
    expect(s.scroll).toHaveBeenCalledWith(drawing, { fitToContent: true, animate: false })
    s.set([...drawing, note("n2")])
    expect(s.scroll).toHaveBeenCalledTimes(1)
    s.set([...drawing, frame("f9", 900)])
    expect(shown(s)).toEqual({ id: "f9", animate: false, fills: true })
  })

  it("marks the stage with the slide its camera was put on, and fits it again when asked", () => {
    const s = fakeScene([frame("f1", 0)])
    const mark = { current: document.createElement("div") }
    const { result } = renderHook(() => useStageSlide(s.api, "b1", "f1", mark))
    expect(mark.current.dataset.slidePlaced).toBe("f1")
    result.current()
    expect(shown(s)).toEqual({ id: "f1", animate: true, fills: true })
  })

  it("keeps the slide clear of the call's pills over the canvas, measured in the stage", () => {
    const s = fakeScene([frame("f1", 0)])
    const stage = { current: document.createElement("div") }
    stage.current.innerHTML = `<div data-board-bar="overlay"></div><div class="excalidraw"></div>`
    const at = (top: number, height: number) => () => ({ top, bottom: top + height, left: 0, right: 1000, width: 1000, height, x: 0, y: top }) as DOMRect
    stage.current.querySelector(".excalidraw")!.getBoundingClientRect = at(0, 600)
    stage.current.querySelector("[data-board-bar]")!.getBoundingClientRect = at(8, 40)
    renderHook(() => useStageSlide(s.api, "b1", "f1", stage))
    // The canvas is 1000 x 600 and the frame 400 x 300: the height left under the pills binds.
    expect(s.scroll.mock.lastCall?.[1]).toMatchObject({ canvasOffsets: { top: 48, right: 0, bottom: 0, left: 0 }, minZoom: ((600 - 48) / 300) * SLIDE_COVER })
  })

  /**
   * A phone's stage for `s`: the call's pills are a row above the canvas. The
   * one ResizeObserver reports when the test says, and the frames a hold asks
   * for run a round at a time.
   */
  function phoneStage(s: ReturnType<typeof fakeScene>) {
    const reports: (() => void)[] = []
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(report: () => void) {
          reports.push(report)
        }
        observe() {}
        disconnect() {}
      },
    )
    const frames: FrameRequestCallback[] = []
    vi.stubGlobal("requestAnimationFrame", (f: FrameRequestCallback) => frames.push(f))
    vi.stubGlobal("cancelAnimationFrame", () => {})
    const tick = () => frames.splice(0).forEach((f) => f(0))
    const stage = { current: document.createElement("div") }
    stage.current.innerHTML = `<div data-board-bar="row"></div><div class="excalidraw"></div>`
    const canvas = stage.current.querySelector(".excalidraw")!
    let height = 600
    canvas.getBoundingClientRect = () => ({ top: 700 - height, bottom: 700, left: 0, right: 1000, width: 1000, height, x: 0, y: 700 - height }) as DOMRect
    // The row above the canvas grows by `by` px, and Excalidraw takes the canvas's new size.
    const grow = (by: number) => {
      height -= by
      during(() => reports.forEach((r) => r()))
      tick()
      s.resize(1000, height)
      tick()
    }
    return { stage, canvas, tick, grow }
  }

  it("keeps the slide filling the stage as its room changes, until a person moves the camera", () => {
    const s = fakeScene([frame("f1", 0), frame("f2", 500)])
    const { stage, canvas, tick, grow } = phoneStage(s)
    const { result, rerender } = renderHook(({ slide }) => useStageSlide(s.api, "b1", slide, stage), { initialProps: { slide: "f1" } })
    tick()
    expect(s.scroll).toHaveBeenCalledTimes(1)
    // The presenter's slides join the row and it wraps: the slide is shown again in the room left, at once.
    grow(100)
    expect(s.scroll).toHaveBeenCalledTimes(2)
    expect(s.scroll.mock.lastCall?.[1]).toMatchObject({ minZoom: (500 / 300) * SLIDE_COVER, animate: false })
    // Once a person moves the camera, it's theirs, until the slide is shown again.
    fireEvent.pointerDown(canvas)
    grow(100)
    expect(s.scroll).toHaveBeenCalledTimes(2)
    during(() => result.current())
    grow(-100)
    expect(s.scroll).toHaveBeenCalledTimes(4)
    expect(s.scroll.mock.lastCall?.[1]).toMatchObject({ minZoom: (500 / 300) * SLIDE_COVER, animate: false })
    // On the whole board, the canvas keeps the camera.
    rerender({ slide: "" })
    grow(100)
    expect(s.scroll).toHaveBeenCalledTimes(5)
  })

  it("stops holding the slide once the stage is gone", () => {
    const s = fakeScene([frame("f1", 0)])
    const { stage, tick, grow } = phoneStage(s)
    const { unmount } = renderHook(() => useStageSlide(s.api, "b1", "f1", stage))
    tick()
    expect(s.scroll).toHaveBeenCalledTimes(1)
    unmount()
    // The room changes after the stage has gone: nothing moves the camera.
    grow(100)
    expect(s.scroll).toHaveBeenCalledTimes(1)
  })
})

describe("the stage's slides bar", () => {
  const deck = () => [frame("f1", 0, "Intro"), frame("f2", 500, "Q4 numbers"), frame("f3", 1000), note("n1")]
  const act = vi.fn<CallAct>(() => Promise.resolve(true))
  const refit = vi.fn()
  const stageRef = { current: null as HTMLDivElement | null }
  function bar(o: { slide?: string; moves?: boolean; scene?: ReturnType<typeof fakeScene>; doc?: Y.Doc } = {}) {
    const s = o.scene ?? fakeScene(deck())
    const stage = (slide: string) => (
      <div ref={(el) => void (stageRef.current = el)} data-stage="">
        <StageSlides api={s.api} doc={o.doc} slide={slide} moves={o.moves ?? true} act={act} refit={refit} stage={stageRef} />
      </div>
    )
    const view = render(stage(o.slide ?? "f2"))
    /** The room's metadata puts it on `slide` (this mover's ask answered, or another mover's). */
    const roomOn = (slide: string) => view.rerender(stage(slide))
    return { s, roomOn, ...view }
  }
  const press = (key: string, target: Element = document.body, more: KeyboardEventInit = {}) => during(() => void fireEvent.keyDown(target, { key, ...more }))

  it("gives a mover Previous, the slide it's on and Next, and moves everyone's", async () => {
    bar()
    expect(screen.getByRole("group", { name: "Slides" })).toHaveAttribute("data-touch-group", "32")
    expect(screen.getByRole("button", { name: /^2 of 3 · Q4 numbers/ })).toBeTruthy()
    await during(async () => fireEvent.click(screen.getByRole("button", { name: "Next slide" })))
    expect(act).toHaveBeenCalledWith("board_slide", { slide: "f3" })
    cleanup()
    bar()
    await during(async () => fireEvent.click(screen.getByRole("button", { name: "Previous slide" })))
    expect(act).toHaveBeenLastCalledWith("board_slide", { slide: "f1" })
  })

  it("stops at either end, and starts from the whole board at the first slide", async () => {
    bar({ slide: "f3" })
    expect(screen.getByRole("button", { name: "Next slide" })).toBeDisabled()
    cleanup()
    bar({ slide: "" })
    expect(screen.getByRole("button", { name: /^Whole board/ })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Previous slide" })).toBeDisabled()
    await during(async () => fireEvent.click(screen.getByRole("button", { name: "Next slide" })))
    expect(act).toHaveBeenCalledWith("board_slide", { slide: "f1" })
  })

  it("lists every slide in the board's kept order and the whole board, and shows again the one that's up", async () => {
    const doc = new Y.Doc()
    doc.getMap("boardMeta").set("frameOrder", ["f3", "f1"])
    bar({ doc, slide: "f1" })
    fireEvent.keyDown(screen.getByRole("button", { name: /^2 of 3 · Intro/ }), { key: "Enter" })
    const rows = await screen.findAllByRole("menuitemradio")
    expect(rows.map((r) => r.textContent)).toEqual(["Whole board", "1Untitled frame", "2Intro", "3Q4 numbers"])
    expect(rows[2]).toHaveAttribute("aria-checked", "true")
    await during(async () => fireEvent.click(rows[2]))
    expect(act).not.toHaveBeenCalled()
    expect(refit).toHaveBeenCalledTimes(1)
    fireEvent.keyDown(screen.getByRole("button", { name: /^2 of 3 · Intro/ }), { key: "Enter" })
    await during(async () => fireEvent.click((await screen.findAllByRole("menuitemradio"))[0]))
    expect(act).toHaveBeenCalledWith("board_slide", { slide: "" })
  })

  it("takes the room to the whole board from a slide that isn't on the board", async () => {
    // The room's slide is a frame someone has since deleted: the bar reads Whole board, and picking it moves everyone.
    bar({ slide: "f9" })
    fireEvent.keyDown(screen.getByRole("button", { name: /^Whole board/ }), { key: "Enter" })
    const rows = await screen.findAllByRole("menuitemradio")
    expect(rows[0]).toHaveAttribute("aria-checked", "true")
    await during(async () => fireEvent.click(rows[0]))
    expect(refit).not.toHaveBeenCalled()
    expect(act).toHaveBeenCalledWith("board_slide", { slide: "" })
  })

  it("moves on a clicker's PageUp and PageDown from anywhere but a field, a dialog or a menu", async () => {
    bar()
    const field = document.body.appendChild(document.createElement("input"))
    await press("PageDown", field)
    const dialog = document.body.appendChild(document.createElement("div"))
    dialog.setAttribute("role", "dialog")
    await press("PageDown", dialog)
    await press("PageDown", document.body, { ctrlKey: true })
    expect(act).not.toHaveBeenCalled()
    await press("PageDown")
    expect(act).toHaveBeenCalledWith("board_slide", { slide: "f3" })
    field.remove()
    dialog.remove()
  })

  it("moves on the arrow keys only on the board, and only while nothing on it is selected", async () => {
    const { s } = bar()
    const elsewhere = document.body.appendChild(document.createElement("button"))
    await press("ArrowRight", elsewhere)
    expect(act).not.toHaveBeenCalled()
    s.select(["n1"])
    await press("ArrowLeft", stageRef.current!)
    expect(act).not.toHaveBeenCalled()
    s.select([])
    await press("ArrowLeft", stageRef.current!)
    expect(act).toHaveBeenCalledWith("board_slide", { slide: "f1" })
    elsewhere.remove()
  })

  it("keeps one ask in flight, sends where quick presses ended, and counts from the room's slide after a refusal", async () => {
    const s = fakeScene([frame("f1", 0), frame("f2", 500), frame("f3", 1000), frame("f4", 1500)])
    let answer: (ok: boolean) => void = () => {}
    act.mockImplementation(() => new Promise<boolean>((r) => (answer = r)))
    bar({ scene: s, slide: "f1" })
    await press("PageDown")
    await press("PageDown")
    await press("PageDown")
    expect(act).toHaveBeenCalledTimes(1)
    expect(act).toHaveBeenCalledWith("board_slide", { slide: "f2" })
    await during(async () => answer(true))
    expect(act).toHaveBeenCalledTimes(2)
    expect(act).toHaveBeenLastCalledWith("board_slide", { slide: "f4" })
    // Refused (act says why): the next press counts from the room's slide, f1, again.
    await during(async () => answer(false))
    await press("PageDown")
    expect(act).toHaveBeenLastCalledWith("board_slide", { slide: "f2" })
    act.mockImplementation(() => Promise.resolve(true))
  })

  it("counts from the room's slide once it moves, when another mover moved it past the ask", async () => {
    const s = fakeScene([frame("f1", 0), frame("f2", 500), frame("f3", 1000), frame("f4", 1500)])
    let answer: (ok: boolean) => void = () => {}
    act.mockImplementationOnce(() => new Promise<boolean>((r) => (answer = r)))
    const { roomOn } = bar({ scene: s, slide: "f1" })
    await press("PageDown")
    expect(act).toHaveBeenLastCalledWith("board_slide", { slide: "f2" })
    await during(async () => answer(true))
    // Answered, and before the room says f2, another mover puts it on f3: the next press goes on from f3, not from the ask.
    roomOn("f3")
    await press("PageDown")
    expect(act).toHaveBeenCalledTimes(2)
    expect(act).toHaveBeenLastCalledWith("board_slide", { slide: "f4" })
  })

  it("shows everyone else the slide that's up, to see again after a pan, and no keys or bar to move it", async () => {
    bar({ moves: false })
    expect(screen.queryByRole("group", { name: "Slides" })).toBeNull()
    await during(async () => fireEvent.click(screen.getByRole("button", { name: "Slide 2 of 3, Q4 numbers: show it again" })))
    expect(refit).toHaveBeenCalledTimes(1)
    await press("PageDown")
    expect(act).not.toHaveBeenCalled()
    cleanup()
    bar({ moves: false, slide: "" })
    expect(screen.queryByRole("button")).toBeNull()
  })

  it("draws nothing while the board has no frames", () => {
    const { container } = bar({ scene: fakeScene([note("n1")]) })
    expect(container.querySelector("[data-stage]")?.childElementCount).toBe(0)
  })

  it("says the slide to a screen reader as it moves", () => {
    const { rerender, s } = bar({ moves: false })
    expect(document.querySelector("[aria-live='polite']")?.textContent).toBe("Slide 2 of 3, Q4 numbers")
    rerender(
      <div data-stage="">
        <StageSlides api={s.api} doc={undefined} slide="f3" moves={false} refit={refit} stage={stageRef} />
      </div>,
    )
    expect(document.querySelector("[aria-live='polite']")?.textContent).toBe("Slide 3 of 3")
  })
})
