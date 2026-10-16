import { afterEach, describe, expect, it } from "vitest"
import { Editor } from "@tiptap/core"
import StarterKit from "@tiptap/starter-kit"
import { Proposals, acceptProposal, proposalsOf } from "@/components/minimal-tiptap/extensions/proposals"
import { endAiRewrite, proposeAiRewrite, updateAiRewrite } from "./inlineAiProposal"

const editors: Editor[] = []
afterEach(() => {
  while (editors.length) editors.pop()?.destroy()
})

function editorWith(html: string) {
  const e = new Editor({ element: document.createElement("div"), extensions: [StarterKit, Proposals] })
  e.commands.setContent(html)
  editors.push(e)
  return e
}

describe("an inline AI rewrite", () => {
  it("is a proposal over the selection, diffed again as the answer streams in", () => {
    const e = editorWith("<p>Intro.</p><p>We will ship the release on Thursday, probably.</p>")
    const start = e.state.doc.child(0).nodeSize + 1
    const from = start + "We will ship the release ".length
    const to = start + "We will ship the release on Thursday, probably".length
    const id = proposeAiRewrite(e, from, to, { text: "on" })
    expect(id).not.toBeNull()
    expect(e.state.doc.textContent).toBe("Intro.We will ship the release on Thursday, probably.")
    expect(updateAiRewrite(e, id!, { text: "on Friday" })).toBe(true)
    const t = proposalsOf(e.state).active[id!]
    expect(t.proposal.proposed.map((b) => b.content?.map((c) => c.text).join(""))).toEqual(["We will ship the release on Friday."])
    acceptProposal(e, id!)
    expect(e.state.doc.textBetween(0, e.state.doc.content.size, "|")).toBe("Intro.|We will ship the release on Friday.")
    endAiRewrite(e, id!)
  })

  it("takes HTML with blocks, and Discard leaves the doc as it was", () => {
    const e = editorWith("<p>Notes go here.</p>")
    const before = JSON.stringify(e.getJSON())
    const id = proposeAiRewrite(e, 1, e.state.doc.child(0).nodeSize - 1, { html: "<p>First point.</p><ul><li><p>A list</p></li></ul>" })
    expect(e.view.dom.querySelector(".oc-proposal-ins-block")).not.toBeNull()
    endAiRewrite(e, id!)
    expect(JSON.stringify(e.getJSON())).toBe(before)
    expect(proposalsOf(e.state).active).toEqual({})
  })
})
