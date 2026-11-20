import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import * as Y from "yjs"
import { putOnScreen, SCREENS } from "@/lib/testing/screens"
import { HOME_LAYER, LAYERS, addLayer, readLayers } from "@/lib/board/layers"

const toast = vi.fn()
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }))

import LayersPanel from "./layersPanel"

// miro-03 1: the Layers panel. Editors make, rename, hide, lock, reorder (drag, or Move up / Move down) and delete
// layers, and move the selection onto one; everyone else reads the list as it is set. A phone's panel is a sheet with
// its actions in the pinned footer, every control 44 px.

let off = () => {}
afterEach(() => {
  cleanup()
  off()
  off = () => {}
  toast.mockReset()
})

type El = { id: string; type: string; version: number; versionNonce: number; index: string; locked?: boolean; customData?: Record<string, unknown> }
function board(scene: El[] = [], selected: string[] = []) {
  const doc = new Y.Doc()
  const map = doc.getMap<unknown>(LAYERS)
  let now = scene
  const api = {
    getSceneElementsIncludingDeleted: () => now,
    getSceneElements: () => now,
    getAppState: () => ({ selectedElementIds: Object.fromEntries(selected.map((id) => [id, true])) }),
    updateScene: vi.fn((s: { elements?: El[] }) => {
      if (s.elements) now = s.elements
    }),
  }
  return { doc, map, api, scene: () => now }
}
const panel = (b: ReturnType<typeof board>, editable = true) => <LayersPanel api={b.api as never} doc={b.doc} editable={editable} protection={new Map()} onClose={vi.fn()} />
const rows = () => screen.getAllByRole("listitem").map((li) => li.getAttribute("data-layer-name"))

describe("the Layers panel, for an editor", () => {
  it("starts with Layer 1 alone, adds a layer on top, and lists the stack top first", () => {
    const b = board()
    render(panel(b))
    expect(screen.getByRole("complementary", { name: "Layers" })).toBeTruthy()
    expect(rows()).toEqual(["Layer 1"])
    fireEvent.click(screen.getByRole("button", { name: "New layer" }))
    expect(rows()).toEqual(["Layer 2", "Layer 1"])
    expect(readLayers(b.map)).toHaveLength(2)
  })

  it("hides and shows a layer, and says why Layer 1 can't hide or go", () => {
    const b = board()
    addLayer(b.map)
    render(panel(b))
    const top = screen.getAllByRole("listitem")[0]
    fireEvent.click(within(top).getByRole("button", { name: "Hide Layer 2" }))
    expect(readLayers(b.map)[1].hidden).toBe(true)
    expect(within(top).getByRole("button", { name: "Show Layer 2" }).getAttribute("aria-pressed")).toBe("true")
    const home = screen.getAllByRole("listitem")[1]
    expect((within(home).getByRole("button", { name: "Hide Layer 1" }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(within(home).getByRole("button", { name: "Layer 1" }))
    fireEvent.click(screen.getByRole("button", { name: "Delete layer" }))
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ description: "Layer 1 holds new work, so it stays." }))
  })

  it("renames a layer, refusing an empty name with why", () => {
    const b = board()
    render(panel(b))
    fireEvent.click(screen.getByRole("button", { name: "Rename layer" }))
    const field = screen.getByRole("textbox", { name: "Layer name" })
    fireEvent.change(field, { target: { value: " " } })
    fireEvent.keyDown(field, { key: "Enter" })
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ description: "A layer needs a name." }))
    fireEvent.change(screen.getByRole("textbox", { name: "Layer name" }), { target: { value: "Background" } })
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Layer name" }), { key: "Enter" })
    expect(rows()).toEqual(["Background"])
  })

  it("reorders by Move down and by a mouse's drag, and the stack follows", () => {
    const b = board()
    addLayer(b.map)
    render(panel(b))
    fireEvent.click(within(screen.getAllByRole("listitem")[0]).getByRole("button", { name: "Move Layer 2 down" }))
    expect(rows()).toEqual(["Layer 1", "Layer 2"])
    const [first, second] = screen.getAllByRole("listitem")
    fireEvent.dragStart(second)
    fireEvent.dragOver(first)
    fireEvent.drop(first)
    expect(rows()).toEqual(["Layer 2", "Layer 1"])
  })

  it("locks a layer's elements, moves the selection onto a layer, and deletes a layer softly", () => {
    const b = board([{ id: "a", type: "rectangle", version: 1, versionNonce: 1, index: "a0" }], ["a"])
    const r = addLayer(b.map)
    const id = "layer" in r ? r.layer.id : ""
    render(panel(b))
    fireEvent.click(within(screen.getAllByRole("listitem")[0]).getByRole("button", { name: "Layer 2" }))
    fireEvent.click(screen.getByRole("button", { name: "Move selection here" }))
    expect(b.scene()[0].customData).toEqual({ layerId: id })
    fireEvent.click(within(screen.getAllByRole("listitem")[0]).getByRole("button", { name: "Lock Layer 2" }))
    expect(b.scene()[0].locked).toBe(true)
    fireEvent.click(screen.getByRole("button", { name: "Delete layer" }))
    expect(rows()).toEqual(["Layer 1"])
    expect(b.map.get(id)).toMatchObject({ deletedAt: expect.any(Number) })
    expect(b.scene()).toHaveLength(1)
  })
})

describe("the Layers panel, for everyone else", () => {
  it("is the list as set, hidden and locked said, with nothing to press", () => {
    const b = board()
    const r = addLayer(b.map)
    if ("layer" in r) b.map.set(r.layer.id, { ...r.layer, hidden: true })
    render(panel(b, false))
    expect(rows()).toEqual(["Layer 2", "Layer 1"])
    expect(screen.getAllByRole("listitem")[0].textContent).toContain("Hidden")
    expect(screen.queryAllByRole("button", { name: /Hide|Show|Lock|Move|New layer|Delete/ })).toHaveLength(0)
    expect(document.querySelector("[data-board-panel-footer]")).toBeNull()
  })
})

describe("the Layers panel on a phone", () => {
  it("is a sheet, its actions in the pinned footer, every control 44 px", () => {
    off = putOnScreen(SCREENS["a phone in portrait"])
    const b = board()
    render(panel(b))
    const sheet = screen.getByRole("dialog", { name: "Layers" })
    const foot = sheet.querySelector("[data-sheet-footer]")!
    expect(within(foot as HTMLElement).getByRole("button", { name: "New layer" })).toBeTruthy()
    for (const button of within(sheet).getAllByRole("button")) {
      if (button.closest("[data-sheet-footer]") || button.closest("li")) expect(button.className).toMatch(/\[@media\(pointer:coarse\)\]:(size|h|min-h)-11/)
    }
    expect(HOME_LAYER).toBe("layer-1")
  })
})
