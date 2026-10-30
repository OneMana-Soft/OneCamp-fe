import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { Editor } from "@tiptap/core"
import StarterKit from "@tiptap/starter-kit"
import { Fragment } from "@tiptap/pm/model"
import { proposeReplacement } from "@/lib/proposals/review"
import type { EditProposal } from "@/lib/proposals/types"
import { Proposals, discardProposal, proposalsOf, showProposal } from "@/components/minimal-tiptap/extensions/proposals"
import { pinTestClock } from "@/lib/testing/testClock"

const post = vi.fn()
const learned = vi.fn()
vi.mock("@/lib/axiosInstance", async () => (await import("@/lib/testing/axiosInstance")).axiosInstanceModule({ default: { post: (...a: unknown[]) => post(...a) } }))
// The doc's list learns of every write as it is answered (I18).
vi.mock("@/lib/swrMutate", () => ({ patchCached: (...a: unknown[]) => learned(...a) }))

import { acceptPersisted, insertPersistedBelow } from "./persisted"

pinTestClock()

let editor: Editor
beforeEach(() => {
  editor = new Editor({ element: document.createElement("div"), extensions: [StarterKit, Proposals] })
  editor.commands.setContent("<p>We ship on Thursday.</p>")
  post.mockReset()
  learned.mockReset()
})
afterEach(() => editor.destroy())

// A suggestion kept on the server, drawn in this editor.
function kept(): EditProposal {
  const end = editor.state.doc.child(0).nodeSize - 1
  const t = proposeReplacement(editor.state, 1, end, Fragment.from(editor.schema.text("We ship on Friday.")))
  if (!t) throw new Error("no change")
  const p = { ...t.proposal, resource_kind: "doc", resource_uuid: "d1", author_kind: "person", author_uuid: "u1", status: "open", created_at: "2026-10-24T09:00:00Z" } as EditProposal
  showProposal(editor, { ...t, proposal: p })
  // As the doc's sync does (SuggestionsOverlay): a decided suggestion it still draws, it lets go of.
  learned.mockImplementation(() => discardProposal(editor, p.id))
  return p
}

describe("a kept suggestion decided here", () => {
  it("is written before the doc's list learns it was accepted, which would let go of it first", async () => {
    const p = kept()
    post.mockResolvedValue({ data: { data: { ...p, status: "accepted" } } })
    const r = await acceptPersisted(editor, p.id)
    expect(r.applied.length).toBeGreaterThan(0)
    expect(editor.state.doc.textContent).toBe("We ship on Friday.")
    expect(learned).toHaveBeenCalledTimes(1)
    expect(Object.keys(proposalsOf(editor.state).active)).toEqual([])
  })

  it("goes in below before the doc's list learns of it", async () => {
    const p = kept()
    post.mockResolvedValue({ data: { data: { ...p, status: "accepted" } } })
    await insertPersistedBelow(editor, p.id)
    expect(editor.state.doc.textContent).toContain("We ship on Thursday.")
    expect(editor.state.doc.textContent).toContain("We ship on Friday.")
    expect(learned).toHaveBeenCalledTimes(1)
  })
})
