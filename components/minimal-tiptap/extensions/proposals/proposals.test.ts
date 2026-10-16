import { afterEach, describe, expect, it } from "vitest"
import { Editor } from "@tiptap/core"
import StarterKit from "@tiptap/starter-kit"
import Collaboration from "@tiptap/extension-collaboration"
import { Transform } from "@tiptap/pm/transform"
import { Fragment } from "@tiptap/pm/model"
import * as Y from "yjs"
import { applyPlaced, locate } from "@/lib/proposals/core"
import { proposeReplacement } from "@/lib/proposals/review"
import {
  Proposals,
  acceptProposal,
  discardProposal,
  insertProposalBelow,
  proposalsOf,
  showProposal,
} from "./proposals"

// Two tabs on one doc: two editors, each on its own Yjs copy, the copies
// passing every update to each other as the collaboration server would.

const editors: Editor[] = []
afterEach(() => {
  while (editors.length) editors.pop()?.destroy()
})

function tabs(html: string) {
  const a = new Y.Doc()
  const b = new Y.Doc()
  a.on("update", (u: Uint8Array, origin: unknown) => {
    if (origin !== "wire") Y.applyUpdate(b, u, "wire")
  })
  b.on("update", (u: Uint8Array, origin: unknown) => {
    if (origin !== "wire") Y.applyUpdate(a, u, "wire")
  })
  const make = (doc: Y.Doc) => {
    const e = new Editor({
      element: document.createElement("div"),
      extensions: [StarterKit.configure({ history: false }), Collaboration.configure({ document: doc }), Proposals],
    })
    editors.push(e)
    return e
  }
  const tabA = make(a)
  const tabB = make(b)
  tabA.commands.setContent(html)
  return { a, b, tabA, tabB }
}

const text = (e: Editor) => e.state.doc.textBetween(0, e.state.doc.content.size, "|")

/** The second paragraph's place: before it and after it. */
function paragraph(e: Editor, index: number) {
  let from = 0
  for (let i = 0; i < index; i++) from += e.state.doc.child(i).nodeSize
  return { from, to: from + e.state.doc.child(index).nodeSize }
}

/** A rewrite of paragraph `index` into `next`, shown in tab A. */
function propose(e: Editor, index: number, next: string) {
  const { from, to } = paragraph(e, index)
  const tracked = proposeReplacement(e.state, from + 1, to - 1, Fragment.from(e.schema.text(next)))
  if (!tracked) throw new Error("the rewrite changed nothing")
  showProposal(e, tracked)
  return tracked
}

