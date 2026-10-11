"use client"

import React, { useState } from "react"
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react"
import { useFetch } from "@/hooks/useFetch"
import { useToast } from "@/hooks/use-toast"
import { apiErrorMessage } from "@/lib/utils/apiError"
import { cn } from "@/lib/utils/helpers/cn"
import { BarChart3, Check, Loader2 } from "@/lib/icons"
import { EmbedCard } from "@/components/minimal-tiptap/components/embed-card"
import { closePoll, nextChoice, pollUrl, shares, votePoll, type Poll } from "@/services/pollService"
import { shortDateTime } from "@/lib/utils/date/shortDate"

/**
 * A poll inside a message: one click to vote, results for everyone as they
 * change (the server announces each vote and this view revalidates), and the
 * reader's own choice marked. Clicking your choice again takes the vote back.
 */
export function PollView({ node }: NodeViewProps) {
  const id = String(node.attrs.id || "")
  const { toast } = useToast()
  const { data, isLoading, mutate } = useFetch<{ data: Poll }>(id ? pollUrl(id) : "", undefined, undefined, { suppressErrorToast: true })
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
            {isLoading ? "Loading the poll…" : "This poll is no longer available."}
          </p>
        ) : (
          <>
            <ul className="m-0 list-none space-y-1 p-0">
              {poll.options.map((o, i) => {
                const pct = shares(poll.options)[i]
                const mine = poll.mine.includes(o.id)
                return (
                  <li key={o.id} className="m-0 p-0">
                    <button
                      type="button"
                      disabled={poll.closed || !!busy}
                      aria-pressed={mine}
                      onClick={() => act(o.id, () => votePoll(poll.id, nextChoice(poll, o.id)))}
                      className={cn(
                        "relative flex h-9 w-full items-center justify-between gap-3 overflow-hidden rounded-lg px-3 text-left text-ui text-ink transition-colors",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-default",
                        mine ? "text-brand-text" : "hover:bg-hover",
                      )}
                    >
                      <span
                        aria-hidden
                        // The fill grows by scaling, never by animating its width.
                        className={cn("absolute inset-0 origin-left transition-transform duration-[320ms] ease-[var(--ease-out)] motion-reduce:transition-none", mine ? "bg-brand-muted" : "bg-press")}
                        style={{ transform: `scaleX(${pct / 100})` }}
                      />
                      <span className="relative flex min-w-0 items-center gap-2">
                        {busy === o.id ? (
                          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
                        ) : mine ? (
                          <Check className="h-3.5 w-3.5 shrink-0 text-brand-text" />
                        ) : null}
                        <span className="truncate">{o.text}</span>
                      </span>
                      <span className="relative shrink-0 text-meta tabular-nums text-ink-3">
                        {o.votes} · {pct}%
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
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
