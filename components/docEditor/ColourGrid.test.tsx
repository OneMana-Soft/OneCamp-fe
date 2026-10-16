import * as React from "react"
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { Editor } from "@tiptap/core"

import "@/components/docEditor/registry"
import "@/components/minimal-tiptap/extensions/formatting/register"
import { actionById, dialogFor } from "@/components/docEditor/registry/registry"
import { extensionsFor, loadBlocks } from "@/components/docEditor/registry/factory"
import { ALL_EDITIONS, bareContext } from "@/components/docEditor/registry/manifest"
import { createDocCommandBus } from "@/components/docEditor/registry/commandBus"
import ColourMenu, { chosenNow, colourRows, pickLabel } from "./ColourGrid"

// The colour grid (B2): seven colours for text and for a background, each
// row led by Default, the last used above them; over the text on a wider
// screen, a sheet on a phone. Opened by colour.open from the selection bar,
// the block menu and the phone's bar.

const media = { isMobile: false }
vi.mock("@/context/MediaQueryContext", () => ({ useMedia: () => media }))

beforeAll(() => loadBlocks("doc", ALL_EDITIONS), 30_000)

const editors: Editor[] = []
afterEach(() => {
  cleanup()
  while (editors.length) editors.pop()!.destroy()
  localStorage.clear()
  media.isMobile = false
})

function docEditor(content: string) {
  const editor = new Editor({ extensions: extensionsFor(bareContext("doc")), content })
  editors.push(editor)
  document.body.appendChild(editor.view.dom.parentElement ?? editor.view.dom)
  return editor
}

/** Opens the grid as a bar's Colour does: the action, then the dialog it asks for. */
function open(editor: Editor, state: Record<string, unknown> = {}) {
  const bus = createDocCommandBus("d")
  const asked: string[] = []
  bus.on("openDialog", ({ id }) => asked.push(id))
  actionById("colour.open", { ai: false })!.run({ docId: "d", editor, canEdit: true, bus, state })
  expect(asked).toEqual(["doc.colour"])
  const onClose = vi.fn()
  render(<ColourMenu docId="d" onClose={onClose} />)
  return onClose
}

const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 0)) })

describe("the colour grid's rows", () => {
  it("are Last used (when there is one), then Text colour and Background, each led by Default", () => {
    expect(colourRows([]).map((r) => r.label)).toEqual(["Text colour", "Background"])
    const rows = colourRows([{ colour: "sky", background: true }])
    expect(rows.map((r) => r.label)).toEqual(["Last used", "Text colour", "Background"])
    expect(rows[1].picks.map((p) => pickLabel(p))).toEqual(["Default", "Grey", "Yellow", "Green", "Teal", "Blue", "Purple", "Red"])
    expect(pickLabel({ colour: "sky", background: true }, true)).toBe("Blue background")
    expect(pickLabel({ colour: "sky", background: false }, true)).toBe("Blue text")
  })

  it("is registered as a dialog that loads when it first opens", () => {
    expect(dialogFor("doc.colour", { ai: false })).toBeTruthy()
    expect(actionById("colour.open", { ai: false })?.surfaces).toEqual(["selection", "phoneBar", "blockMenu"])
  })
})

