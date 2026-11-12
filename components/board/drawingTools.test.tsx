import * as React from "react"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import DrawingTools from "./drawingTools"

// Excalidraw's converter, stood in: the skeleton it is handed, with an id. While `converter.hold` is pending, it is
// still loading.
const converter = vi.hoisted(() => ({ hold: null as Promise<void> | null, asked: 0 }))
vi.mock("@/components/board/boardOps", async (original) => ({
  ...(await original<typeof import("@/components/board/boardOps")>()),
  loadConvert: async () => {
    converter.asked++
    if (converter.hold) await converter.hold
    return (skeletons: Record<string, unknown>[]) => skeletons.map((s, i) => ({ id: `made-${i}`, version: 1, ...s }))
  },
}))

type El = { id: string; type: string; x: number; y: number; isDeleted?: boolean; points?: number[][]; [k: string]: unknown }

/** A canvas as the tools meet it: Excalidraw's tool row with its pen, a canvas to draw on, and the scene and state they read and write. */
function board() {
  const host = document.createElement("div")
  host.innerHTML = `<div class="excalidraw"><div class="App-toolbar"><label class="ToolIcon Shape"><input type="radio" class="ToolIcon_type_radio ToolIcon_size_medium" data-testid="toolbar-freedraw" checked /><div class="ToolIcon__icon"></div></label></div><canvas></canvas></div>`
  document.body.append(host)
  const state = { activeTool: { type: "selection" }, currentItemStrokeColor: "#1e1e1e", currentItemStrokeWidth: 2, currentItemOpacity: 100, currentItemRoundness: "round", newElement: null as { id: string } | null }
  let elements: El[] = []
  const heard = new Set<(e: El[], s: typeof state) => void>()
  const tell = () => heard.forEach((h) => h(elements, state))
  const api = {
    getAppState: () => state,
    getSceneElements: () => elements.filter((e) => !e.isDeleted),
    getSceneElementsIncludingDeleted: () => elements,
    setActiveTool: vi.fn((tool: { type: string }) => {
      state.activeTool = tool
      tell()
    }),
    updateScene: vi.fn((data: { appState?: object; elements?: El[]; captureUpdate?: string }) => {
      if (data.appState) Object.assign(state, data.appState)
      if (data.elements) elements = data.elements
      tell()
    }),
    onChange: (h: (e: El[], s: typeof state) => void) => {
      heard.add(h)
      return () => heard.delete(h)
    },
  }
  const canvas = host.querySelector("canvas")!
  let now = 1_000
  vi.spyOn(Date, "now").mockImplementation(() => now)
  const pointer = (type: string, x: number, y: number, pressure?: number, pointerId = 1) => {
    const e = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 })
    Object.defineProperty(e, "pointerId", { value: pointerId })
    // As a browser has it: on the event's prototype, so a listener before Excalidraw's may read it otherwise.
    if (pressure !== undefined) Object.defineProperty(e, "pressure", { value: pressure, configurable: true })
    canvas.dispatchEvent(e)
  }
  /**
   * The pen draws a square by hand, rests `restMs` at its end, and lifts: Excalidraw keeps the stroke as it does, in
   * the canvas's ink or `ink`. A `pinch` has a second finger down a moment after the first, moving and resting with it.
   */
  const strokeSquare = (id: string, restMs: number, { ink = {}, pinch = false }: { ink?: Partial<El>; pinch?: boolean } = {}) => {
    const corners = [[100, 100], [220, 100], [220, 220], [100, 220], [102, 103]]
    const points: number[][] = []
    for (let c = 1; c < corners.length; c++) for (let s = 0; s < 10; s++) points.push([corners[c - 1][0] + ((corners[c][0] - corners[c - 1][0]) * s) / 10, corners[c - 1][1] + ((corners[c][1] - corners[c - 1][1]) * s) / 10])
    points.push(corners[4])
    pointer("pointerdown", points[0][0], points[0][1])
    if (pinch) pointer("pointerdown", points[0][0] + 300, points[0][1], undefined, 2)
    state.newElement = { id }
    for (const [x, y] of points.slice(1)) {
      now += 16
      pointer("pointermove", x, y)
      if (pinch) pointer("pointermove", x + 300, y, undefined, 2)
    }
    elements = [...elements, { id, type: "freedraw", x: 100, y: 100, points: points.map(([x, y]) => [x - 100, y - 100]), strokeColor: state.currentItemStrokeColor, strokeWidth: state.currentItemStrokeWidth, opacity: state.currentItemOpacity, version: 1, ...ink }]
    state.newElement = null
    now += restMs
    pointer("pointerup", 102, 103)
    if (pinch) pointer("pointerup", 402, 103, undefined, 2)
  }
  return { host, api: api as never, raw: api, state, elements: () => elements, strokeSquare, pointer, canvas, pen: host.querySelector("label")! }
}

