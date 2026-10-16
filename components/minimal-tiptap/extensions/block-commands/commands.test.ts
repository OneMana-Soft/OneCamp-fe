import { beforeAll, describe, expect, it } from "vitest"
import { NodeSelection, TextSelection } from "@tiptap/pm/state"
import { adjacentBlock, blockAt, blocksBetween, blocksInRange, outlineEnd, spanOf, withChildren } from "./blocks"
import { blocksWithIds, deleteBlocks, duplicateBlocks, insertLine, moveBlocks, targetBlocks } from "./commands"
import { BlockSelection } from "../block-selection/blockSelection"
import { docEditor, indents, loadDocBlocks, outline, posOf } from "./blockTestKit"

beforeAll(loadDocBlocks, 60_000)

// What a "block" is for the hand, and what moving, copying and deleting one
// does: always one transaction, and a block takes its outline children with
// it (the blocks after it indented deeper), as Notion's children go with
// their parent.

const ind = (text: string, indent: number) => `<p data-indent="${indent}">${text}</p>`

describe("a block, for the hand", () => {
  it("is the innermost block, raised to the container whose first line it is", () => {
    const e = docEditor('<ul><li><p>a</p><p>a2</p></li><li><p>b</p></li></ul><div data-type="callout"><p>c1</p><p>c2</p></div>')
    const doc = e.state.doc
    expect(blockAt(doc, posOf(doc, "a", "paragraph") + 1)?.node.type.name).toBe("listItem")
    expect(blockAt(doc, posOf(doc, "a2") + 1)?.node.type.name).toBe("paragraph")
    expect(blockAt(doc, posOf(doc, "c1") + 1)?.node.type.name).toBe("callout")
    expect(blockAt(doc, posOf(doc, "c2") + 1)?.node.textContent).toBe("c2")
  })

  it("is a block in a column, never the column", () => {
    const e = docEditor('<div data-type="column-list"><div data-type="column"><p>L</p></div><div data-type="column"><p>R</p></div></div>')
    const b = blockAt(e.state.doc, posOf(e.state.doc, "R", "paragraph") + 1)
    expect(b?.node.type.name).toBe("paragraph")
    expect(b?.node.textContent).toBe("R")
  })

  it("chooses the blocks between two at their common level; two columns of one row choose the row", () => {
    const e = docEditor('<p>one</p><ul><li><p>a</p></li></ul><p>x</p><div data-type="column-list"><div data-type="column"><p>L</p></div><div data-type="column"><p>R</p></div></div>')
    const doc = e.state.doc
    const item = blockAt(doc, posOf(doc, "a", "paragraph") + 1)!
    expect(blocksBetween(doc, item.pos, posOf(doc, "x")).map((b) => b.node.type.name)).toEqual(["bulletList", "paragraph"])
    expect(blocksBetween(doc, posOf(doc, "L", "paragraph"), posOf(doc, "R", "paragraph")).map((b) => b.node.type.name)).toEqual(["columnList"])
  })

  it("steps to the line above or below, at any depth", () => {
    const e = docEditor('<p>one</p><ul><li><p>a</p></li><li><p>b</p></li></ul><p>two</p>')
    const doc = e.state.doc
    const one = blockAt(doc, 1)!
    const a = adjacentBlock(doc, one, 1)!
    expect(a.node.type.name).toBe("listItem")
    const b = adjacentBlock(doc, a, 1)!
    expect(b.node.textContent).toBe("b")
    expect(adjacentBlock(doc, b, 1)?.node.textContent).toBe("two")
    expect(adjacentBlock(doc, a, -1)?.node.textContent).toBe("one")
    expect(adjacentBlock(doc, one, -1)).toBeNull()
  })

  it("has the blocks indented deeper after it as its outline children", () => {
    const e = docEditor(ind("A", 0) + ind("B", 1) + ind("C", 2) + ind("D", 1) + ind("E", 0))
    const doc = e.state.doc
    expect(outlineEnd(doc, 0)).toBe(4)
    expect(withChildren(doc, 0).count).toBe(4)
    expect(withChildren(doc, posOf(doc, "C")).count).toBe(1)
  })

  it("reads a menu's range of whole blocks as those blocks, and a text range as the blocks it touches", () => {
    const e = docEditor("<p>one</p><p>two</p><p>three</p>")
    const doc = e.state.doc
    const blocks = blocksInRange(doc, posOf(doc, "two"), doc.content.size)
    expect(blocks.map((b) => b.node.textContent)).toEqual(["two", "three"])
    expect(spanOf(blocks)).toEqual({ from: posOf(doc, "two"), to: doc.content.size })
    expect(blocksInRange(doc, 2, posOf(doc, "two") + 2).map((b) => b.node.textContent)).toEqual(["one", "two"])
  })
})

