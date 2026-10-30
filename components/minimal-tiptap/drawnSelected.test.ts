import { beforeAll, describe, expect, it } from "vitest"
import { NodeSelection } from "@tiptap/pm/state"
import { docEditor, loadDocBlocks } from "./extensions/block-commands/blockTestKit"
import { BlockSelection } from "./extensions/block-selection/blockSelection"
import { drawnSelected } from "./utils"

beforeAll(async () => {
  await loadDocBlocks()
}, 60_000)

const PAGE = `<p>One</p><div data-type="subpage" data-doc-id="c4110000-0000-4000-8000-0000000000c1"></div><p>Two</p>`

function pagePos(editor: ReturnType<typeof docEditor>): number {
  let at = -1
  editor.state.doc.descendants((n, pos) => void (at < 0 && n.type.name === "subpage" && (at = pos)))
  return at
}

describe("a block view's own selected look", () => {
  it("is drawn for the one block selected, and left to the block selection's look for blocks chosen as blocks", () => {
    const editor = docEditor(PAGE)
    const at = pagePos(editor)
    editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, at)))
    expect(drawnSelected(editor, true)).toBe(true)
    // Esc's choice, or a restored page's: the block wears block-selected, and only that.
    editor.view.dispatch(editor.state.tr.setSelection(new BlockSelection(editor.state.doc, [at])))
    expect(drawnSelected(editor, true)).toBe(false)
  })

  // A page's block held for a menu's action (Move to…) or
  // clicked is a NodeSelection: it wore its own ring inside the block
  // selection's tint (DESIGN-BUILD-15). Each way of choosing it shows one look.
  it("is the one look a chosen page block wears, however it was chosen", () => {
    const editor = docEditor(PAGE)
    const at = pagePos(editor)
    const tinted = () => editor.view.dom.querySelectorAll(".block-selected").length
    editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, at)))
    expect(drawnSelected(editor, true)).toBe(true)
    expect(tinted()).toBe(0)
    editor.view.dispatch(editor.state.tr.setSelection(new BlockSelection(editor.state.doc, [at])))
    expect(drawnSelected(editor, true)).toBe(false)
    expect(tinted()).toBe(1)
  })

  it("is never drawn where the editor only reads", () => {
    const editor = docEditor(PAGE)
    editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, pagePos(editor))))
    editor.setEditable(false)
    expect(drawnSelected(editor, true)).toBe(false)
  })
})
