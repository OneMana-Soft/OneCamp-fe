import { beforeAll, describe, expect, it } from "vitest"
import type { Editor } from "@tiptap/core"
import { blockAt, type BlockRef } from "../block-commands/blocks"
import { dropTransaction, type Drop } from "./dropTarget"
import { docEditor, indents, loadDocBlocks, outline, posOf } from "../block-commands/blockTestKit"

beforeAll(loadDocBlocks, 60_000)

// Where a dragged block lands, and the one change that puts it there: a move
// is a delete and an insert in one transaction (a collaborator never sees a
// copy), ⌥ copies, a list takes items and parts for anything else, and the
// right fifth of a block makes columns.

const ref = (e: Editor, text: string, type?: string): BlockRef => {
  const pos = posOf(e.state.doc, text, type)
  return blockAt(e.state.doc, pos + 1)!
}
const drop = (e: Editor, dragged: BlockRef[], d: Drop, copy = false) => {
  const r = dropTransaction(e.state, dragged, d, copy)
  if (r) e.view.dispatch(r.tr)
  return r
}
const ids = (e: Editor) => {
  const out: unknown[] = []
  e.state.doc.descendants((n) => {
    if (n.isBlock && n.attrs.blockId) out.push(n.attrs.blockId)
  })
  return out
}

describe("a drop between blocks", () => {
  it("moves the block there in one change, keeping its id, the caret at its end", () => {
    const e = docEditor('<p data-block-id="b-1">one</p><p data-block-id="b-2">two</p><p data-block-id="b-3">three</p>')
    const r = drop(e, [ref(e, "one")], { kind: "gap", pos: e.state.doc.content.size, indent: 0 })!
    expect(r.tr.steps.length).toBe(2)
    expect(outline(e.state.doc)).toEqual(["paragraph:two", "paragraph:three", "paragraph:one"])
    expect(e.state.doc.lastChild?.attrs.blockId).toBe("b-1")
    expect(e.state.selection.$from.parent.textContent).toBe("one")
  })

  it("changes nothing onto the block's own place, and only its indent at another depth", () => {
    const e = docEditor("<p>one</p><p>two</p>")
    const two = ref(e, "two")
    expect(dropTransaction(e.state, [two], { kind: "gap", pos: two.pos, indent: 0 }, false)).toBeNull()
    drop(e, [two], { kind: "gap", pos: two.pos, indent: 1 })
    expect(indents(e.state.doc)).toEqual(["one@0", "two@1"])
  })

  it("never puts blocks inside themselves", () => {
    const e = docEditor('<div data-type="callout"><p>c1</p><p>c2</p></div><p>x</p>')
    const callout = ref(e, "c1")
    expect(dropTransaction(e.state, [callout], { kind: "gap", pos: posOf(e.state.doc, "c2"), indent: null }, false)).toBeNull()
  })

  it("carries a block's children, at the depth the line showed", () => {
    const e = docEditor('<p>A</p><p data-indent="1">B</p><p>C</p>')
    drop(e, [ref(e, "A")], { kind: "gap", pos: e.state.doc.content.size, indent: 1 })
    expect(indents(e.state.doc)).toEqual(["C@0", "A@1", "B@2"])
  })

  it("copies with ⌥, the copy with ids of its own", () => {
    const e = docEditor('<p data-block-id="b-1">one</p><p data-block-id="b-2">two</p>')
    drop(e, [ref(e, "one")], { kind: "gap", pos: e.state.doc.content.size, indent: 0 }, true)
    expect(outline(e.state.doc)).toEqual(["paragraph:one", "paragraph:two", "paragraph:one"])
    expect(new Set(ids(e)).size).toBe(3)
  })
})

describe("lists", () => {
  it("move one item out on its own, in a list of its kind", () => {
    const e = docEditor("<p>x</p><ul><li><p>a</p></li><li><p>b</p></li></ul>")
    drop(e, [ref(e, "b", "paragraph")], { kind: "gap", pos: 0, indent: 0 })
    expect(outline(e.state.doc)).toEqual(["bulletList:b", "paragraph:x", "bulletList:a"])
  })

  it("take an item among theirs, a to-do as a bullet", () => {
    const e = docEditor('<ul data-type="taskList"><li data-type="taskItem" data-checked="true"><p>t</p></li></ul><ul><li><p>a</p></li></ul>')
    const a = ref(e, "a", "paragraph")
    drop(e, [ref(e, "t", "paragraph")], { kind: "gap", pos: a.pos + a.node.nodeSize, indent: null })
    expect(outline(e.state.doc)).toEqual(["bulletList:at"])
    expect(e.state.doc.firstChild?.child(1).type.name).toBe("listItem")
  })

  it("part where any other block lands among their items", () => {
    const e = docEditor("<ol start=\"3\"><li><p>a</p></li><li><p>b</p></li></ol><p>x</p>")
    const b = ref(e, "b", "paragraph")
    drop(e, [ref(e, "x")], { kind: "gap", pos: b.pos, indent: null })
    expect(outline(e.state.doc)).toEqual(["orderedList:a", "paragraph:x", "orderedList:b"])
    // The second part goes on counting from the first.
    expect(e.state.doc.child(2).attrs.start).toBe(4)
  })
})

describe("columns, from a drop beside a block", () => {
  it("stands the two side by side", () => {
    const e = docEditor("<p>one</p><p>two</p>")
    drop(e, [ref(e, "two")], { kind: "beside", pos: 0 })
    const row = e.state.doc.firstChild!
    expect(row.type.name).toBe("columnList")
    expect(row.childCount).toBe(2)
    expect([row.child(0).textContent, row.child(1).textContent]).toEqual(["one", "two"])
    expect(e.state.doc.childCount).toBe(1)
  })

  it("adds a column to a row, its widths even again, up to four", () => {
    const e = docEditor('<div data-type="column-list"><div data-type="column" data-width="30"><p>L</p></div><div data-type="column" data-width="70"><p>R</p></div></div><p>x</p>')
    drop(e, [ref(e, "x")], { kind: "beside", pos: posOf(e.state.doc, "R", "paragraph") })
    const row = e.state.doc.firstChild!
    expect(row.childCount).toBe(3)
    const widths: unknown[] = []
    row.forEach((c) => widths.push(c.attrs.width))
    expect(widths).toEqual([null, null, null])
  })

  it("give a row's blocks back when a drag leaves it one column", () => {
    const e = docEditor('<div data-type="column-list"><div data-type="column"><p>L</p></div><div data-type="column"><p>R</p></div></div>')
    drop(e, [ref(e, "R", "paragraph")], { kind: "gap", pos: e.state.doc.content.size, indent: 0 })
    expect(outline(e.state.doc)).toEqual(["paragraph:L", "paragraph:R"])
  })
})
