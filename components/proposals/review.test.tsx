import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { Editor } from "@tiptap/core"
import StarterKit from "@tiptap/starter-kit"
import { Fragment } from "@tiptap/pm/model"
import { proposeReplacement } from "@/lib/proposals/review"
import type { EditProposal } from "@/lib/proposals/types"
import { Proposals, proposalsOf, showProposal } from "@/components/minimal-tiptap/extensions/proposals"

const decide = vi.fn()
const reopen = vi.fn()
const create = vi.fn()
vi.mock("@/services/proposalService", () => ({
  createProposal: (...a: unknown[]) => create(...a),
  decideProposal: (...a: unknown[]) => decide(...a),
  decideAndApply: async (id: string, input: unknown, apply: () => unknown) => (await decide(id, input), apply()),
  reopenProposal: (...a: unknown[]) => reopen(...a),
  conflictsOf: (e: { response?: { status?: number; data?: { conflicts?: string[] } } }) =>
    e?.response?.status === 409 ? (e.response.data?.conflicts ?? []) : null,
}))

import { ProposalReviewBar } from "./ProposalReviewBar"
import { acceptPersisted, submitProposal } from "./persisted"

let editor: Editor
beforeEach(() => {
  editor = new Editor({ element: document.createElement("div"), extensions: [StarterKit, Proposals] })
  editor.commands.setContent("<p>We ship on Thursday and tell sales.</p>")
  decide.mockReset()
  reopen.mockReset()
})
afterEach(() => {
  cleanup()
  editor.destroy()
})

const end = () => editor.state.doc.child(0).nodeSize - 1
const rewrite = (next: string) => {
  const t = proposeReplacement(editor.state, 1, end(), Fragment.from(editor.schema.text(next)))
  if (!t) throw new Error("no change")
  return t
}

describe("the review bar", () => {
  it("accepts on Enter and discards on Escape, for the whole proposal", async () => {
    render(<ProposalReviewBar editor={editor} label="AI" />)
    act(() => showProposal(editor, rewrite("We ship on Friday and tell everyone.")))
    const bar = screen.getByRole("toolbar", { name: "Review the proposed change" })
    expect(bar.textContent).toContain("2 changes")
    await act(async () => {
      fireEvent.keyDown(bar, { key: "Enter" })
    })
    expect(editor.state.doc.textContent).toBe("We ship on Friday and tell everyone.")
    expect(screen.queryByRole("toolbar")).toBeNull()

    act(() => showProposal(editor, rewrite("We ship later.")))
    await act(async () => {
      fireEvent.keyDown(screen.getByRole("toolbar"), { key: "Escape" })
    })
    expect(editor.state.doc.textContent).toBe("We ship on Friday and tell everyone.")
    expect(Object.keys(proposalsOf(editor.state).active)).toEqual([])
  })

  it("steps through the changes and accepts one of them", async () => {
    render(<ProposalReviewBar editor={editor} />)
    act(() => showProposal(editor, rewrite("We ship on Friday and tell everyone.")))
    const bar = screen.getByRole("toolbar")
    fireEvent.keyDown(bar, { key: "ArrowRight" })
    expect(bar.textContent).toContain("1 of 2")
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Accept change/ }))
    })
    expect(editor.state.doc.textContent).toBe("We ship on Friday and tell sales.")
    expect(screen.getByRole("toolbar").textContent).toContain("1 change")
  })

  it("offers Insert below when the text under every change moved on", async () => {
    render(<ProposalReviewBar editor={editor} />)
    act(() => showProposal(editor, rewrite("We ship on Friday.")))
    act(() => {
      editor.commands.setContent("<p>Rewritten by someone else.</p>")
    })
    const insert = screen.getByRole("button", { name: /Insert below/ })
    await act(async () => {
      fireEvent.click(insert)
    })
    expect(editor.state.doc.textBetween(0, editor.state.doc.content.size, "|")).toBe("Rewritten by someone else.|We ship on Friday.")
  })

  it("names the keys it takes", () => {
    render(<ProposalReviewBar editor={editor} onRetry={() => {}} />)
    act(() => showProposal(editor, rewrite("We ship on Friday.")))
    expect(screen.getByRole("button", { name: /^.*Accept$/ }).getAttribute("aria-keyshortcuts")).toBe("Enter")
    expect(screen.getByRole("button", { name: "Discard" }).getAttribute("aria-keyshortcuts")).toBe("Escape")
    expect(screen.getByRole("button", { name: /Try again/ })).toBeTruthy()
  })
})

describe("a suggestion kept on the server, accepted in the editor", () => {
  // As the tab that made it holds it: with the places it was made at (a doc
  // with Yjs finds them again from their positions: trackOpen).
  const stored = () => {
    const t = rewrite("We ship on Friday and tell everyone.")
    const p = {
      ...t.proposal,
      resource_kind: "doc",
      resource_uuid: "d1",
      author_kind: "person",
      author_uuid: "u1",
      status: "open",
      created_at: "2026-10-12T09:00:00Z",
      base: t.proposal.base,
    } as EditProposal
    showProposal(editor, { ...t, proposal: p })
    return p
  }

  it("claims the decision on the server, then applies it here", async () => {
    const p = stored()
    decide.mockResolvedValue({ ...p, status: "accepted" })
    const r = await acceptPersisted(editor, p.id)
    expect(decide).toHaveBeenCalledWith(p.id, { accept: true, hunk_ids: ["h1", "h2"], apply: "client" })
    expect(r.applied).toEqual(["h1", "h2"])
    expect(editor.state.doc.textContent).toBe("We ship on Friday and tell everyone.")
    expect(reopen).not.toHaveBeenCalled()
  })

  it("applies nothing when the server says the text moved on", async () => {
    const p = stored()
    decide.mockRejectedValue({ response: { status: 409, data: { conflicts: ["h2"] } } })
    const r = await acceptPersisted(editor, p.id)
    expect(r).toEqual({ applied: [], conflicts: ["h2"] })
    expect(editor.state.doc.textContent).toBe("We ship on Thursday and tell sales.")
  })
})

describe("keeping a proposal made here for the doc's people", () => {
  it("sends its base, hash and changes, and goes on showing as the stored one", async () => {
    const t = rewrite("We ship on Friday.")
    showProposal(editor, t)
    create.mockImplementation(async (input: { hunks: unknown[] }) => ({ ...input, id: "srv-1", status: "open" }))
    const stored = await submitProposal(editor, t, "d1", { note: "Friday is firmer" })
    const sent = create.mock.calls[0][0]
    expect(sent.resource_uuid).toBe("d1")
    expect(sent.base_hash).toMatch(/^[0-9a-f]{64}$/)
    expect(sent.hunks).toHaveLength(t.proposal.hunks.length)
    expect(stored.id).toBe("srv-1")
    expect(Object.keys(proposalsOf(editor.state).active)).toEqual(["srv-1"])
  })
})
