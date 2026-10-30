"use client"

/**
 * Reviewing a proposal kept on the server, in an open doc (docs programme A9).
 *
 * Accepting in the editor claims the decision on the server first (apply:
 * "client"), so two reviewers can never apply one suggestion twice, and then
 * applies the changes in this editor as one transaction, so this reviewer's ⌘Z
 * takes them back. If the text moved on in the moment between, the decision is
 * taken back on the server and the changes come back as conflicts.
 */

import type { Editor } from "@tiptap/core"
import { applicable, baseHash, trackOpen, type AcceptResult, type Tracked } from "@/lib/proposals/review"
import type { EditProposal, ProposalAuthorKind } from "@/lib/proposals/types"
import { conflictsOf, createProposal, decideAndApply, decideProposal, reopenProposal } from "@/services/proposalService"
import {
  acceptProposal,
  discardProposal,
  insertProposalBelow,
  markDecided,
  proposalsOf,
  showProposal,
} from "@/components/minimal-tiptap/extensions/proposals"

/**
 * submitProposal keeps a proposal made in this editor on the server, for the
 * doc's people to review: a line typed in suggesting mode (C5), or an AI
 * rewrite saved for later (B9, author "ai"). It goes on showing here as the
 * stored proposal.
 */
export async function submitProposal(
  editor: Editor,
  tracked: Tracked,
  docId: string,
  opts: { note?: string; threadId?: string; authorKind?: ProposalAuthorKind } = {},
): Promise<EditProposal> {
  const p = tracked.proposal
  const base = p.base ?? []
  const stored = await createProposal({
    resource_kind: "doc",
    resource_uuid: docId,
    thread_id: opts.threadId,
    anchor: p.anchor,
    base_hash: await baseHash(base, editor.state),
    base,
    proposed: p.proposed,
    hunks: p.hunks,
    note: opts.note,
    author_kind: opts.authorKind,
  })
  const current = proposalsOf(editor.state).active[p.id]
  if (current) {
    discardProposal(editor, p.id)
    showProposal(editor, { ...current, proposal: stored })
  }
  return stored
}

/** reviewInEditor shows a server-kept proposal in the doc, found where it is now. */
export function reviewInEditor(editor: Editor, proposal: EditProposal) {
  showProposal(editor, trackOpen(editor.state, proposal))
}

export async function acceptPersisted(editor: Editor, id: string, ids?: string[]): Promise<AcceptResult> {
  const tracked = proposalsOf(editor.state).active[id]
  if (!tracked) return { applied: [], conflicts: [] }
  const ready = applicable(editor.state, tracked, ids)
  if (ready.conflicts.length || ready.placed.length === 0) return { applied: [], conflicts: ready.conflicts }
  const chosen = ready.placed.map((p) => p.hunk.id)
  let result: AcceptResult
  try {
    result = await decideAndApply(id, { accept: true, hunk_ids: chosen, apply: "client" }, () => acceptProposal(editor, id, chosen))
  } catch (error) {
    const conflicts = conflictsOf(error)
    if (conflicts) return { applied: [], conflicts }
    throw error
  }
  if (result.conflicts.length) await reopenProposal(id, chosen)
  return result
}

export async function declinePersisted(editor: Editor, id: string, ids?: string[]) {
  const p = await decideProposal(id, { accept: false, hunk_ids: ids })
  const decided = p.hunks.filter((h) => h.decision === "declined").map((h) => h.id)
  markDecided(editor, id, decided, "declined")
}

/** insertPersistedBelow: the target changed, so the suggestion goes in below it. */
export async function insertPersistedBelow(editor: Editor, id: string) {
  await decideAndApply(id, { accept: true, apply: "client", insert_below: true }, () => insertProposalBelow(editor, id))
}