describe("moving blocks up and down (⌘⇧↑ ⌘⇧↓)", () => {
  it("moves the caret's block past the one above or below, the caret going with it", () => {
    const e = docEditor("<p>one</p><p>two</p><p>three</p>")
    e.commands.setTextSelection(posOf(e.state.doc, "two") + 2)
    e.view.dispatch(moveBlocks(e.state, targetBlocks(e.state), -1)!)
    expect(outline(e.state.doc)).toEqual(["paragraph:two", "paragraph:one", "paragraph:three"])
    expect(e.state.selection.$from.parent.textContent).toBe("two")
    expect(e.state.selection.from).toBe(posOf(e.state.doc, "two") + 2)
    expect(moveBlocks(e.state, targetBlocks(e.state), -1)).toBeNull()
  })

  it("takes a block's children with it, and moves past a block with its children", () => {
    const e = docEditor(ind("A", 0) + ind("B", 1) + ind("C", 0))
    e.commands.setTextSelection(2)
    e.view.dispatch(moveBlocks(e.state, targetBlocks(e.state), 1)!)
    expect(indents(e.state.doc)).toEqual(["C@0", "A@0", "B@1"])
    e.commands.setTextSelection(2)
    e.view.dispatch(moveBlocks(e.state, targetBlocks(e.state), 1)!)
    expect(indents(e.state.doc)).toEqual(["A@0", "B@1", "C@0"])
  })

  it("never leaves a block two levels under the one above it", () => {
    const e = docEditor(ind("A", 0) + ind("B", 1) + ind("C", 2) + ind("D", 0))
    e.commands.setTextSelection(posOf(e.state.doc, "C") + 1)
    e.view.dispatch(moveBlocks(e.state, targetBlocks(e.state), -1)!)
    expect(indents(e.state.doc)).toEqual(["A@0", "C@1", "B@1", "D@0"])
  })

  it("moves a list item within its list, and stays put at the list's edge", () => {
    const e = docEditor("<ul><li><p>a</p></li><li><p>b</p></li></ul><p>after</p>")
    e.commands.setTextSelection(posOf(e.state.doc, "b", "paragraph") + 1)
    e.view.dispatch(moveBlocks(e.state, targetBlocks(e.state), -1)!)
    const list = e.state.doc.firstChild!
    expect(list.childCount).toBe(2)
    expect(list.firstChild!.textContent).toBe("b")
    expect(moveBlocks(e.state, targetBlocks(e.state), -1)).toBeNull()
  })

  it("keeps chosen blocks chosen where they went", () => {
    const e = docEditor("<p>one</p><p>two</p><p>three</p>")
    const doc = e.state.doc
    e.view.dispatch(e.state.tr.setSelection(new BlockSelection(doc, [posOf(doc, "two"), posOf(doc, "three")])))
    e.view.dispatch(moveBlocks(e.state, targetBlocks(e.state), -1)!)
    expect(outline(e.state.doc)).toEqual(["paragraph:two", "paragraph:three", "paragraph:one"])
    const sel = e.state.selection as BlockSelection
    expect(sel instanceof BlockSelection && sel.refs().map((b) => b.node.textContent)).toEqual(["two", "three"])
  })

  it("keeps a menu's block chosen when run as the editor's command (the chain's state follows its change)", () => {
    const e = docEditor("<p>one</p><p>two</p><p>three</p>")
    e.view.dispatch(e.state.tr.setSelection(NodeSelection.create(e.state.doc, posOf(e.state.doc, "two"))))
    e.chain().moveBlocks(1).run()
    expect(outline(e.state.doc)).toEqual(["paragraph:one", "paragraph:three", "paragraph:two"])
    expect(e.state.selection).toBeInstanceOf(NodeSelection)
    expect((e.state.selection as NodeSelection).node.textContent).toBe("two")
    e.chain().duplicateBlocks().run()
    expect((e.state.selection as NodeSelection).node.textContent).toBe("two")
    expect(e.state.selection.from).toBe(e.state.doc.content.size - 5)
  })
})

