"use client"

import React, { useState } from "react"
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react"
import { useFetch } from "@/hooks/useFetch"
import { useToast } from "@/hooks/use-toast"
import { apiErrorMessage } from "@/lib/utils/apiError"
import { BarChart3, Loader2 } from "@/lib/icons"
import { EmbedCard } from "@/components/minimal-tiptap/components/embed-card"
import { closePoll, pollUrl, votePoll, type Poll } from "@/services/pollService"
import { PollChoices } from "@/components/poll/PollChoices"
import { shortDateTime } from "@/lib/utils/date/shortDate"
import { useGuestReader } from "@/components/minimal-tiptap/guestReader"

/**
 * A poll inside a message: one click to vote, results for everyone as they
 * change (the server announces each vote and this view revalidates), and the
 * reader's own choice marked. Clicking your choice again takes the vote back.
 */
export function PollView({ node }: NodeViewProps) {
  const id = String(node.attrs.id || "")
  const { toast } = useToast()
  // A guest has no session to read or vote with (a 401 would sign the page out).
  const guest = useGuestReader()
  const { data, isLoading, mutate } = useFetch<{ data: Poll }>(id && !guest ? pollUrl(id) : "", undefined, undefined, { suppressErrorToast: true })
  const [busy, setBusy] = useState<string | null>(null)
  const poll = data?.data

  const act = async (key: string, run: () => Promise<Poll>) => {
    if (busy) return
    setBusy(key)
    try {
      const next = await run()
      await mutate({ data: next }, { revalidate: false })
    } catch (e) {
      toast({ title: "The poll didn't update", description: apiErrorMessage(e, "Try again."), variant: "destructive" })
    } finally {
      setBusy(null)
    }
  }

  return (
    <NodeViewWrapper className="my-2 max-w-md" data-drag-handle={false} contentEditable={false}>
      {/* The question itself is the "Poll:" line the message carries above
          this block, so the card names it only for a screen reader. */}
      <div role="group" aria-label={poll ? `Poll: ${poll.question}` : "Poll"}>
      <EmbedCard kind="poll" icon={BarChart3} title="Poll" meta={poll ? `${poll.voters} ${poll.voters === 1 ? "vote" : "votes"}` : undefined} bodyClassName="px-3.5 pb-3">
        {!poll ? (
          <p className="flex items-center gap-2 text-ui-sm text-ink-3">
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {guest ? "This poll isn't shared through this link." : isLoading ? "Loading the poll…" : "This poll is no longer available."}
          </p>
        ) : (
          <>
            <PollChoices poll={poll} busy={busy} onChoose={(next, optionId) => act(optionId, () => votePoll(poll.id, next))} />
            <div className="mt-2 flex items-center justify-between gap-2 text-meta text-ink-3">
              <span>
                {poll.voters} {poll.voters === 1 ? "person" : "people"} voted
                {poll.multiple ? " · choose any" : ""}
                {poll.closed ? " · closed" : poll.closes_at ? ` · closes ${shortDateTime(new Date(poll.closes_at))}` : ""}
              </span>
              {poll.can_close && !poll.closed && (
                <button
                  type="button"
                  onClick={() => act("close", () => closePoll(poll.id))}
                  disabled={!!busy}
                  className="rounded-md px-1.5 py-0.5 font-medium text-ink-2 hover:bg-hover hover:text-ink"
                >
                  Close poll
                </button>
              )}
            </div>
          </>
        )}
      </EmbedCard>
      </div>
    </NodeViewWrapper>
  )
}
