import { afterAll, afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { boardScene, convertForTest, type TestElement } from "@/lib/testing/boardScene"
import { installPointerEvent } from "@/lib/testing/pointerEvent"
import { listenForEscape } from "@/lib/keys/escape"

vi.mock("@excalidraw/excalidraw", () => ({ convertToExcalidrawElements: (sk: Record<string, unknown>[]) => convertForTest(sk) }))
let mobile = false
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => ({ isMobile: mobile, isDesktop: !mobile }) }))

import StickyTool from "./stickyTool"
import { NOTE_COLOURS, noteSkeleton } from "@/lib/board/notes"
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
})