describe("duplicating blocks (⌘D, Duplicate)", () => {
  it("puts a copy right below, with an id of its own, the caret in the copy", () => {
    const e = docEditor('<p data-block-id="b-one">one</p><p data-block-id="b-two">two</p>')
    e.commands.setTextSelection(posOf(e.state.doc, "one") + 2)
    e.view.dispatch(duplicateBlocks(e.state, targetBlocks(e.state))!)
    expect(outline(e.state.doc)).toEqual(["paragraph:one", "paragraph:one", "paragraph:two"])
    const ids: unknown[] = []
    e.state.doc.forEach((n) => ids.push(n.attrs.blockId))
    expect(ids[0]).toBe("b-one")
    expect(ids[1]).toMatch(/^[0-9a-f-]{36}$/)
    expect(new Set(ids).size).toBe(3)
    // The caret in the copy, where it was in the block.
    expect(e.state.selection.from).toBe(posOf(e.state.doc, "two") - 5 + 2)
  })

  it("copies a block with its children", () => {
    const e = docEditor(ind("A", 0) + ind("B", 1) + ind("C", 0))
    e.commands.setTextSelection(1)
    e.view.dispatch(duplicateBlocks(e.state, targetBlocks(e.state))!)
    expect(indents(e.state.doc)).toEqual(["A@0", "B@1", "A@0", "B@1", "C@0"])
  })

  it("chooses the copies when blocks were chosen", () => {
    const e = docEditor("<p>one</p><p>two</p>")
    e.view.dispatch(e.state.tr.setSelection(NodeSelection.create(e.state.doc, 0)))
    e.view.dispatch(duplicateBlocks(e.state, targetBlocks(e.state))!)
    expect(e.state.selection instanceof NodeSelection && (e.state.selection as NodeSelection).from).toBe(5)
  })
})

