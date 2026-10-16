/**
 * What Comment is on (docs programme B7): words, a caret's block, one whole
 * block (the block menu's Comment, a picture too), or several blocks; made
 * against a real Yjs doc bound as the editor binds it.
 */
import { afterEach, describe, expect, it } from "vitest"
import * as Y from "yjs"
import { prosemirrorJSONToYXmlFragment, ySyncPlugin } from "y-prosemirror"
import { Schema } from "@tiptap/pm/model"
import { EditorState } from "@tiptap/pm/state"
import { EditorView } from "@tiptap/pm/view"
import type { Editor } from "@tiptap/core"
import { resolveAnchor, bindingOf } from "@/lib/anchors/anchors"
import { MAX_BLOCKS, anchorOf, anchorOfBlocks, blockQuote } from "./anchorOf"

const schema = new Schema({
    nodes: {
        doc: { content: "block+" },
        paragraph: { group: "block", content: "inline*", attrs: { blockId: { default: null } }, toDOM: () => ["p", 0] },
        image: { group: "block", atom: true, attrs: { blockId: { default: null }, src: { default: "" } }, toDOM: () => ["img"] },
        text: { group: "inline" },
    },
})

const p = (id: string | null, text?: string) => ({ type: "paragraph", attrs: { blockId: id }, content: text ? [{ type: "text", text }] : [] })
const img = (id: string) => ({ type: "image", attrs: { blockId: id, src: "a.png" } })

const views: EditorView[] = []
afterEach(() => views.splice(0).forEach((v) => v.destroy()))

/** An editor bound to a live Yjs doc holding blocks, as the doc's editor is. */
function bound(...blocks: object[]) {
    const ydoc = new Y.Doc()
    prosemirrorJSONToYXmlFragment(schema, { type: "doc", content: blocks }, ydoc.getXmlFragment("default"))
    const view = new EditorView(document.createElement("div"), {
        state: EditorState.create({ schema, plugins: [ySyncPlugin(ydoc.getXmlFragment("default"))] }),
    })
    views.push(view)
    return { view, editor: { get state() { return view.state } } as unknown as Editor }
}

const textAt = (view: EditorView, words: string) => {
    let found = { from: -1, to: -1 }
    view.state.doc.descendants((node, pos) => {
        const i = node.isText ? node.text!.indexOf(words) : -1
        if (i >= 0 && found.from < 0) found = { from: pos + i, to: pos + i + words.length }
    })
    return found
}