describe("proposals in the editor", () => {
  it("draws the change in this tab only, and the doc is unchanged until Accept", () => {
    const { a, tabA, tabB } = tabs("<p>Intro.</p><p>We ship on Thursday and tell sales.</p>")
    const before = Y.encodeStateVector(a)
    const t = propose(tabA, 1, "We ship on Friday and tell everyone.")
    expect(t.proposal.hunks).toHaveLength(2)
    expect(tabA.view.dom.querySelectorAll(".oc-proposal-ins").length).toBe(2)
    expect(tabA.view.dom.querySelector(".oc-proposal-del")?.textContent).toBe("Thursday")
    // Ghost text never reaches the other tab, nor the shared doc.
    expect(tabB.view.dom.querySelector(".oc-proposal-ins, .oc-proposal-del")).toBeNull()
    expect(text(tabB)).toBe("Intro.|We ship on Thursday and tell sales.")
    expect(Y.encodeStateVector(a)).toEqual(before)
    // Discard: nothing to undo, nothing sent.
    discardProposal(tabA, t.proposal.id)
    expect(tabA.view.dom.querySelector(".oc-proposal-ins")).toBeNull()
    expect(Y.encodeStateVector(a)).toEqual(before)
    expect(text(tabA)).toBe("Intro.|We ship on Thursday and tell sales.")
  })

  it("accepts two changes of three, and only those, in both tabs", () => {
    const { tabA, tabB } = tabs("<p>The quick brown fox jumps over the dog.</p>")
    const t = propose(tabA, 0, "The slow brown fox leaps over the lazy dog.")
    expect(t.proposal.hunks).toHaveLength(3)
    const r = acceptProposal(tabA, t.proposal.id, ["h1", "h3"])
    expect(r).toEqual({ applied: ["h1", "h3"], conflicts: [] })
    expect(text(tabA)).toBe("The slow brown fox jumps over the lazy dog.")
    expect(text(tabB)).toBe("The slow brown fox jumps over the lazy dog.")
    // The third stays under review, still in the right place.
    const left = proposalsOf(tabA.state).active[t.proposal.id]
    expect(left.proposal.hunks.filter((h) => !h.decision).map((h) => h.id)).toEqual(["h2"])
    expect(tabA.view.dom.querySelector(".oc-proposal-del")?.textContent).toBe("jumps")
  })

  it("lands correctly after the other tab edits above it", () => {
    const { tabA, tabB } = tabs("<p>Intro.</p><p>We ship on Thursday.</p>")
    const t = propose(tabA, 1, "We ship on Friday.")
    tabB.commands.insertContentAt(0, "<p>Inserted above.</p>")
    tabB.commands.insertContentAt(paragraph(tabB, 1).from + 1, "A longer ")
    expect(text(tabA)).toBe("Inserted above.|A longer Intro.|We ship on Thursday.")
    expect(acceptProposal(tabA, t.proposal.id).conflicts).toEqual([])
    expect(text(tabA)).toBe("Inserted above.|A longer Intro.|We ship on Friday.")
    expect(text(tabB)).toBe(text(tabA))
  })

  it("a change whose words were edited in the other tab is a conflict, and nothing applies", () => {
    const { tabA, tabB } = tabs("<p>We ship on Thursday and tell sales.</p>")
    const t = propose(tabA, 0, "We ship on Friday and tell everyone.")
    const at = tabB.state.doc.textContent.indexOf("sales") + 1
    tabB.commands.insertContentAt({ from: at, to: at + 5 }, "marketing")
    const r = acceptProposal(tabA, t.proposal.id)
    expect(r.applied).toEqual([])
    expect(r.conflicts).toEqual(["h2"])
    expect(text(tabA)).toBe("We ship on Thursday and tell marketing.")
    // The change that still fits can still be accepted on its own.
    expect(acceptProposal(tabA, t.proposal.id, ["h1"]).applied).toEqual(["h1"])
    expect(text(tabB)).toBe("We ship on Friday and tell marketing.")
  })

  it("a deleted target falls back to Insert below, where it was", () => {
    const { tabA, tabB } = tabs("<p>Before.</p><p>Target text.</p><p>After.</p>")
    const t = propose(tabA, 1, "Better text.")
    const { from, to } = paragraph(tabB, 1)
    tabB.commands.deleteRange({ from, to })
    expect(text(tabA)).toBe("Before.|After.")
    expect(acceptProposal(tabA, t.proposal.id).conflicts).toEqual(["h1"])
    expect(insertProposalBelow(tabA, t.proposal.id)).toBe(true)
    expect(text(tabA)).toBe("Before.|Better text.|After.")
    expect(text(tabB)).toBe(text(tabA))
  })

  it("one ⌘Z after Accept restores the doc byte for byte", () => {
    const { tabA, tabB } = tabs("<h2>Launch</h2><p>We ship on Thursday and tell sales.</p><p>Done.</p>")
    const before = JSON.stringify(tabA.getJSON())
    tabA.commands.insertContentAt(tabA.state.doc.content.size, "<p>Typed just before.</p>")
    const typed = JSON.stringify(tabA.getJSON())
    const t = propose(tabA, 1, "We ship on Friday and tell everyone, with notes.")
    acceptProposal(tabA, t.proposal.id)
    expect(JSON.stringify(tabA.getJSON())).not.toBe(typed)
    tabA.commands.undo()
    expect(JSON.stringify(tabA.getJSON())).toBe(typed)
    expect(JSON.stringify(tabB.getJSON())).toBe(typed)
    expect(before).not.toBe(typed)
  })

  it("applies in the editor exactly as the server applies", () => {
    const { tabA } = tabs("<h2>Launch</h2><p>We ship on Thursday.</p><p>Tell sales.</p>")
    const doc = tabA.state.doc
    const t = propose(tabA, 1, "We ship on Friday, after the review.")
    // The server: the same core on the same doc, as a plain transform.
    const server = new Transform(doc)
    applyPlaced(server, locate(doc, t.range, t.proposal.base, t.proposal.hunks, null, null).placed)
    acceptProposal(tabA, t.proposal.id)
    expect(tabA.state.doc.toJSON()).toEqual(server.doc.toJSON())
  })
})
