import { afterAll, afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { boardScene, convertForTest, type TestElement } from "@/lib/testing/boardScene"
import { installPointerEvent } from "@/lib/testing/pointerEvent"
import { listenForEscape } from "@/lib/keys/escape"

// What lands on the board while a note's converter loads (a collaborator's change), run once at its first call.
let duringConvert: (() => void) | null = null
vi.mock("@excalidraw/excalidraw", () => ({
  convertToExcalidrawElements: (sk: Record<string, unknown>[]) => {
    const run = duringConvert
    duringConvert = null
    run?.()
    return convertForTest(sk)
  },
}))
let mobile = false
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: mobile, isDesktop: !mobile }) }))

import StickyTool from "./stickyTool"
import { NOTE_COLOURS, noteSkeleton } from "@/lib/board/notes"
import { overlaps } from "@/lib/board/sticky"
import type { BoardSelection } from "./boardWorkbench"

// The sticky tool (miro-07): N and a press to place a note and type; Tab for
// the next note beside it; a pasted list becomes notes; and frames' sizes.

const NONE: BoardSelection = { ids: [], notes: [], frame: null, editing: false, editingNote: false }
installPointerEvent()
// The page's one Escape (lib/keys/escape), as the app shell installs it.
const stopEscape = listenForEscape()
afterAll(() => stopEscape())

/** The board page as the tool lives in it: a canvas inside Excalidraw's container. */
function mount(scene: ReturnType<typeof boardScene>, selection: BoardSelection = NONE, props: Partial<React.ComponentProps<typeof StickyTool>> = {}) {
  const host = document.createElement("div")
  host.setAttribute("data-board-canvas", "")
  document.body.appendChild(host)
  const view = render(<StickyTool api={scene.api} selection={selection} style="clean" noteNow={0} onFrames={vi.fn()} {...props} />, { container: host })
  // Excalidraw's container beside the tool, as on the page (React clears its
  // container when it first mounts, so it goes in after).
  const excalidraw = document.createElement("div")
  excalidraw.className = "excalidraw"
  const canvas = document.createElement("canvas")
  excalidraw.appendChild(canvas)
  host.appendChild(excalidraw)
  const keys: string[] = []
  excalidraw.addEventListener("keydown", (e) => keys.push((e as KeyboardEvent).key))
  return { view, canvas, keys, host }
}

afterEach(() => {
  cleanup()
  mobile = false
  duringConvert = null
  document.body.innerHTML = ""
  try {
    localStorage.clear()
  } catch {
    /* none */
  }
})

