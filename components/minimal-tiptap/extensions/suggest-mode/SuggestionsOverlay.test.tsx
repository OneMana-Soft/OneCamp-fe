import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, render } from "@testing-library/react"
import { Editor } from "@tiptap/core"
import StarterKit from "@tiptap/starter-kit"
import Collaboration from "@tiptap/extension-collaboration"
import * as Y from "yjs"
import { Proposals, proposalsOf } from "@/components/minimal-tiptap/extensions/proposals"
import { proposeReplacement } from "@/lib/proposals/review"
import { emitDocMeta } from "@/lib/docMeta/bus"
import { reviewerFor } from "@/components/proposals/reviewers"
import { actionById } from "@/components/docEditor/registry/registry"
import type { ActionContext } from "@/components/docEditor/registry/types"
import { setFacts } from "@/components/docEditor/chrome/pageFacts"
import { docAbilities, type DocLevel } from "@/lib/docs/abilities"
import { suggestStateOf } from "./suggestMode"
import type { EditProposal } from "@/lib/proposals/types"
import { pinTestClock } from "@/lib/testing/testClock"

pinTestClock()

// Kept suggestions in an open doc: every open one drawn where it is, given to
// the review bar under its author's name, gone once decided; a suggestion
// made or decided elsewhere asks for the list again.

let listed: EditProposal[] = []
const refetch = vi.fn()
vi.mock("@/services/proposalService", () => ({
  useDocProposals: () => ({ proposals: listed, isError: false, isLoading: false, mutate: refetch }),
  withdrawProposal: vi.fn(),
}))
vi.mock("@/hooks/useFetch", () => ({ useFetchOnlyOnce: () => ({ data: { data: { user_uuid: "sam" } } }) }))

const { default: SuggestionsOverlay } = await import("./SuggestionsOverlay")

const editors: Editor[] = []
afterEach(() => {
  cleanup()
  refetch.mockReset()
  listed = []
  while (editors.length) editors.pop()?.destroy()
})

/** An editor on a shared doc, as a doc's page is, so kept proposals are found by their anchors. */
function editorWith(html: string) {
  const e = new Editor({
    element: document.createElement("div"),
    extensions: [StarterKit.configure({ history: false }), Collaboration.configure({ document: new Y.Doc() }), Proposals],
  })
  e.commands.setContent(html)
  editors.push(e)
  return e
}

/** A kept proposal turning the first paragraph's word into another, as the server keeps one. */
function kept(e: Editor, id: string, from: string, to: string, more: Partial<EditProposal> = {}): EditProposal {
  let at = -1
  e.state.doc.descendants((node, pos) => {
    if (at < 0 && node.isText && node.text?.includes(from)) at = pos + node.text.indexOf(from)
  })
  const tracked = proposeReplacement(e.state, at, at + from.length, [{ type: "text", text: to }])!
  return {
    ...tracked.proposal,
    id,
    resource_kind: "doc",
    resource_uuid: "d1",
    author_kind: "person",
    author_uuid: "maya",
    author_name: "Maya Patel",
    status: "open",
    created_at: "2026-10-18T00:00:00Z",
    ...more,
  } as EditProposal
}

describe("kept suggestions in an open doc", () => {
  it("draws every open one, under its author's name, and drops one once it's decided", () => {
    const e = editorWith("<p>Ship the launch on Friday</p>")
    listed = [kept(e, "k1", "Friday", "Monday")]
    const { rerender } = render(<SuggestionsOverlay docId="d1" editor={e} />)
    expect(Object.keys(proposalsOf(e.state).active)).toEqual(["k1"])
    expect(reviewerFor("k1")?.label).toBe("Suggested by Maya Patel")
    expect(e.view.dom.querySelector('[data-by="person"]')).toBeTruthy()

    listed = [{ ...listed[0], status: "declined" }]
    rerender(<SuggestionsOverlay docId="d1" editor={e} />)
    expect(Object.keys(proposalsOf(e.state).active)).toEqual([])
    expect(reviewerFor("k1")).toBeUndefined()
  })

  it("asks for the list again when a suggestion is made or decided elsewhere, and only then", () => {
    const e = editorWith("<p>Ship it</p>")
    render(<SuggestionsOverlay docId="d1" editor={e} />)
    act(() => {
      emitDocMeta({ kind: "doc.renamed", doc_uuid: "d1", at: "", data: { title: "x" } })
      emitDocMeta({ kind: "doc.proposal.created", doc_uuid: "d2", at: "" })
    })
    expect(refetch).not.toHaveBeenCalled()
    act(() => emitDocMeta({ kind: "doc.proposal.accepted", doc_uuid: "d1", at: "", data: { proposal_id: "k1", status: "accepted" } }))
    expect(refetch).toHaveBeenCalledTimes(1)
  })

  it("lets the review bar go of this doc's suggestions when the doc closes", () => {
    const e = editorWith("<p>Ship the launch on Friday</p>")
    listed = [kept(e, "k2", "Friday", "Monday", { author_uuid: "sam" })]
    const { unmount } = render(<SuggestionsOverlay docId="d1" editor={e} />)
    expect(reviewerFor("k2")?.label).toBe("Your suggestion")
    unmount()
    expect(reviewerFor("k2")).toBeUndefined()
  })

  it("brings Suggest edit and Suggestions with its own chunk, off the doc's first load, in both editions", () => {
    for (const gate of [{ ai: true }, { ai: false }]) {
      expect(actionById("text.suggest", gate)?.surfaces).toEqual(["selection", "phoneBar"])
      expect(actionById("doc.suggestions", gate)?.surfaces).toEqual(["more", "palette", "phoneSheet"])
    }
  })

  // A phone draws no doc header, so no Editing/Suggesting switch: its sheet offers the mode.
  it("offers Suggesting from a phone's sheet and the palette, to whoever may edit, named by the mode it's in", () => {
    for (const gate of [{ ai: true }, { ai: false }]) expect(actionById("doc.suggesting", gate)?.surfaces).toEqual(["phoneSheet", "palette"])
    const action = actionById("doc.suggesting", { ai: false })!
    const editor = editorWith("<p>Ship it</p>")
    const ctx = (level: DocLevel, docId = "d-modes"): ActionContext => ({ docId, editor, canEdit: level === "edit" || level === "full", abilities: docAbilities(level), bus: {} as ActionContext["bus"] })
    expect(action.isVisible!(ctx("comment"))).toBe(false)
    expect(action.isVisible!(ctx("edit"))).toBe(true)
    setFacts("d-locked", { lock: "hard" })
    expect(action.isVisible!(ctx("edit", "d-locked"))).toBe(false)
    expect(action.labelFor!(ctx("edit"))).toBe("Suggest changes")
    void action.run(ctx("edit"))
    expect(suggestStateOf(editor).suggesting).toBe(true)
    expect(action.labelFor!(ctx("edit"))).toBe("Stop suggesting")
    void action.run(ctx("edit"))
    expect(suggestStateOf(editor).suggesting).toBe(false)
  })
})