/** The tools' lazy piece (the watch) has come: vitest's mocker can't take a mocked import() while another resolves. */
const settled = () => act(() => new Promise<void>((r) => setTimeout(r, 300)))
const highlighter = () => screen.queryByRole("checkbox", { name: /Highlighter/ })

afterEach(() => {
  converter.hold = null
  converter.asked = 0
  cleanup()
  vi.restoreAllMocks()
  document.body.innerHTML = ""
})

describe("the board's highlighter", () => {
  it("is a tool beside the pen for an editor: a press makes the pen a wide marker that hides nothing, a second gives the pen its ink back", async () => {
    const b = board()
    render(<DrawingTools api={b.api} host={b.host} editable style="clean" />)
    const tool = await screen.findByRole("checkbox", { name: /Highlighter/ })
    expect(b.pen.nextElementSibling?.contains(tool)).toBe(true)
    fireEvent.click(tool)
    await waitFor(() => expect(b.state.activeTool.type).toBe("freedraw"))
    await waitFor(() => expect(b.state.currentItemOpacity).toBeLessThanOrEqual(50))
    expect(b.state.currentItemStrokeWidth).toBeGreaterThan(4)
    expect(b.state.currentItemStrokeColor).not.toBe("#1e1e1e")
    expect(tool).toBeChecked()
    fireEvent.click(tool)
    await waitFor(() => expect(b.state).toMatchObject({ currentItemOpacity: 100, currentItemStrokeWidth: 2, currentItemStrokeColor: "#1e1e1e" }))
    expect(tool).not.toBeChecked()
    expect(b.state.activeTool.type).toBe("freedraw")
  })

  it("is picked by M, and put down when another tool is picked", async () => {
    const b = board()
    render(<DrawingTools api={b.api} host={b.host} editable style="clean" />)
    const tool = await screen.findByRole("checkbox", { name: /Highlighter/ })
    fireEvent.keyDown(document.body, { key: "m" })
    await waitFor(() => expect(tool).toBeChecked())
    await waitFor(() => expect(b.state.currentItemOpacity).toBeLessThanOrEqual(50))
    act(() => b.raw.setActiveTool({ type: "rectangle" }))
    await waitFor(() => expect(tool).not.toBeChecked())
    expect(b.state).toMatchObject({ currentItemOpacity: 100, currentItemStrokeWidth: 2 })
  })

  it("is the one tool lit while in hand: the pen beside it shows neither the lit ground nor the dot, and has both back when it is put down", async () => {
    const b = board()
    render(<DrawingTools api={b.api} host={b.host} editable style="clean" />)
    const tool = await screen.findByRole("checkbox", { name: /Highlighter/ })
    // The board's lit rule and its dot (excalidrawTheme.css), as they read the row.
    const litPen = () => b.pen.querySelector(".ToolIcon_type_radio:checked + .ToolIcon__icon")
    const icon = b.pen.querySelector(".ToolIcon__icon")!
    expect(litPen()).not.toBeNull()
    fireEvent.click(tool)
    await waitFor(() => expect(litPen()).toBeNull())
    // Still hidden as Excalidraw hides a tool's input, and its own lit ground taken off by a class the app already ships.
    expect(b.pen.querySelector("input")?.classList.contains("ToolIcon_type_checkbox")).toBe(true)
    expect(icon.classList.contains("!bg-transparent")).toBe(true)
    fireEvent.click(tool)
    await waitFor(() => expect(litPen()).not.toBeNull())
    expect(b.pen.querySelector("input")?.classList.contains("ToolIcon_type_checkbox")).toBe(false)
    expect(icon.classList.contains("!bg-transparent")).toBe(false)
  })

  it("draws an even marker: every point of its stroke at one pressure, so its ends are as wide as its middle; the pen keeps the hand's", async () => {
    const b = board()
    render(<DrawingTools api={b.api} host={b.host} editable style="clean" />)
    const tool = await screen.findByRole("checkbox", { name: /Highlighter/ })
    // What Excalidraw reads, after this window's capture: a mouse's 0.5 (taken for "no pressure", drawn tapering with
    // speed) and 0 at its lift; a finger's force as it varies.
    const seen: number[] = []
    for (const type of ["pointerdown", "pointermove", "pointerup"]) b.canvas.addEventListener(type, (e) => seen.push((e as PointerEvent).pressure))
    const stroke = () => {
      b.pointer("pointerdown", 100, 100, 0.5)
      b.state.newElement = { id: "h1" }
      b.pointer("pointermove", 140, 102, 0.5)
      b.pointer("pointermove", 180, 104, 1)
      b.state.newElement = null
      b.pointer("pointerup", 180, 104, 0)
    }
    fireEvent.click(tool)
    await waitFor(() => expect(b.state.activeTool.type).toBe("freedraw"))
    await settled()
    stroke()
    expect(seen).toHaveLength(4)
    expect(new Set(seen).size).toBe(1)
    expect(seen[0]).not.toBe(0.5)
    fireEvent.click(tool)
    await waitFor(() => expect(tool).not.toBeChecked())
    seen.length = 0
    stroke()
    expect(seen).toEqual([0.5, 0.5, 1, 0])
  })

  it("is not given to someone who may only view: no button, and M does nothing", async () => {
    const b = board()
    render(<DrawingTools api={b.api} host={b.host} editable={false} style="clean" />)
    await settled()
    expect(highlighter()).toBeNull()
    fireEvent.keyDown(document.body, { key: "m" })
    await settled()
    expect(b.raw.setActiveTool).not.toHaveBeenCalled()
    expect(b.state.currentItemOpacity).toBe(100)
  })

  it("is not picked by an M typed into a field, which keeps its letter, nor by Ctrl+M", async () => {
    const b = board()
    render(<DrawingTools api={b.api} host={b.host} editable style="clean" />)
    const tool = await screen.findByRole("checkbox", { name: /Highlighter/ })
    const [input, notes] = [document.createElement("input"), document.createElement("textarea")]
    document.body.append(input, notes)
    // fireEvent's answer is false when a listener prevented the key: the letter would never reach the field.
    expect(fireEvent.keyDown(input, { key: "m" })).toBe(true)
    expect(tool).not.toBeChecked()
    expect(fireEvent.keyDown(notes, { key: "M" })).toBe(true)
    expect(tool).not.toBeChecked()
    expect(fireEvent.keyDown(document.body, { key: "m", ctrlKey: true })).toBe(true)
    expect(tool).not.toBeChecked()
    await settled()
    expect(b.state.currentItemOpacity).toBe(100)
  })
})

