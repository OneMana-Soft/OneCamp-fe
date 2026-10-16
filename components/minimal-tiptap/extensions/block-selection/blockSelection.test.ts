import { beforeAll, describe, expect, it } from "vitest"
import { Fragment, Slice } from "@tiptap/pm/model"
import { NodeSelection, TextSelection } from "@tiptap/pm/state"
import { BlockSelection, clickBlocks, selectedBlocks } from "./blockSelection"
import { blockAt } from "../block-commands/blocks"
import { docEditor, loadDocBlocks, outline, posOf, press } from "../block-commands/blockTestKit"

beforeAll(loadDocBlocks, 60_000)

// Choosing blocks as blocks (small-details S1, S3, S4, V6): Esc, the arrows,
// ⇧ to take in more, ↩ to edit, ⌫ to delete, ⇧-click and ⌘⇧-click.

const chosen = (e: ReturnType<typeof docEditor>) => (selectedBlocks(e.state) ?? []).map((b) => b.node.textContent)

describe("Esc", () => {
  it("chooses every block a text selection touches", () => {
    const e = docEditor("<p>one</p><p>two</p><p>three</p>")
    e.view.dispatch(e.state.tr.setSelection(TextSelection.create(e.state.doc, 2, posOf(e.state.doc, "two") + 2)))
    press(e, "Escape")
    expect(chosen(e)).toEqual(["one", "two"])
  })

  it("chooses a list item, a callout from its first line, a block in a column", () => {
    const e = docEditor('<ul><li><p>a</p></li></ul><div data-type="callout"><p>c1</p><p>c2</p></div><div data-type="column-list"><div data-type="column"><p>L</p></div><div data-type="column"><p>R</p></div></div>')
    for (const [text, type] of [["a", "listItem"], ["c1", "callout"], ["R", "paragraph"]]) {
      e.commands.setTextSelection(posOf(e.state.doc, text, "paragraph") + 1)
      press(e, "Escape")
      expect(selectedBlocks(e.state)?.[0].node.type.name, text).toBe(type)
      press(e, "Escape")
    }
  })
})

