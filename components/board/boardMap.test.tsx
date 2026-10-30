import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { boardScene, convertForTest, type TestElement } from "@/lib/testing/boardScene"
import { installPointerEvent } from "@/lib/testing/pointerEvent"
import { noteSkeleton } from "@/lib/board/notes"
import { fromMap, mapFrame, shownBox, type MapFrame } from "@/lib/board/boardMap"
import { drawnBox } from "@/lib/board/scene"
import { centreOn } from "@/lib/board/hereNow"
import { BoardMap, MAP_H, MAP_W } from "./boardMap"

// The board's map on a computer (miro-04 3): a Map button at the end of the
// zoom and undo cluster opens a card with the drawing and the part this screen
// shows; a press, a drag or the arrow keys move the board there, and open or
// closed is kept for the next board. The rules are lib/board/boardMap's.

installPointerEvent()

const KEPT = "onecamp:board:map"
const MAP = "Board map: press or drag to go there, or use the arrow keys"
const SCREEN = { width: 1000, height: 800, zoom: 1 }

const note = (id: string, x: number, y: number): TestElement[] => convertForTest([noteSkeleton({ id, x, y, text: `Note ${id}` }) as never])
/** Two notes a long way apart, so the drawing is wider and taller than the screen (1000 x 800 at 100%). */
const board = () => boardScene([...note("a", 0, 0), ...note("b", 2000, 1200)])
type Scene = ReturnType<typeof board>

/** The page's Excalidraw, as far as the map's button looks for it: the zoom and undo cluster. */
function excalidraw() {
  const host = document.createElement("div")
  host.innerHTML = '<div class="layer-ui__wrapper__footer-left"><div class="Stack"><section><button type="button">Zoom in</button></section></div></div>'
  document.body.append(host)
  return host
}

const frameOf = (els: readonly TestElement[], view: { scrollX: number; scrollY: number; zoom: number; width: number; height: number }): MapFrame =>
  mapFrame(drawnBox(els), shownBox(view), MAP_W, MAP_H)
const camera = (s: Scene) => s.writes.at(-1)?.appState

// The view is read on the next animation frame: frames run when a test says so.
let frames: FrameRequestCallback[] = []
const nextFrame = () =>
  act(() => {
    const due = frames
    frames = []
    due.forEach((f) => f(0))
  })

beforeEach(() => {
  localStorage.clear()
  frames = []
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((f) => frames.push(f))
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {})
  // jsdom draws nothing: no 2D context unless a test brings its own.
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => null)
})
afterEach(() => {
  cleanup()
  document.body.innerHTML = ""
  vi.restoreAllMocks()
})