describe("deleting blocks", () => {
  it("takes the blocks and their children, the caret at the end of the block above", () => {
    const e = docEditor(ind("A", 0) + ind("B", 0) + ind("C", 1) + ind("D", 0))
    const doc = e.state.doc
    e.view.dispatch(e.state.tr.setSelection(new BlockSelection(doc, [posOf(doc, "B")])))
    e.view.dispatch(deleteBlocks(e.state, targetBlocks(e.state))!)
    expect(indents(e.state.doc)).toEqual(["A@0", "D@0"])
    expect(e.state.selection.$from.parent.textContent).toBe("A")
    expect(e.state.selection).toBeInstanceOf(TextSelection)
  })

  it("takes the blocks a menu names by their ids, in document order, and nothing between them", () => {
    const e = docEditor('<p data-block-id="b-0000001">one</p><ul><li data-block-id="b-0000002"><p>a</p></li></ul><p data-block-id="b-0000003">three</p>')
    expect(blocksWithIds(e.state.doc, ["b-0000003", "b-0000001", "b-gone"]).map((b) => b.node.textContent)).toEqual(["one", "three"])
    expect(targetBlocks(e.state, ["b-0000002"]).map((b) => b.node.type.name)).toEqual(["listItem"])
    e.chain().deleteBlocks(["b-0000001", "b-0000003"]).run()
    expect(outline(e.state.doc)).toEqual(["bulletList:a"])
  })

  it("takes only the blocks chosen apart, though the menu names them by the range they span", () => {
    const e = docEditor("<p>one</p><p>two</p><p>three</p>")
    const doc = e.state.doc
    const chosen = new BlockSelection(doc, [0, posOf(doc, "three")])
    e.view.dispatch(e.state.tr.setSelection(chosen))
    e.chain().deleteBlocks({ from: 0, to: doc.content.size }).run()
    expect(outline(e.state.doc)).toEqual(["paragraph:two"])
  })

  it("takes a list whose every item goes", () => {
    const e = docEditor("<p>one</p><ul><li><p>a</p></li><li><p>b</p></li></ul>")
    const doc = e.state.doc
    const a = blockAt(doc, posOf(doc, "a", "paragraph") + 1)!
    const b = blockAt(doc, posOf(doc, "b", "paragraph") + 1)!
    e.view.dispatch(e.state.tr.setSelection(new BlockSelection(doc, [a.pos, b.pos])))
    e.view.dispatch(deleteBlocks(e.state, targetBlocks(e.state))!)
    expect(outline(e.state.doc)).toEqual(["paragraph:one"])
  })

  it("takes a column it leaves empty, and a row left with one column gives its blocks back", () => {
    const row = (cols: string[]) => `<div data-type="column-list">${cols.map((c) => `<div data-type="column"><p>${c}</p></div>`).join("")}</div>`
    const e = docEditor(row(["L", "M", "R"]))
    const at = (text: string) => posOf(e.state.doc, text, "paragraph")
    e.view.dispatch(e.state.tr.setSelection(new BlockSelection(e.state.doc, [at("M")])))
    e.view.dispatch(deleteBlocks(e.state, targetBlocks(e.state))!)
    expect(e.state.doc.firstChild!.childCount).toBe(2)
    // Chosen apart, in both columns left: Backspace takes the row.
    e.view.dispatch(e.state.tr.setSelection(new BlockSelection(e.state.doc, [at("L"), at("R")])))
    e.view.dispatch(e.state.tr.deleteSelection())
    expect(e.state.doc.childCount).toBe(1)
    expect(e.state.doc.firstChild!.type.name).toBe("paragraph")
    expect(e.state.doc.textContent).toBe("")
    // One column's block of two: the row unwraps around the other.
    const f = docEditor(row(["L", "R"]))
    f.view.dispatch(f.state.tr.setSelection(new BlockSelection(f.state.doc, [posOf(f.state.doc, "L", "paragraph")])))
    f.view.dispatch(deleteBlocks(f.state, targetBlocks(f.state))!)
    expect(outline(f.state.doc)).toEqual(["paragraph:R"])
  })
})

describe("a new line from the handle's +", () => {
  it("goes below the block and its children at the block's own indent, or above with ⌥", () => {
    const e = docEditor(ind("A", 1) + ind("B", 2) + ind("C", 0))
    const block = blockAt(e.state.doc, 1)!
    e.view.dispatch(insertLine(e.state, block, false)!)
    expect(indents(e.state.doc)).toEqual(["A@1", "B@2", "@1", "C@0"])
    expect(e.state.selection.$from.parent.textContent).toBe("")
    e.view.dispatch(insertLine(e.state, blockAt(e.state.doc, 1)!, true)!)
    expect(indents(e.state.doc)[0]).toBe("@1")
  })

  it("is a new item in a list", () => {
    const e = docEditor("<ul><li><p>a</p></li></ul>")
    const item = blockAt(e.state.doc, posOf(e.state.doc, "a", "paragraph") + 1)!
    e.view.dispatch(insertLine(e.state, item, false)!)
    expect(e.state.doc.firstChild!.childCount).toBe(2)
    expect(e.state.selection.$from.node(-1).type.name).toBe("listItem")
  })
})
