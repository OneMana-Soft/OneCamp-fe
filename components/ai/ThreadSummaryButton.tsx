"use client"

/**
 * ThreadSummaryButton — an inline "TL;DR" for a long thread.
 *
 * When a post/message has accumulated many replies, reading the whole thread
 * to catch up is exactly the friction OneCamp's AI layer removes. This is a
 * calm, on-demand affordance (never auto-runs, never adds noise): click to
 * get a 1-3 line recap of the thread, rendered in place.
 *
 * Reuses the existing doc-AI `summarize` action (POST /ai/doc/complete) — the
 * parent passes the already-assembled thread text via `getText()`, so this
 * component owns no data fetching and adds zero new backend surface. It
 * self-hides when AI can't produce a summary and degrades gracefully on
 * error with an inline retry.
 */

import React, { useCallback, useState } from "react"
import { Button } from "@/components/ui/button"
import { useToast } from "@/hooks/use-toast"
import { useDocAI } from "@/services/aiService"
import { removeHtmlTags } from "@/lib/utils/removeHtmlTags"
import { Sparkles, Loader2, X } from "@/lib/icons"

interface ThreadSummaryButtonProps {
  /** Returns the full thread text to summarize (root message + replies). */
  getText: () => string
  className?: string
}

export const ThreadSummaryButton: React.FC<ThreadSummaryButtonProps> = ({ getText, className }) => {
  const { toast } = useToast()
  const { complete } = useDocAI()
  const [busy, setBusy] = useState(false)
  const [summary, setSummary] = useState<string | null>(null)

  const run = useCallback(async () => {
    const text = removeHtmlTags(getText() || "").trim()
    if (!text) {
      toast({ title: "Nothing to summarize yet" })
      return
    }
    setBusy(true)
    try {
      const res = await complete("summarize", text)
      const out = (res?.result || "").trim()
      if (!out) {
        toast({ title: "AI couldn't summarize this thread", variant: "destructive" })
        return
      }
      setSummary(out)
    } catch {
      toast({ title: "Summary failed", variant: "destructive" })
    } finally {
      setBusy(false)
    }
  }, [complete, getText, toast])

  if (summary) {
    return (
      <div className={"rounded-lg border border-border/60 bg-muted/40 px-3 py-2.5 " + (className || "")}>
        <div className="flex items-center gap-1.5 mb-1">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Thread summary
          </span>
          <button
            type="button"
            onClick={() => setSummary(null)}
            aria-label="Dismiss summary"
            className="ml-auto text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        <p className="text-sm leading-relaxed text-foreground/90 whitespace-pre-wrap break-words">{summary}</p>
      </div>
    )
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={run}
      disabled={busy}
      className={"h-7 gap-1.5 px-2 text-xs text-muted-foreground hover:text-primary " + (className || "")}
    >
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
      {busy ? "Summarizing…" : "Summarize thread"}
    </Button>
  )
}