describe("a pen's stroke held still at its end", () => {
  it("becomes the shape it looks like in the board's style, in one step that leaves the stroke for undo; a quick stroke stays ink", async () => {
    const b = board()
    render(<DrawingTools api={b.api} host={b.host} editable style="clean" />)
    act(() => b.raw.setActiveTool({ type: "freedraw" }))
    await settled()
    b.strokeSquare("quick", 16)
    await settled()
    expect(b.elements().map((e) => [e.id, e.type, !!e.isDeleted])).toEqual([["quick", "freedraw", false]])

    b.raw.updateScene.mockClear()
    b.strokeSquare("held", 600)
    await waitFor(() => expect(b.elements().some((e) => e.type === "rectangle")).toBe(true))
    const shape = b.elements().find((e) => e.type === "rectangle")!
    expect(shape).toMatchObject({ x: 100, y: 100, width: 120, height: 120, roughness: 0, strokeColor: "#1e1e1e", strokeWidth: 2 })
    expect(b.elements().find((e) => e.id === "held")).toMatchObject({ type: "freedraw", isDeleted: true })
    // One write, taken as an undo step of its own: Ctrl+Z gives the stroke back.
    expect(b.raw.updateScene).toHaveBeenCalledTimes(1)
    expect(b.raw.updateScene.mock.calls[0][0]).toMatchObject({ captureUpdate: "IMMEDIATELY" })
  })

  it("is drawn hand-drawn on a hand-drawn board, and a highlighter's stroke is never made a shape", async () => {
    const b = board()
    render(<DrawingTools api={b.api} host={b.host} editable style="sketch" />)
    act(() => b.raw.setActiveTool({ type: "freedraw" }))
    await settled()
    b.strokeSquare("held", 600)
    await waitFor(() => expect(b.elements().find((e) => e.type === "rectangle")).toMatchObject({ roughness: 1 }))

    fireEvent.click(await screen.findByRole("checkbox", { name: /Highlighter/ }))
    await waitFor(() => expect(b.state.currentItemOpacity).toBeLessThanOrEqual(50))
    b.strokeSquare("marked", 600)
    await settled()
    expect(b.elements().find((e) => e.id === "marked")).toMatchObject({ type: "freedraw", opacity: b.state.currentItemOpacity })
    expect(b.elements().filter((e) => e.type === "rectangle")).toHaveLength(1)
    expect(b.elements().find((e) => e.id === "marked")?.isDeleted).toBeFalsy()
  })
  it("keeps the stroke's ink and frame: its colour, width and opacity, inside the frame it was drawn in", async () => {
    const b = board()
    render(<DrawingTools api={b.api} host={b.host} editable style="clean" />)
    act(() => b.raw.setActiveTool({ type: "freedraw" }))
    await settled()
    b.strokeSquare("held", 600, { ink: { strokeColor: "#e03131", strokeWidth: 4, opacity: 70, frameId: "frame-1" } })
    await waitFor(() => expect(b.elements().some((e) => e.type === "rectangle")).toBe(true))
    expect(b.elements().find((e) => e.type === "rectangle")).toMatchObject({ strokeColor: "#e03131", strokeWidth: 4, opacity: 70, frameId: "frame-1" })
  })

  it("has square corners when the canvas draws its shapes sharp, and round ones when it draws them round", async () => {
    const b = board()
    render(<DrawingTools api={b.api} host={b.host} editable style="clean" />)
    act(() => b.raw.setActiveTool({ type: "freedraw" }))
    await settled()
    b.state.currentItemRoundness = "sharp"
    b.strokeSquare("sharp", 600)
    await waitFor(() => expect(b.elements().some((e) => e.type === "rectangle")).toBe(true))
    expect(b.elements().find((e) => e.type === "rectangle")).toMatchObject({ roundness: null })
    b.state.currentItemRoundness = "round"
    b.strokeSquare("round", 600)
    await waitFor(() => expect(b.elements().filter((e) => e.type === "rectangle")).toHaveLength(2))
    expect(b.elements().filter((e) => e.type === "rectangle")[1]).toMatchObject({ roundness: { type: 3 } })
  })

  it("is left as it is when undone or rubbed out while the shape's maker loads", async () => {
    const b = board()
    render(<DrawingTools api={b.api} host={b.host} editable style="clean" />)
    act(() => b.raw.setActiveTool({ type: "freedraw" }))
    await settled()
    let loaded!: () => void
    converter.hold = new Promise<void>((r) => (loaded = r))
    b.strokeSquare("held", 600)
    await waitFor(() => expect(converter.asked).toBe(1))
    // Ctrl+Z in the wait: Excalidraw marks the stroke deleted.
    act(() => b.raw.updateScene({ elements: b.elements().map((e) => (e.id === "held" ? { ...e, isDeleted: true } : e)) }))
    await act(async () => loaded())
    await settled()
    expect(b.elements().map((e) => [e.id, e.type, !!e.isDeleted])).toEqual([["held", "freedraw", true]])
  })

  it("never comes of a pinch: a second finger down makes the stroke a pinch, held still or not", async () => {
    const b = board()
    render(<DrawingTools api={b.api} host={b.host} editable style="clean" />)
    act(() => b.raw.setActiveTool({ type: "freedraw" }))
    await settled()
    b.strokeSquare("pinched", 600, { pinch: true })
    await settled()
    expect(b.elements().map((e) => [e.id, e.type, !!e.isDeleted])).toEqual([["pinched", "freedraw", false]])
  })
})