describe("the board's map", () => {
  it("has its button at the end of the zoom and undo cluster, opens and closes there, and keeps that for the next board", () => {
    const host = excalidraw()
    const first = render(<BoardMap api={board().api} host={host} />)
    const button = screen.getByRole("button", { name: "Board map" })
    expect(host.querySelector("section")!.lastElementChild!.contains(button)).toBe(true)
    expect(button.getAttribute("aria-pressed")).toBe("false")
    expect(screen.queryByRole("application")).toBeNull()

    fireEvent.click(button)
    expect(button.getAttribute("aria-pressed")).toBe("true")
    expect(screen.getByRole("application", { name: MAP })).toBeTruthy()
    expect(localStorage.getItem(KEPT)).toBe("true")

    // The next board opens with its map open, and closing it is kept too.
    first.unmount()
    render(<BoardMap api={board().api} host={host} />)
    expect(screen.getByRole("application", { name: MAP })).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Board map" }))
    expect(screen.queryByRole("application")).toBeNull()
    expect(localStorage.getItem(KEPT)).toBe("false")
  })

  it("outlines the part of the board this screen shows", () => {
    localStorage.setItem(KEPT, "true")
    const s = board()
    render(<BoardMap api={s.api} host={excalidraw()} />)
    const f = frameOf(s.elements(), { scrollX: 0, scrollY: 0, ...SCREEN })
    const outline = document.querySelector<HTMLElement>("[data-board-map-view]")!
    expect(outline.style.left).toBe(`${f.ox}px`)
    expect(outline.style.top).toBe(`${f.oy}px`)
    expect(outline.style.width).toBe(`${SCREEN.width * f.scale}px`)
    expect(outline.style.height).toBe(`${SCREEN.height * f.scale}px`)
  })

  it("brings the part of the board pressed to the middle of the screen, and holds the map still while a drag goes on", async () => {
    localStorage.setItem(KEPT, "true")
    const s = board()
    render(<BoardMap api={s.api} host={excalidraw()} />)
    const map = screen.getByRole("application", { name: MAP })
    const f = frameOf(s.elements(), { scrollX: 0, scrollY: 0, ...SCREEN })

    // A press at the map's far corner: the board goes there.
    fireEvent.pointerDown(map, { clientX: MAP_W - 4, clientY: MAP_H - 4, pointerId: 1 })
    expect(camera(s)).toEqual(centreOn(SCREEN, fromMap(f, MAP_W - 4, MAP_H - 4)))
    // There, the screen reaches past the drawing, so the map would take a new frame...
    const moved = camera(s) as { scrollX: number; scrollY: number }
    expect(frameOf(s.elements(), { ...moved, ...SCREEN })).not.toEqual(f)
    await nextFrame()

    // ...but while the press is held, the map keeps the one it was pressed in, so a drag goes where the pointer is.
    fireEvent.pointerMove(map, { clientX: 60, clientY: 40, pointerId: 1 })
    expect(camera(s)).toEqual(centreOn(SCREEN, fromMap(f, 60, 40)))
    fireEvent.pointerUp(map, { pointerId: 1 })

    // Let go, a pointer passing over the map moves nothing.
    const writes = s.writes.length
    fireEvent.pointerMove(map, { clientX: 10, clientY: 10, pointerId: 1 })
    expect(s.writes.length).toBe(writes)
  })

  it("moves the board a quarter of the screen for each arrow key while the map has the focus", async () => {
    localStorage.setItem(KEPT, "true")
    const s = board()
    render(<BoardMap api={s.api} host={excalidraw()} />)
    const map = screen.getByRole("application", { name: MAP })
    expect(map.tabIndex).toBe(0)
    // Excalidraw hears keys on the document, and nudges what is selected with the arrows: it never hears the map's.
    const excalidrawHeard = vi.fn()
    document.addEventListener("keydown", excalidrawHeard)

    fireEvent.keyDown(map, { key: "ArrowRight" })
    expect(camera(s)).toEqual({ scrollX: -250, scrollY: 0 })
    expect(excalidrawHeard).not.toHaveBeenCalled()
    await nextFrame()
    fireEvent.keyDown(map, { key: "ArrowUp" })
    expect(camera(s)).toEqual({ scrollX: -250, scrollY: 200 })

    // Any other key is the page's.
    const writes = s.writes.length
    fireEvent.keyDown(map, { key: "a" })
    expect(s.writes.length).toBe(writes)
    expect(excalidrawHeard).toHaveBeenCalledTimes(1)
    document.removeEventListener("keydown", excalidrawHeard)
  })

  it("paints the drawing again for a change to the board, never for a pan inside it", async () => {
    // Excalidraw hands its listeners the same elements while only the camera moves: a scene that does too.
    let elements: readonly TestElement[] = [...note("a", 0, 0), ...note("b", 2000, 1200)]
    let state = { scrollX: 0, scrollY: 0, zoom: { value: 1 }, width: 1000, height: 800, offsetLeft: 0, offsetTop: 0 }
    const heard = new Set<(els: readonly TestElement[]) => void>()
    const tell = () => heard.forEach((l) => l(elements))
    const api = {
      getSceneElements: () => elements,
      getAppState: () => state,
      updateScene: () => {},
      onChange: (l: (els: readonly TestElement[]) => void) => (heard.add(l), () => heard.delete(l)),
      onScrollChange: () => () => {},
    }
    const ctx = { clearRect: vi.fn(), setTransform() {}, fillRect() {}, strokeRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {} }
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => ctx as never)
    localStorage.setItem(KEPT, "true")
    render(<BoardMap api={api as never} host={excalidraw()} />)
    expect(ctx.clearRect).toHaveBeenCalledTimes(1)

    // A pan inside the drawing: the outline moves, the drawing isn't painted again.
    const outline = () => document.querySelector<HTMLElement>("[data-board-map-view]")!.style.left
    const before = outline()
    state = { ...state, scrollX: -300, scrollY: -100 }
    tell()
    await nextFrame()
    expect(outline()).not.toBe(before)
    expect(ctx.clearRect).toHaveBeenCalledTimes(1)

    // A new note is painted.
    elements = [...elements, ...note("c", 900, 600)]
    tell()
    await nextFrame()
    expect(ctx.clearRect).toHaveBeenCalledTimes(2)
  })
})