describe("Comment is on", () => {
    it("the words chosen: a range of the live doc that follows them", () => {
        const { view, editor } = bound(p("b1", "We ship on Thursday."))
        const { from, to } = textAt(view, "ship on Thursday")
        const anchor = anchorOf(editor, from, to)!
        expect(anchor).toMatchObject({ kind: "yrange", quote: "ship on Thursday", block_id: "b1" })
        view.dispatch(view.state.tr.insertText("So: ", 1))
        const r = resolveAnchor(bindingOf(view.state), view.state.doc, anchor)
        expect(r.state === "attached" && view.state.doc.textBetween(r.from, r.to)).toBe("ship on Thursday")
    })

    it("a caret's whole block, by its id (⌘⇧M with nothing selected)", () => {
        const { view, editor } = bound(p("b1", "First line"), p("b2", "Second line"))
        const at = textAt(view, "Second").from + 2
        expect(anchorOf(editor, at, at)).toEqual({ kind: "block", block_id: "b2", quote: "Second line" })
    })

    it("one whole block the block menu stands for, a picture as well as words", () => {
        const { view, editor } = bound(p("b1", "Above"), img("pic-1"), p("b3", "Below"))
        const picAt = view.state.doc.child(0).nodeSize
        // Quoted by its kind, and marked so the kind is never taken for words to find again.
        expect(anchorOf(editor, picAt, picAt + 1)).toEqual({ kind: "block", block_id: "pic-1", quote: "Image", meta: { named: true } })
        // The anchor holds while the doc is edited elsewhere (A8's whole-node range).
        const anchor = anchorOf(editor, picAt, picAt + 1)!
        view.dispatch(view.state.tr.insertText("Still ", 1))
        expect(resolveAnchor(bindingOf(view.state), view.state.doc, anchor).state).toBe("attached")
    })

    it("several whole blocks: from the first one's words to the last one's", () => {
        const { view, editor } = bound(p("b1", "Plan"), p("b2", "Budget"), p("b3", "Dates"))
        const end = view.state.doc.child(0).nodeSize + view.state.doc.child(1).nodeSize
        const anchor = anchorOf(editor, 0, end)!
        expect(anchor).toMatchObject({ kind: "yrange", quote: "Plan\nBudget", block_id: "b1" })
    })

    it("the blocks the block menu names by id: those blocks, never what lies between them", () => {
        const { view, editor } = bound(p("b1", "Plan"), p("b2", "Budget"), p("b3", "Dates"))
        const anchor = anchorOfBlocks(editor, ["b1", "b3"])!
        expect(anchor).toEqual({ kind: "block", block_id: "b1", quote: "Plan\nDates", meta: { block_ids: ["b1", "b3"] } })
        const r = resolveAnchor(bindingOf(view.state), view.state.doc, anchor)
        expect(r.state === "attached" && view.state.doc.textBetween(r.from, r.to)).toBe("Plan")
        // One block is that block; none in the doc is nothing.
        expect(anchorOfBlocks(editor, ["b2"])).toEqual({ kind: "block", block_id: "b2", quote: "Budget" })
        expect(anchorOfBlocks(editor, ["gone"])).toBeNull()
    })

    it("a picture among the blocks, and no more blocks than the anchor has room for", () => {
        const { editor } = bound(p("b1", "Above"), img("pic-1"))
        expect(anchorOfBlocks(editor, ["b1", "pic-1"])).toEqual({ kind: "block", block_id: "b1", quote: "Above\nImage", meta: { block_ids: ["b1", "pic-1"], named: true } })
        const many = Array.from({ length: MAX_BLOCKS + 10 }, (_, i) => p(`block-${String(i).padStart(3, "0")}`, `Line ${i}`))
        const big = bound(...many)
        const anchor = anchorOfBlocks(big.editor, many.map((b) => b.attrs.blockId as string))!
        expect((anchor.meta?.block_ids as string[]).length).toBe(MAX_BLOCKS)
        expect(JSON.stringify(anchor.meta).length).toBeLessThan(4096)
    })

    it("the block it began in, when the editor isn't bound to the live doc yet", () => {
        const view = new EditorView(document.createElement("div"), {
            state: EditorState.create({ schema, doc: schema.nodeFromJSON({ type: "doc", content: [p("b1", "Offline words")] }) }),
        })
        views.push(view)
        const editor = { get state() { return view.state } } as unknown as Editor
        expect(anchorOf(editor, 2, 6)).toEqual({ kind: "block", block_id: "b1", quote: "Offline words" })
    })

    it("nothing, where there is nothing to comment on", () => {
        const view = new EditorView(document.createElement("div"), {
            state: EditorState.create({ schema, doc: schema.nodeFromJSON({ type: "doc", content: [p(null)] }) }),
        })
        views.push(view)
        const editor = { get state() { return view.state } } as unknown as Editor
        expect(anchorOf(editor, 1, 1)).toBeNull()
    })
})

describe("a block's quote", () => {
    it("is its words, or its kind named as a person would", () => {
        expect(blockQuote(schema.nodeFromJSON(p("b", "  Two   spaces ")))).toBe("Two spaces")
        expect(blockQuote(schema.nodeFromJSON(img("i")))).toBe("Image")
        expect(blockQuote(schema.nodeFromJSON(p("e")))).toBe("This block")
    })
})
