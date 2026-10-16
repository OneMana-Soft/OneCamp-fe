import { beforeAll, describe, expect, it } from "vitest"
import * as Y from "yjs"
import { Editor, Extension } from "@tiptap/core"
import Collaboration from "@tiptap/extension-collaboration"
import { yUndoPluginKey } from "y-prosemirror"
import { Plugin, TextSelection } from "@tiptap/pm/state"
import { extensionsFor } from "@/components/docEditor/registry/factory"
import { ALL_EDITIONS, bareContext } from "@/components/docEditor/registry/manifest"
import { turnIntoFor } from "@/components/docEditor/registry/readers"
import { BlockSelection } from "../block-selection/blockSelection"
import { keepOnTurnIntoKey } from "./indent"
import { docEditor, indents, loadDocBlocks, posOf, press } from "../block-commands/blockTestKit"

beforeAll(loadDocBlocks, 60_000)

// Tab nests any block (editor.md P1-6, small-details T23): an attribute, so
// nobody's typing in the block is lost, and focus never leaves the text.

const caretIn = (e: ReturnType<typeof docEditor>, text: string) => e.commands.setTextSelection(posOf(e.state.doc, text) + 1)

describe("Tab", () => {
  it("nests a paragraph one level under the one above it, no deeper, and keeps focus in the text", () => {
    const e = docEditor("<p>one</p><p>two</p>")
    caretIn(e, "two")
    expect(press(e, "Tab").defaultPrevented).toBe(true)
    expect(indents(e.state.doc)).toEqual(["one@0", "two@1"])
    press(e, "Tab")
    expect(indents(e.state.doc)).toEqual(["one@0", "two@1"])
    expect(press(e, "Shift-Tab").defaultPrevented).toBe(true)
    expect(indents(e.state.doc)).toEqual(["one@0", "two@0"])
  })

  it("keeps the key on the first block, which has nothing to nest under", () => {
    const e = docEditor("<p>one</p>")
    caretIn(e, "one")
    expect(press(e, "Tab").defaultPrevented).toBe(true)
    expect(indents(e.state.doc)).toEqual(["one@0"])
  })

  it("takes a block's children along, and nests chosen blocks together", () => {
    const e = docEditor('<p>x</p><p>A</p><p data-indent="1">B</p><p>C</p>')
    caretIn(e, "A")
    press(e, "Tab")
    expect(indents(e.state.doc)).toEqual(["x@0", "A@1", "B@2", "C@0"])
    const doc = e.state.doc
    e.view.dispatch(e.state.tr.setSelection(new BlockSelection(doc, [posOf(doc, "A"), posOf(doc, "C")])))
    press(e, "Shift-Tab")
    expect(indents(e.state.doc)).toEqual(["x@0", "A@0", "B@1", "C@0"])
    // The chosen blocks stay chosen through it.
    expect(e.state.selection).toBeInstanceOf(BlockSelection)
  })

  it("leaves a list item to its list, and nests the whole list from its first item", () => {
    const e = docEditor("<p>x</p><ul><li><p>a</p></li><li><p>b</p></li></ul>")
    caretIn(e, "b")
    press(e, "Tab")
    expect(JSON.stringify(e.getJSON()).match(/bulletList/g)?.length).toBe(2)
    press(e, "Shift-Tab")
    caretIn(e, "a")
    press(e, "Tab")
    expect(e.state.doc.child(1).attrs.indent).toBe(1)
    press(e, "Shift-Tab")
    expect(e.state.doc.child(1).attrs.indent).toBe(0)
  })

  it("leaves code its own indent", () => {
    const e = docEditor("<pre><code>x</code></pre>")
    e.commands.setTextSelection(1)
    press(e, "Tab")
    expect(e.state.doc.firstChild?.textContent).toBe("  x")
  })

  it("lets Escape, then Tab, leave the text (the keyboard's way out)", () => {
    const e = docEditor("<p>one</p><p>two</p>")
    caretIn(e, "two")
    press(e, "Escape")
    expect(press(e, "Tab").defaultPrevented).toBe(false)
    expect(indents(e.state.doc)).toEqual(["one@0", "two@0"])
  })
})