describe("the sticky tool", () => {
  it("arms on N, shows a note under the pointer, and places one where the board is pressed, then types in it", async () => {
    const s = boardScene([], { zoom: { value: 1 }, scrollX: 0, scrollY: 0, offsetLeft: 0, offsetTop: 0 })
    const { canvas, keys } = mount(s)
    fireEvent.keyDown(document.body, { key: "n" })
    expect(document.querySelector("[data-note-ghost]")).toBeTruthy()
    expect(screen.getByRole("button", { name: /Click the board to place a note/ }).getAttribute("aria-pressed")).toBe("true")
    fireEvent.pointerDown(canvas, { clientX: 400, clientY: 300, button: 0 })
    await waitFor(() => expect(s.elements().some((e) => e.type === "rectangle")).toBe(true))
    const placed = s.elements().find((e) => e.type === "rectangle")!
    expect(placed).toMatchObject({ x: 400 - 90, y: 300 - 90, width: 180, backgroundColor: NOTE_COLOURS.yellow.fill })
    expect(s.elements().find((e) => e.type === "text")?.fontFamily).toBe(6)
    expect(document.querySelector("[data-note-ghost]")).toBeNull()
    // Two frames on, Enter on Excalidraw's container starts typing in the note.
    await vi.waitFor(() => expect(keys).toContain("Enter"))
  })

  it("leaves N to a field being typed in, and Escape puts the tool down", () => {
    const s = boardScene()
    mount(s)
    const input = document.createElement("input")
    document.body.appendChild(input)
    fireEvent.keyDown(input, { key: "n" })
    expect(document.querySelector("[data-note-ghost]")).toBeNull()
    fireEvent.keyDown(document.body, { key: "n" })
    expect(document.querySelector("[data-note-ghost]")).toBeTruthy()
    fireEvent.keyDown(document.body, { key: "Escape" })
    expect(document.querySelector("[data-note-ghost]")).toBeNull()
  })

  it("takes N from a checkbox or a button, which take a click and no typing, but never from a dialog or a menu over the board", () => {
    const s = boardScene()
    mount(s)
    const box = document.createElement("input")
    box.type = "checkbox"
    document.body.appendChild(box)
    fireEvent.keyDown(box, { key: "n" })
    expect(document.querySelector("[data-note-ghost]")).toBeTruthy()
    fireEvent.keyDown(document.body, { key: "Escape" })
    expect(document.querySelector("[data-note-ghost]")).toBeNull()
    for (const role of ["dialog", "menu"]) {
      const layer = document.createElement("div")
      layer.setAttribute("role", role)
      const button = document.createElement("button")
      layer.appendChild(button)
      document.body.appendChild(layer)
      fireEvent.keyDown(button, { key: "n" })
      expect(document.querySelector("[data-note-ghost]")).toBeNull()
    }
  })

  it("adds the next note beside the selected one on Tab, in its colour, and below it on Shift+Tab", async () => {
    const first = convertForTest([noteSkeleton({ id: "a", x: 0, y: 0, colour: "teal" }) as never])
    const s = boardScene(first)
    mount(s, { ids: ["a"], notes: ["a"], frame: null, editing: false, editingNote: false })
    fireEvent.keyDown(document.body, { key: "Tab" })
    const right = () => s.elements().filter((e) => e.type === "rectangle" && e.id !== "a")
    await waitFor(() => expect(right()).toHaveLength(1))
    expect(right()[0]).toMatchObject({ x: 204, y: 0, backgroundColor: NOTE_COLOURS.teal.fill })
  })

  it("ends typing in a note on Tab and starts the next one, as a run of ideas", async () => {
    const first = convertForTest([noteSkeleton({ id: "a", x: 0, y: 0 }) as never])
    const s = boardScene(first, { editingTextElement: { id: "a-text", containerId: "a" } })
    mount(s, { ids: ["a"], notes: ["a"], frame: null, editing: true, editingNote: true })
    const editor = document.createElement("textarea")
    editor.className = "excalidraw-wysiwyg"
    document.body.appendChild(editor)
    editor.focus()
    const editorKeys: string[] = []
    editor.addEventListener("keydown", (e) => editorKeys.push((e as KeyboardEvent).key))
    fireEvent.keyDown(editor, { key: "Tab" })
    await waitFor(() => expect(s.elements().filter((e) => e.type === "rectangle")).toHaveLength(2))
    // Excalidraw's editor keeps the words and ends when it loses focus; the Tab never reaches it.
    expect(editorKeys).toEqual([])
    expect(document.activeElement).not.toBe(editor)
  })

  it("makes a pasted list into a grid of notes, one a line, and leaves Excalidraw's own paste alone", async () => {
    const s = boardScene()
    mount(s)
    const paste = (text: string) => {
      const e = new Event("paste", { bubbles: true, cancelable: true }) as ClipboardEvent
      Object.defineProperty(e, "clipboardData", { value: { getData: () => text } })
      document.body.dispatchEvent(e)
      return e
    }
    const ours = paste("- Ship the pricing page\n- Load test\n\n- Freeze copy")
    expect(ours.defaultPrevented).toBe(true)
    await waitFor(() => expect(s.elements().filter((e) => e.type === "rectangle")).toHaveLength(3))
    expect(s.elements().filter((e) => e.type === "text").map((e) => e.text)).toEqual(["Ship the pricing page", "Load test", "Freeze copy"])
    expect(paste('{"type":"excalidraw/clipboard","elements":[]}').defaultPrevented).toBe(false)
    expect(paste("Just one line").defaultPrevented).toBe(false)
  })

  it("puts a note in the middle of the view on a phone's press, typing", async () => {
    mobile = true
    const s = boardScene([], { scrollX: 0, scrollY: 0, zoom: { value: 1 }, width: 390, height: 600 })
    const { view, host } = mount(s)
    expect(host.querySelector("[data-board-create]")).toBeNull()
    view.rerender(<StickyTool api={s.api} selection={NONE} style="sketch" noteNow={Date.now()} onFrames={vi.fn()} />)
    await waitFor(() => expect(s.elements().some((e) => e.type === "rectangle")).toBe(true))
    const placed = s.elements().find((e) => e.type === "rectangle") as TestElement
    expect(placed).toMatchObject({ x: 195 - 90, y: 300 - 90 })
    expect(s.elements().find((e) => e.type === "text")?.fontFamily).toBe(5)
  })

  it("adds a frame at a size, named after the last, in the middle of the view", () => {
    const s = boardScene([], { scrollX: 0, scrollY: 0, zoom: { value: 1 }, width: 2000, height: 1200 })
    mount(s)
    fireEvent.click(screen.getByRole("button", { name: "Frame" }))
    fireEvent.click(screen.getByRole("button", { name: /16:9/ }))
    const f = s.elements().find((e) => e.type === "frame")!
    expect(f).toMatchObject({ width: 1920, height: 1080, x: 40, y: 60, name: "Frame 1", customData: { preset: "16:9" } })
    expect(s.writes.at(-1)?.captureUpdate).toBe("IMMEDIATELY")
  })

  // miro-11 F2 (WB-137's live walk, 6 Nov): a note placed inside a frame stayed outside it, so its bar's Lay out said
  // "This frame is empty", and a frame laid over notes took none of them in. Miro's frames hold what's inside them.
  const frameAt = (id: string, x: number, y: number, width = 1000, height = 800): TestElement => ({ id, type: "frame", x, y, width, height, version: 1, isDeleted: false, frameId: null, name: id })

  // DESIGN-BUILD-120 F1 (6 Nov): one pressed across a frame's edge, its centre inside, looked in the frame and was in
  // none. It joins the frame under its centre, moved wholly inside; one whose centre is in no frame stays in none.
  it("puts a note placed in a frame in that frame, words and all; one across its edge too, moved inside; one outside in none", async () => {
    const s = boardScene([frameAt("f1", 0, 0)], { zoom: { value: 1 }, scrollX: 0, scrollY: 0, offsetLeft: 0, offsetTop: 0 })
    const { canvas } = mount(s)
    const press = async (clientX: number, n: number) => {
      fireEvent.keyDown(document.body, { key: "Escape" })
      fireEvent.keyDown(document.body, { key: "n" })
      fireEvent.pointerDown(canvas, { clientX, clientY: 300, button: 0 })
      await waitFor(() => expect(s.elements().filter((e) => e.type === "rectangle")).toHaveLength(n))
      const note = s.elements().filter((e) => e.type === "rectangle")[n - 1]
      return { note, words: s.elements().find((e) => e.type === "text" && e.containerId === note.id)! }
    }
    const inside = await press(400, 1)
    expect([inside.note.frameId, inside.words.frameId]).toEqual(["f1", "f1"])
    expect([inside.note.x, inside.note.y]).toEqual([310, 210])
    // Centred 50 px inside the frame's right edge (1000): it crosses it by 40 and stays where it was put; the frame grows
    // right to hold it inside its padding, as Lay out's frames grow (V-683: pulled back left, a run's note fell on the last).
    const across = await press(950, 2)
    expect([across.note.frameId, across.words.frameId]).toEqual(["f1", "f1"])
    expect([across.note.x, across.note.y]).toEqual([860, 210])
    expect(s.elements().find((e) => e.id === "f1")).toMatchObject({ x: 0, width: 1080, height: 800 })
    const outside = await press(1150, 3)
    expect([outside.note.frameId ?? null, outside.words.frameId ?? null]).toEqual([null, null])
    expect([outside.note.x, outside.note.y]).toEqual([1060, 210])
  })

  it("grows a frame smaller than a note placed in it, as Lay out's does, in the note's one undo step", async () => {
    const s = boardScene([frameAt("small", 0, 0, 100, 80)], { zoom: { value: 1 }, scrollX: 0, scrollY: 0, offsetLeft: 0, offsetTop: 0 })
    const { canvas } = mount(s)
    fireEvent.keyDown(document.body, { key: "n" })
    fireEvent.pointerDown(canvas, { clientX: 50, clientY: 40, button: 0 })
    await waitFor(() => expect(s.elements().some((e) => e.type === "rectangle")).toBe(true))
    // One change to the board's elements, the note and the frame's growth together: one undo step.
    expect(s.writes.filter((w) => w.elements)).toHaveLength(1)
    expect(s.elements().find((e) => e.id === "small")).toMatchObject({ width: 260, height: 260 })
    expect(s.elements().find((e) => e.type === "rectangle")).toMatchObject({ x: 40, y: 40, frameId: "small" })
  })

  // V-605 (DESIGN-BUILD-117): a frame added at a size lay at the view's middle over whatever was there: the Frames panel
  // said Empty while a note sat inside it, frames don't nest so one laid over a frame left it out, and a second size,
  // the view centred on the first frame by its scrollToContent, lay on it. It goes in the nearest free space beside
  // what's there, as Miro lays a new frame, so nothing is ever under it; on a crowded board that is out of view, and
  // the board goes to it.
  it("lays a frame added at a size beside what's at the view's middle, never over a note or a frame, in one undo step", () => {
    const note = (id: string, x: number, y: number, frameId: string | null = null): TestElement[] => [
      { id, type: "rectangle", x, y, width: 180, height: 180, version: 1, isDeleted: false, frameId, boundElements: [{ id: `${id}-t`, type: "text" }] },
      { id: `${id}-t`, type: "text", x: x + 10, y: y + 80, width: 60, height: 20, version: 1, isDeleted: false, frameId, containerId: id },
    ]
    const s = boardScene([...note("in", 900, 500), ...note("held", 300, 300, "other"), frameAt("other", 200, 200, 400, 400)], { scrollX: 0, scrollY: 0, zoom: { value: 1 }, width: 2000, height: 1200 })
    const scroll = vi.spyOn(s.api as unknown as { scrollToContent: () => void }, "scrollToContent")
    mount(s)
    const add = () => {
      if (!screen.queryByRole("button", { name: /16:9/ })) fireEvent.click(screen.getByRole("button", { name: "Frame" }))
      fireEvent.click(screen.getByRole("button", { name: /16:9/ }))
    }
    const added = () => s.elements().filter((e) => e.type === "frame" && e.id !== "other")
    const clear = (f: TestElement) => s.elements().every((e) => e.id === f.id || e.isDeleted || !overlaps(f, e))
    const before = s.writes.length
    add()
    expect(added()).toHaveLength(1)
    const [first] = added()
    expect(first).toMatchObject({ width: 1920, height: 1080, name: "Frame 2" })
    expect(clear(first)).toBe(true)
    // Nothing joined it, and nothing left its frame: "held" is still the other frame's.
    expect(s.elements().filter((e) => e.frameId === first.id)).toEqual([])
    expect([s.byId("held")?.frameId, s.byId("in")?.frameId ?? null]).toEqual(["other", null])
    expect(s.writes.length - before).toBe(1)
    expect(s.writes.at(-1)?.captureUpdate).toBe("IMMEDIATELY")
    expect(scroll).toHaveBeenLastCalledWith([first], expect.objectContaining({ fitToContent: true }))
    // A second size, the view centred on the first frame (where its scrollToContent leaves it), goes beside it too.
    ;(s.api as unknown as { updateScene: (x: unknown) => void }).updateScene({ appState: { scrollX: 1000 - (first.x + 960), scrollY: 600 - (first.y + 540) } })
    add()
    expect(added()).toHaveLength(2)
    expect(added().every(clear)).toBe(true)
  })

  it("on a board drawn on wherever the view looks, lays the frame past what's drawn, out of view, and goes to it", () => {
    const wall: TestElement = { id: "wall", type: "rectangle", x: -3000, y: -2000, width: 8000, height: 5000, version: 1, isDeleted: false, frameId: null }
    const s = boardScene([wall], { scrollX: 0, scrollY: 0, zoom: { value: 1 }, width: 2000, height: 1200 })
    const scroll = vi.spyOn(s.api as unknown as { scrollToContent: () => void }, "scrollToContent")
    mount(s)
    fireEvent.click(screen.getByRole("button", { name: "Frame" }))
    fireEvent.click(screen.getByRole("button", { name: /^A4/ }))
    const f = s.elements().find((e) => e.type === "frame")!
    expect(f).toMatchObject({ width: 794, height: 1123 })
    expect(overlaps(f, wall)).toBe(false)
    expect(overlaps(f, { x: 0, y: 0, width: 2000, height: 1200 })).toBe(false)
    expect(scroll).toHaveBeenLastCalledWith([f], expect.objectContaining({ fitToContent: true }))
  })

  // V-683 (CR-232): only a note placed on a point joined the frame it landed in. Tab's next note went by the same
  // place, but one across the frame's right edge was pulled back onto the note before; a pasted list joined none; and
  // the frame's growth, worked out before the converter's await, was written over a collaborator's resize after it.
  it("puts Tab's next note, across a frame's right edge, in the frame where it found room, the frame grown to hold it", async () => {
    const first = convertForTest([noteSkeleton({ id: "a", x: 700, y: 210 }) as never]).map((e) => ({ ...e, frameId: "f1" }))
    const s = boardScene([frameAt("f1", 0, 0), ...first])
    mount(s, { ids: ["a"], notes: ["a"], frame: null, editing: false, editingNote: false })
    fireEvent.keyDown(document.body, { key: "Tab" })
    const next = () => s.elements().filter((e) => e.type === "rectangle" && e.id !== "a")
    await waitFor(() => expect(next()).toHaveLength(1))
    expect(next()[0]).toMatchObject({ x: 904, y: 210, frameId: "f1" })
    expect(overlaps(next()[0], s.byId("a")!)).toBe(false)
    expect(s.byId("f1")).toMatchObject({ x: 0, y: 0, width: 1124, height: 800 })
    expect(s.writes.filter((w) => w.elements)).toHaveLength(1)
  })

  it("puts a pasted list landing in a frame in it, all at once: moved in together, the frame grown once to hold them", async () => {
    // A small frame under the view's middle (500, 400): the list's grid is larger than it.
    const s = boardScene([frameAt("f1", 300, 250, 400, 300)], { scrollX: 0, scrollY: 0, zoom: { value: 1 }, width: 1000, height: 800 })
    mount(s)
    const e = new Event("paste", { bubbles: true, cancelable: true }) as ClipboardEvent
    Object.defineProperty(e, "clipboardData", { value: { getData: () => "Goals\nRisks\nOwners\nDates" } })
    document.body.dispatchEvent(e)
    const notes = () => s.elements().filter((x) => x.type === "rectangle")
    await waitFor(() => expect(notes()).toHaveLength(4))
    const f = s.byId("f1")!
    expect(s.elements().filter((x) => x.type !== "frame").map((x) => x.frameId)).toEqual(Array(8).fill("f1"))
    // The grid kept, its top left at the frame's padding, the frame grown right and down to hold it: one undo step.
    expect(notes().map((n) => [n.x, n.y])).toEqual([[340, 290], [544, 290], [748, 290], [340, 494]])
    expect(f).toMatchObject({ x: 300, y: 250, width: 668, height: 464, version: 2 })
    expect(s.writes.filter((w) => w.elements)).toHaveLength(1)
  })

  it("never sets back a collaborator's resize of the frame made while the note was on its way", async () => {
    const s = boardScene([frameAt("small", 0, 0, 100, 80)], { zoom: { value: 1 }, scrollX: 0, scrollY: 0, offsetLeft: 0, offsetTop: 0 })
    const { canvas } = mount(s)
    // Someone else makes the frame 600 square while the converter loads: the note's growth (260) is a floor, not a size.
    duringConvert = () => {
      const f = s.byId("small")!
      Object.assign(f, { width: 600, height: 600, version: f.version + 1 })
    }
    fireEvent.keyDown(document.body, { key: "n" })
    fireEvent.pointerDown(canvas, { clientX: 50, clientY: 40, button: 0 })
    await waitFor(() => expect(s.elements().some((e) => e.type === "rectangle")).toBe(true))
    expect(s.byId("small")).toMatchObject({ width: 600, height: 600 })
    expect(s.elements().find((e) => e.type === "rectangle")).toMatchObject({ x: 40, y: 40, frameId: "small" })
  })
})
