"use client"

/**
 * Kept suggestions in an open doc (docs C5), once per editor: every open one
 * of the doc's (a teammate's, an agent's, an AI rewrite kept for later) drawn
 * where it is now, for whoever may read the doc, and given to the review bar
 * (which shows to people who may edit) with accept, decline and insert below
 * kept on the server. A suggestion made, decided or taken back elsewhere
 * shows or goes at once (the doc's live events). And the composer, when a
 * suggestion is being written here.
 */

import * as React from "react"
import type { Editor } from "@tiptap/core"
import type { SlotProps } from "@/components/docEditor/registry/types"
import { useFetchOnlyOnce } from "@/hooks/useFetch"
import { GetEndpointUrl } from "@/services/endPoints"
import type { UserProfileInterface } from "@/types/user"
import { onDocMeta } from "@/lib/docMeta/bus"
import { trackOpen } from "@/lib/proposals/review"
import type { EditProposal } from "@/lib/proposals/types"
import { useDocProposals, withdrawProposal } from "@/services/proposalService"
import { discardProposal, proposalsOf, showProposal } from "@/components/minimal-tiptap/extensions/proposals"
import { acceptPersisted, declinePersisted, insertPersistedBelow } from "@/components/proposals/persisted"
import { setReviewer } from "@/components/proposals/reviewers"
import { closeSuggestion, rememberEditor, subscribeSuggest, suggestStateOf } from "./suggestMode"
import { isOpen, planSync, reviewerLabel } from "./sync"
import { SuggestComposer } from "./SuggestComposer"
// Suggest edit and Suggestions register as this chunk loads, beside the editor.
import "./contributions"

/** The review bar's handlers for a kept suggestion. */
function reviewerFor(p: EditProposal, selfUUID: string) {
  const own = !!selfUUID && p.author_kind === "person" && p.author_uuid === selfUUID
  return {
    label: reviewerLabel(p, selfUUID),
    // Accepting writes the doc, even while this editor suggests (its write carries DECISION_WRITE).
    accept: acceptPersisted,
    // Its author takes their own back; anyone else who may edit declines it.
    decline: async (editor: Editor, id: string, ids?: string[]) => {
      if (own && !ids) {
        await withdrawProposal(id)
        discardProposal(editor, id)
        return
      }
      await declinePersisted(editor, id, ids)
    },
    insertBelow: insertPersistedBelow,
  }
}

export default function SuggestionsOverlay({ docId, editor }: SlotProps) {
  const { proposals, mutate } = useDocProposals(docId)
  const self = useFetchOnlyOnce<UserProfileInterface>(GetEndpointUrl.SelfProfile)
  const selfUUID = self.data?.data?.user_uuid ?? ""
  const reviewers = React.useRef(new Map<string, () => void>())

  // Every open kept suggestion shown, every decided one gone.
  React.useEffect(() => {
    if (!editor || editor.isDestroyed) return
    const { show, drop } = planSync(proposals, Object.keys(proposalsOf(editor.state).active))
    for (const id of drop) {
      discardProposal(editor, id)
      reviewers.current.get(id)?.()
      reviewers.current.delete(id)
    }
    for (const p of show) showProposal(editor, trackOpen(editor.state, p), { focus: false })
    for (const p of proposals) {
      reviewers.current.get(p.id)?.()
      reviewers.current.delete(p.id)
      if (isOpen(p)) reviewers.current.set(p.id, setReviewer(p.id, reviewerFor(p, selfUUID)))
    }
  }, [editor, proposals, selfUUID])

  // The list beside the doc takes someone to a suggestion in this editor.
  React.useEffect(() => {
    if (!editor || !docId) return
    return rememberEditor(docId, editor)
  }, [docId, editor])

  // The review bar forgets this doc's suggestions when the doc closes.
  React.useEffect(() => {
    const held = reviewers.current
    return () => {
      for (const release of held.values()) release()
      held.clear()
    }
  }, [])

  // A suggestion made, decided or taken back in another tab, or by an agent.
  React.useEffect(() => {
    if (!docId) return
    return onDocMeta(docId, (event) => {
      if (event.kind.startsWith("doc.proposal.")) void mutate()
    })
  }, [docId, mutate])

  const state = React.useSyncExternalStore(
    subscribeSuggest,
    () => suggestStateOf(editor),
    () => suggestStateOf(null),
  )
  if (!editor || !state.open) return null
  return <SuggestComposer key={`${state.open.from}:${state.open.to}`} editor={editor} docId={docId} open={state.open} onClose={() => closeSuggestion(editor)} />
}