describe("indent and direction in a doc", () => {
  it("are written as data-indent and dir, and read back; nothing else is", () => {
    const e = docEditor('<p data-indent="2" dir="rtl">a</p><p data-indent="12" dir="sideways">b</p><ul data-indent="1"><li><p>c</p></li></ul>')
    expect(e.state.doc.child(0).attrs).toEqual(expect.objectContaining({ indent: 2, dir: "rtl" }))
    expect(e.state.doc.child(1).attrs).toEqual(expect.objectContaining({ indent: 8, dir: null }))
    expect(e.state.doc.child(2).attrs.indent).toBe(1)
    const html = e.getHTML()
    expect(html).toContain('data-indent="2"')
    expect(html).toContain('dir="rtl"')
    expect(html).not.toContain("sideways")
  })

  it("draw on the block's own element", () => {
    const e = docEditor('<p data-indent="1" dir="rtl">a</p>')
    const p = e.view.dom.querySelector("p")!
    expect(p.getAttribute("data-indent")).toBe("1")
    expect(p.getAttribute("dir")).toBe("rtl")
    e.commands.setTextSelection(1)
    e.commands.setBlockDir(null)
    expect(e.view.dom.querySelector("p")!.hasAttribute("dir")).toBe(false)
  })

  it("are kept, with the block's id, when Turn into changes several blocks at once", () => {
    const e = docEditor('<p data-block-id="b-1" data-indent="1" dir="rtl">one</p><p data-block-id="b-2" data-indent="2">two</p>')
    const doc = e.state.doc
    e.view.dispatch(e.state.tr.setSelection(TextSelection.create(doc, 1, doc.content.size - 1)))
    e.chain().setHeading({ level: 2 }).run()
    const [a, b] = [e.state.doc.child(0), e.state.doc.child(1)]
    expect(a.type.name).toBe("heading")
    expect(a.attrs).toEqual(expect.objectContaining({ blockId: "b-1", indent: 1, dir: "rtl", level: 2 }))
    expect(b.attrs).toEqual(expect.objectContaining({ blockId: "b-2", indent: 2, level: 2 }))
  })

  it("are kept through Turn into from the menu, which resets a block before it gives it its kind", () => {
    const e = docEditor('<p data-block-id="b-0000001" data-indent="2" dir="rtl">Launch plan</p>')
    e.commands.setTextSelection(3)
    turnIntoFor(ALL_EDITIONS).find((t) => t.id === "h2")!.run(e)
    expect(e.state.doc.firstChild!.type.name).toBe("heading")
    expect(e.state.doc.firstChild!.attrs).toEqual(expect.objectContaining({ blockId: "b-0000001", indent: 2, dir: "rtl" }))
    turnIntoFor(ALL_EDITIONS).find((t) => t.id === "text")!.run(e)
    expect(e.state.doc.firstChild!.attrs).toEqual(expect.objectContaining({ blockId: "b-0000001", indent: 2, dir: "rtl" }))
  })

  it("leave Turn into one step of ⌘Z on a live doc, undone whole", () => {
    const e = new Editor({ element: document.createElement("div"), extensions: [...extensionsFor(bareContext("doc")), Collaboration.configure({ document: new Y.Doc(), field: "default" })] })
    e.commands.setContent('<p data-block-id="b-0000001" data-indent="1">Launch plan</p>')
    e.commands.setTextSelection(3)
    const undo = yUndoPluginKey.getState(e.state)!.undoManager
    undo.stopCapturing()
    const before = e.getJSON()
    const steps = undo.undoStack.length
    turnIntoFor(ALL_EDITIONS).find((t) => t.id === "h2")!.run(e)
    expect(e.state.doc.firstChild!.attrs.indent).toBe(1)
    expect(undo.undoStack.length - steps).toBe(1)
    e.commands.undo()
    expect(e.getJSON()).toEqual(before)
  })

  it("stay drawn through a collaborator's change, which comes as a new copy of the whole doc", () => {
    const e = docEditor('<p data-indent="1">one</p><p data-indent="2" dir="rtl">two</p><p>three</p>')
    const doc = e.state.doc
    // As y-prosemirror applies one: the whole doc replaced, one word changed.
    const next = doc.type.create(doc.attrs, [doc.child(0), doc.child(1), e.state.schema.nodes.paragraph.create(null, e.state.schema.text("three!"))])
    e.view.dispatch(e.state.tr.replaceWith(0, doc.content.size, next.content).setMeta("y-sync$", { isChangeOrigin: true }))
    const ps = e.view.dom.querySelectorAll("p")
    expect([ps[0].getAttribute("data-indent"), ps[1].getAttribute("data-indent"), ps[1].getAttribute("dir"), ps[2].textContent]).toEqual(["1", "2", "rtl", "three!"])
  })

  it("let Enter split a block with an id without a tug of war with the block ids (the 78-minute spin of 13 Oct)", () => {
    // Enter leaves both halves with the block's id; Block Identity gives one
    // half a new id. Answering that (putting the old id back) made the two
    // append to each other for ever. A counter throws past 20, so a
    // regression fails here instead of spinning.
    let appends = 0
    const Counter = Extension.create({
      name: "counter",
      addProseMirrorPlugins: () => [
        new Plugin({
          appendTransaction: (trs) => {
            if (trs.some((t) => t.getMeta(keepOnTurnIntoKey)) && ++appends > 20) throw new Error("keepOnTurnInto keeps appending")
            return null
          },
        }),
      ],
    })
    const e = new Editor({ extensions: [...extensionsFor(bareContext("doc")), Counter], content: '<p data-block-id="b-0000001" data-indent="1">Launch plan</p>' })
    e.commands.setTextSelection(4)
    e.commands.splitBlock()
    const ids = [e.state.doc.child(0).attrs.blockId, e.state.doc.child(1).attrs.blockId]
    expect(new Set(ids).size).toBe(2)
    expect(appends).toBe(0)
  })

  it("never answer another plugin's answer: a plugin that turns a block again after each of its fixes can't make them append for ever", () => {
    // Without the guard this spins: ProseMirror asks again until nobody
    // appends. The other plugin stops itself at 20, so a regression fails
    // here instead of hanging the run.
    let turns = 0
    const Contrary = Extension.create({
      name: "contrary",
      addProseMirrorPlugins: () => [
        new Plugin({
          appendTransaction: (trs, _old, state) => {
            if (!trs.some((t) => t.getMeta(keepOnTurnIntoKey)) || ++turns > 20) return null
            const node = state.doc.firstChild!
            return state.tr.setNodeMarkup(0, node.type.name === "heading" ? state.schema.nodes.paragraph : state.schema.nodes.heading, { level: 2 })
          },
        }),
      ],
    })
    const e = new Editor({ extensions: [...extensionsFor(bareContext("doc")), Contrary], content: '<p data-indent="2">Launch plan</p>' })
    e.commands.setTextSelection(3)
    turnIntoFor(ALL_EDITIONS).find((t) => t.id === "h2")!.run(e)
    expect(turns).toBeLessThanOrEqual(1)
  })

  it("go a list item's way through its list", () => {
    const e = docEditor("<ul><li><p>a</p></li></ul>")
    e.commands.setTextSelection(3)
    e.commands.setBlockDir("rtl")
    expect(e.state.doc.firstChild?.attrs.dir).toBe("rtl")
    expect(e.view.dom.querySelector("ul")?.getAttribute("dir")).toBe("rtl")
  })
})

describe("the phone bar's indent (no Tab key)", () => {
  it("is offered only where a block would move", () => {
    const e = docEditor("<p>one</p><p>two</p>")
    caretIn(e, "one")
    expect(e.can().nestBlocks(1)).toBe(false)
    expect(e.can().nestBlocks(-1)).toBe(false)
    caretIn(e, "two")
    expect(e.can().nestBlocks(1)).toBe(true)
    expect(e.chain().nestBlocks(1).run()).toBe(true)
    expect(indents(e.state.doc)).toEqual(["one@0", "two@1"])
    expect(e.can().nestBlocks(1)).toBe(false)
    expect(e.can().nestBlocks(-1)).toBe(true)
  })
})
