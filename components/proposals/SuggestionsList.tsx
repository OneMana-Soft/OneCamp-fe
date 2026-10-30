"use client"

/**
 * Every suggestion on a doc, beside it (docs C5): who suggested what, in a
 * few words, open ones first. Review takes the doc to it, where the review
 * bar decides it change by change; someone who may decide accepts or
 * declines all of one from here (applied on the server, through the live
 * doc), and its author takes their own back. A decision made elsewhere shows
 * here at once (the doc's live events, through the list's own read).
 */

import * as React from "react"
import { Button } from "@/components/ui/button"
import { ErrorState } from "@/components/ui/error-state"
import { useFetchOnlyOnce } from "@/hooks/useFetch"
import { GetEndpointUrl } from "@/services/endPoints"
import type { UserProfileInterface } from "@/types/user"
import { docLevelOf, maySuggestDecide } from "@/lib/docs/abilities"
import { apiErrorMessage } from "@/lib/utils/apiError"
import { relativeTime } from "@/lib/utils/relativeTime"
import { cn } from "@/lib/utils/helpers/cn"
import { onDocMeta } from "@/lib/docMeta/bus"
import type { EditProposal } from "@/lib/proposals/types"
import { decideProposal, useDocProposals, withdrawProposal } from "@/services/proposalService"
import { useDoc } from "@/components/docEditor/chrome/useDoc"
import { usePageFacts } from "@/components/docEditor/chrome/pageFacts"
import { focusProposal, proposalsOf } from "@/components/minimal-tiptap/extensions/proposals"
import { editorOf } from "@/components/minimal-tiptap/extensions/suggest-mode/suggestMode"
import { changeSummary, isOpen, reviewerLabel } from "@/components/minimal-tiptap/extensions/suggest-mode/sync"

const DECIDED: Record<string, string> = { accepted: "Accepted", declined: "Declined", withdrawn: "Taken back", stale: "Out of date" }

type Choice = "accept" | "decline" | "withdraw"

export default function SuggestionsList({ docId }: { docId: string }) {
  const { proposals, isError, isLoading, mutate } = useDocProposals(docId)
  const self = useFetchOnlyOnce<UserProfileInterface>(GetEndpointUrl.SelfProfile)
  const selfUUID = self.data?.data?.user_uuid ?? ""
  const doc = useDoc(docId)
  const facts = usePageFacts(docId)
  const canDecide = maySuggestDecide(docLevelOf(doc), facts.lock || doc?.doc_lock_level)
  // What each suggestion's row is doing while its answer comes: that choice
  // says busy, the row's other choice waits, and the other rows go on.
  const [doing, setDoing] = React.useState<Record<string, Choice>>({})
  const [errors, setErrors] = React.useState<Record<string, string>>({})

  React.useEffect(() => onDocMeta(docId, (e) => {
    if (e.kind.startsWith("doc.proposal.")) void mutate()
  }), [docId, mutate])

  const act = async (id: string, choice: Choice, fn: () => Promise<unknown>) => {
    if (doing[id]) return
    setDoing((d) => ({ ...d, [id]: choice }))
    setErrors((e) => ({ ...e, [id]: "" }))
    try {
      await fn()
    } catch (error) {
      setErrors((e) => ({ ...e, [id]: apiErrorMessage(error, "That didn't go through. Try again in a moment.") }))
    } finally {
      setDoing((d) => {
        const next = { ...d }
        delete next[id]
        return next
      })
    }
  }

  const review = (p: EditProposal) => {
    const editor = editorOf(docId)
    if (!editor || !proposalsOf(editor.state).active[p.id]) return
    focusProposal(editor, p.id)
    const range = proposalsOf(editor.state).active[p.id]?.range
    if (range) {
      try {
        editor.view.domAtPos(range.from).node.parentElement?.scrollIntoView({ block: "center", behavior: "smooth" })
      } catch {
        // Not drawn yet: the review bar is on it all the same.
      }
    }
  }

  if (isError) return <ErrorState subject="this doc's suggestions" onRetry={() => void mutate()} />
  if (isLoading && proposals.length === 0) return <p className="px-4 py-6 text-ui text-ink-3">Loading suggestions…</p>
  if (proposals.length === 0) {
    return (
      <div data-suggestions-empty="" className="px-4 py-6">
        <p className="text-ui font-medium text-foreground">No suggestions yet</p>
        <p className="mt-1 text-meta text-ink-3 text-pretty">Choose some words in the doc, then Suggest edit, to suggest a change for its people to accept or decline.</p>
      </div>
    )
  }

  return (
    <ul data-suggestions-list="" className="divide-y divide-line">
      {proposals.map((p) => {
        const open = isOpen(p)
        const own = !!selfUUID && p.author_kind === "person" && p.author_uuid === selfUUID
        const now = doing[p.id]
        return (
          <li key={p.id} data-suggestion={p.id} className={cn("px-4 py-3", !open && "opacity-70")}>
            <div className="flex items-baseline gap-2">
              <span className="min-w-0 flex-1 truncate text-meta font-medium text-ink-2">{reviewerLabel(p, selfUUID)}</span>
              <span className="shrink-0 text-meta text-ink-3 tabular-nums">{relativeTime(p.created_at)}</span>
            </div>
            <p className="mt-1 text-ui text-foreground text-pretty">{changeSummary(p)}</p>
            {p.note ? <p className="mt-1 text-meta text-ink-2">“{p.note}”</p> : null}
            {!open ? (
              <p className="mt-1 text-meta text-ink-3">{DECIDED[p.status] ?? ""}</p>
            ) : (
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <Button type="button" variant="secondary" size="xs" onClick={() => review(p)} disabled={!editorOf(docId)}>
                  Review
                </Button>
                {canDecide ? (
                  <>
                    <Button
                      type="button"
                      size="xs"
                      busy={now === "accept"}
                      disabled={!!now && now !== "accept"}
                      onClick={() => void act(p.id, "accept", () => decideProposal(p.id, { accept: true, apply: "server" }))}
                    >
                      Accept
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      busy={now === "decline"}
                      disabled={!!now && now !== "decline"}
                      onClick={() => void act(p.id, "decline", () => decideProposal(p.id, { accept: false }))}
                    >
                      Decline
                    </Button>
                  </>
                ) : null}
                {own && !canDecide ? (
                  <Button type="button" variant="ghost" size="xs" busy={now === "withdraw"} onClick={() => void act(p.id, "withdraw", () => withdrawProposal(p.id))}>
                    Take back
                  </Button>
                ) : null}
              </div>
            )}
            {errors[p.id] ? (
              <p role="alert" className="mt-1 text-meta text-danger-ink">
                {errors[p.id]}
              </p>
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}
