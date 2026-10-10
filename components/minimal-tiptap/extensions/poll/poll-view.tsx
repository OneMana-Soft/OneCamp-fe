"use client"

import React, { useState } from "react"
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react"
import { useFetch } from "@/hooks/useFetch"
import { useToast } from "@/hooks/use-toast"
import { apiErrorMessage } from "@/lib/utils/apiError"
import { cn } from "@/lib/utils/helpers/cn"
import { Check, Loader2 } from "@/lib/icons"
import { closePoll, nextChoice, pollUrl, shares, votePoll, type Poll } from "@/services/pollService"

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
      {/* not-prose: the message body's typography would give the options list
          bullets and margins. The question itself is the "Poll:" line the
          message carries above this block, so it is named here, not repeated. */}
      <div className="not-prose rounded-xl border border-border bg-card p-3" role="group" aria-label={poll ? `Poll: ${poll.question}` : "Poll"}>
        {!poll ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {isLoading ? "Loading the poll…" : "This poll is no longer available."}
          </p>
        ) : (
          <>
            <ul className="m-0 list-none space-y-1.5 p-0">
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
                        "relative flex w-full items-center justify-between gap-3 overflow-hidden rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70 disabled:cursor-default",
                        mine ? "border-primary/60" : "border-border hover:border-foreground/30",
                      )}
                    >
                      <span
                        aria-hidden
                        className={cn("absolute inset-y-0 left-0 transition-[width] duration-300 motion-reduce:transition-none", mine ? "bg-primary/15" : "bg-muted")}
                        style={{ width: `${pct}%` }}
                      />
                      <span className="relative flex min-w-0 items-center gap-2">
                        {busy === o.id ? (
                          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
                        ) : mine ? (
                          <Check className="h-3.5 w-3.5 shrink-0 text-primary" />
                        ) : null}
                        <span className="truncate">{o.text}</span>
                      </span>
                      <span className="relative shrink-0 text-xs tabular-nums text-muted-foreground">
                        {o.votes} · {pct}%
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
            <div className="mt-2 flex items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>
                {poll.voters} {poll.voters === 1 ? "person" : "people"} voted
                {poll.multiple ? " · choose any" : ""}
                {poll.closed ? " · closed" : poll.closes_at ? ` · closes ${new Date(poll.closes_at).toLocaleString()}` : ""}
              </span>
              {poll.can_close && !poll.closed && (
                <button
                  type="button"
                  onClick={() => act("close", () => closePoll(poll.id))}
                  disabled={!!busy}
                  className="underline underline-offset-2 hover:text-foreground"
                >
                  Close poll
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </NodeViewWrapper>
  )
}