describe("the grid over the text", () => {
  it("colours the selection from the keyboard: arrows, then Enter", async () => {
    const editor = docEditor("<p>a word here</p>")
    editor.commands.setTextSelection({ from: 3, to: 7 })
    const onClose = open(editor)
    await settle()
    const grid = screen.getByRole("dialog", { name: "Colour" })
    // Focus starts on the text row's chosen swatch: Default, for plain text.
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Default")
    expect(document.activeElement?.closest('[role="group"]')?.getAttribute("aria-label")).toBe("Text colour")
    for (let i = 0; i < 5; i++) fireEvent.keyDown(document.activeElement!, { key: "ArrowRight" })
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Blue")
    fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" })
    expect(document.activeElement?.closest('[role="group"]')?.getAttribute("aria-label")).toBe("Background")
    act(() => (document.activeElement as HTMLButtonElement).click())
    expect(editor.getHTML()).toContain('<mark data-color="sky">word</mark>')
    expect(onClose).toHaveBeenCalled()
    expect(grid.isConnected).toBe(true)
  })

  it("shows what is chosen, and goes back to the text with Escape", async () => {
    const editor = docEditor('<p><span data-color="berry">red</span> words</p>')
    editor.commands.setTextSelection({ from: 1, to: 4 })
    expect(chosenNow({ editor, range: null })).toEqual({ text: "berry", background: null })
    const onClose = open(editor)
    await settle()
    expect(screen.getAllByRole("button", { name: "Red" }).find((b) => b.closest('[aria-label="Text colour"]'))?.getAttribute("aria-pressed")).toBe("true")
    fireEvent.keyDown(document.activeElement!, { key: "Escape" })
    expect(onClose).toHaveBeenCalled()
  })

  it("colours the block menu's blocks, where the menu stood", async () => {
    const editor = docEditor("<p>one</p><p>two</p>")
    const onClose = open(editor, { range: { from: 0, to: editor.state.doc.child(0).nodeSize }, anchor: { left: 40, top: 100, bottom: 124 } })
    await settle()
    const grid = screen.getByRole("dialog", { name: "Colour" })
    // The shared popover, anchored where the block menu stood.
    expect(grid.getAttribute("data-side"), "placed by the shared popover (jsdom lays nothing out, so it may flip)").toMatch(/^(bottom|top)$/)
    act(() => screen.getAllByRole("button", { name: "Green" })[0].click())
    expect(editor.state.doc.child(0).attrs.blockColor).toBe("moss")
    expect(editor.state.doc.child(1).attrs.blockColor).toBeNull()
    expect(onClose).toHaveBeenCalled()
  })

  it("colours only the blocks the menu chose, not those between them", async () => {
    const editor = docEditor('<p data-block-id="a">one</p><p data-block-id="b">two</p><p data-block-id="c">three</p>')
    open(editor, { range: { from: 0, to: editor.state.doc.content.size }, blocks: ["a", "c"], anchor: { left: 40, top: 100, bottom: 124 } })
    await settle()
    act(() => screen.getAllByRole("button", { name: "Blue" })[0].click())
    expect([0, 1, 2].map((i) => editor.state.doc.child(i).attrs.blockColor)).toEqual(["sky", null, "sky"])
  })

  it("puts the colours used last above the rows", async () => {
    localStorage.setItem("onecamp-doc-colours", JSON.stringify(["dusk_background"]))
    const editor = docEditor("<p>x</p>")
    open(editor)
    await settle()
    expect(screen.getAllByRole("group").map((g) => g.getAttribute("aria-label"))).toEqual(["Last used", "Text colour", "Background"])
    expect(screen.getByRole("button", { name: "Purple background" })).toBeTruthy()
  })
})

describe("the phone's sheet", () => {
  it("names each colour under its swatch and colours as it is tapped", async () => {
    media.isMobile = true
    const editor = docEditor("<p>tap a colour</p>")
    editor.commands.setTextSelection({ from: 1, to: 4 })
    open(editor)
    await settle()
    expect(document.querySelector("[data-colour-sheet]")).toBeTruthy()
    const background = screen.getAllByRole("group").find((g) => g.getAttribute("aria-label") === "Background")!
    expect(background.textContent).toContain("Yellow")
    act(() => (Array.from(background.querySelectorAll("button")).find((b) => b.getAttribute("aria-label") === "Yellow") as HTMLButtonElement).click())
    expect(editor.getHTML()).toContain('<mark data-color="sun">tap</mark>')
    expect(screen.getByRole("button", { name: "Cancel" })).toBeTruthy()
  })
})