describe("with blocks chosen", () => {
  const three = () => {
    const e = docEditor("<p>one</p><p>two</p><p>three</p>")
    e.commands.setTextSelection(posOf(e.state.doc, "two") + 1)
    press(e, "Escape")
    return e
  }

  it("↑ and ↓ choose the block above or below; ⇧ takes it in too", () => {
    const e = three()
    press(e, "ArrowDown")
    expect(chosen(e)).toEqual(["three"])
    press(e, "ArrowDown")
    expect(chosen(e)).toEqual(["three"])
    press(e, "Shift-ArrowUp")
    press(e, "Shift-ArrowUp")
    expect(chosen(e)).toEqual(["one", "two", "three"])
    press(e, "Shift-ArrowDown")
    expect(chosen(e)).toEqual(["two", "three"])
  })

  it("↩ edits the last of them, at its end", () => {
    const e = three()
    press(e, "Enter")
    expect(e.state.selection).toBeInstanceOf(TextSelection)
    expect(e.state.selection.from).toBe(posOf(e.state.doc, "two") + 4)
  })

  it("typing does nothing to them", () => {
    const e = three()
    const handled = e.view.someProp("handleTextInput", (f) => f(e.view, e.state.selection.from, e.state.selection.to, "x", () => e.state.tr))
    expect(handled).toBe(true)
    expect(outline(e.state.doc)).toEqual(["paragraph:one", "paragraph:two", "paragraph:three"])
  })

  it("copies them as whole blocks, together or apart", () => {
    const e = docEditor("<p>one</p><ul><li><p>a</p></li><li><p>b</p></li></ul><p>two</p>")
    const doc = e.state.doc
    const a = blockAt(doc, posOf(doc, "a", "paragraph") + 1)!
    const apart = new BlockSelection(doc, [posOf(doc, "one"), a.pos, posOf(doc, "two")])
    expect(apart.together).toBe(false)
    const slice = apart.content()
    const kinds: string[] = []
    slice.content.forEach((n) => kinds.push(`${n.type.name}:${n.textContent}`))
    // The item stands on its own, in a list of its kind.
    expect(kinds).toEqual(["paragraph:one", "bulletList:a", "paragraph:two"])
    const together = new BlockSelection(doc, [posOf(doc, "one"), posOf(doc, "one") + 5])
    expect(together.together).toBe(true)
  })

  it("stay chosen through a change of their attributes, and go where an edit moves them", () => {
    const e = three()
    press(e, "Tab")
    expect(chosen(e)).toEqual(["two"])
    e.view.dispatch(e.state.tr.insert(0, e.state.schema.nodes.paragraph.create(null, e.state.schema.text("zero"))))
    expect(chosen(e)).toEqual(["two"])
  })

  it("are found again by their ids after a collaborator's edit", () => {
    const e = docEditor('<p data-block-id="b-1">one</p><p data-block-id="b-2">two</p>')
    e.view.dispatch(e.state.tr.setSelection(new BlockSelection(e.state.doc, [posOf(e.state.doc, "two")])))
    // As y-prosemirror applies one: the whole doc anew, a text selection put back.
    const doc = e.state.doc
    const fresh = Fragment.from([e.state.schema.nodes.paragraph.create({ blockId: "b-0" }, e.state.schema.text("new")), doc.child(0), doc.child(1)])
    const tr = e.state.tr.replace(0, doc.content.size, new Slice(fresh, 0, 0))
    tr.setSelection(TextSelection.create(tr.doc, 1)).setMeta("y-sync$", { isChangeOrigin: true })
    e.view.dispatch(tr)
    expect(chosen(e)).toEqual(["two"])
  })

  it("one block a menu holds stays held through a change of its own attributes, and only that", () => {
    const e = docEditor("<p>one</p><p>two</p>")
    const two = posOf(e.state.doc, "two")
    e.view.dispatch(e.state.tr.setSelection(NodeSelection.create(e.state.doc, two)))
    e.view.dispatch(e.state.tr.setNodeMarkup(two, undefined, { ...e.state.doc.nodeAt(two)!.attrs, indent: 1 }))
    expect(e.state.selection).toBeInstanceOf(NodeSelection)
    expect(e.state.selection.from).toBe(two)
    // Any other change maps it as ProseMirror does.
    e.view.dispatch(e.state.tr.insertText("x", two + 1).setNodeMarkup(two, undefined, { ...e.state.doc.nodeAt(two)!.attrs, indent: 0 }))
    expect(e.state.selection).not.toBeInstanceOf(NodeSelection)
  })

  it("hold a node, so the selection bar stays away", () => {
    const e = three()
    expect((e.state.selection as BlockSelection).node.textContent).toBe("two")
  })
})

describe("⇧-click and ⌘⇧-click", () => {
  it("extend chosen blocks to the clicked one, and add or take out one block", () => {
    const e = docEditor("<p>one</p><p>two</p><p>three</p><p>four</p>")
    const doc = e.state.doc
    const at = (text: string) => ({ pos: posOf(doc, text), node: doc.nodeAt(posOf(doc, text))! })
    e.view.dispatch(e.state.tr.setSelection(new BlockSelection(doc, [posOf(doc, "one")])))
    e.view.dispatch(e.state.tr.setSelection(clickBlocks(e.state, at("three"), false)!))
    expect(chosen(e)).toEqual(["one", "two", "three"])
    e.view.dispatch(e.state.tr.setSelection(clickBlocks(e.state, at("two"), true)!))
    expect(chosen(e)).toEqual(["one", "three"])
    e.view.dispatch(e.state.tr.setSelection(clickBlocks(e.state, at("four"), true)!))
    expect(chosen(e)).toEqual(["one", "three", "four"])
    // From a caret, ⇧-click is the text's.
    e.commands.setTextSelection(2)
    expect(clickBlocks(e.state, at("four"), false)).toBeNull()
  })

  it("from one block a menu chose (a NodeSelection), extends too", () => {
    const e = docEditor("<p>one</p><p>two</p><p>three</p>")
    const doc = e.state.doc
    e.view.dispatch(e.state.tr.setSelection(NodeSelection.create(doc, 0)))
    e.view.dispatch(e.state.tr.setSelection(clickBlocks(e.state, { pos: posOf(doc, "two"), node: doc.nodeAt(posOf(doc, "two"))! }, false)!))
    expect(chosen(e)).toEqual(["one", "two"])
  })
})
