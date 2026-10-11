"use client"

// AgentActivityFeed — the "show your work" timeline for the agent builder.
// A calm, chronological feed of what agents actually did (which agent, when,
// what it produced, success/failure, tools used), scoped server-side to the
// agents the viewer can see. Reads the existing run history; self-hides when
// there's nothing yet.

import React, { useEffect, useState } from "react"
import { Check, Loader2, RefreshCw, X } from "@/lib/icons"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils/helpers/cn"
import { formatTimeForReplyCount } from "@/lib/utils/date/formatTimeForReplyCount"
import { listAgentActivity, type AgentActivityItem } from "@/services/agentService"
import { AgentAvatar } from "@/components/ui/graphics/PrincipalAvatar"

// The dot's word, for anyone who can't tell the colours apart or can't see
// them: the dot was colour alone, with only a hover title.
const STATUS_WORD: Record<string, string> = {
  succeeded: "Finished",
  failed: "Failed",
  running: "Running",
  stopped: "Stopped",
}

const STATUS_INK: Record<string, string> = {
  succeeded: "text-success-ink",
  failed: "text-danger-ink",
  running: "text-muted-foreground",
  stopped: "text-muted-foreground",
}

/** The state as a glyph beside its word: never colour alone. */
function StatusGlyph({ status }: { status: string }) {
  if (status === "succeeded") return <Check aria-hidden="true" className="size-3" />
  if (status === "failed") return <X aria-hidden="true" className="size-3" />
  if (status === "running") return <Loader2 aria-hidden="true" className="size-3 animate-spin" />
  return <span aria-hidden="true" className="size-1.5 rounded-full bg-ink-3" />
}

const TRIGGER_LABEL: Record<string, string> = {
  manual: "Manual",
  mention: "Mention",
  schedule: "Scheduled",
  test: "Test",
}

function triggerLabel(src: string): string {
  if (!src) return "Run"
  if (TRIGGER_LABEL[src]) return TRIGGER_LABEL[src]
  if (src.startsWith("event")) return "Event"
  return src
}

const AgentActivityFeed: React.FC = () => {
  const [items, setItems] = useState<AgentActivityItem[] | null>(null)
  const [loading, setLoading] = useState(true)
  // A failed read used to set an empty list, which hides the panel: as if no
  // agent had ever run.
  const [failed, setFailed] = useState(false)

  const load = React.useCallback(() => {
    setLoading(true)
    listAgentActivity(40)
      .then((next) => {
        setItems(next)
        setFailed(false)
      })
      .catch(() => setFailed(true))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  // First load: render nothing (no flash). After load: hide entirely when the
  // workspace has no agent runs yet, so the panel never shows an empty shell.
  if (failed && items === null) {
    return (
      <div data-settings-card="" className="set-card mb-4 flex flex-wrap items-center gap-2 px-4 py-3">
        <p role="alert" className="text-sm text-muted-foreground">Couldn&apos;t load recent agent activity.</p>
        <Button variant="outline" size="sm" className="h-8" onClick={load} disabled={loading}>
          Try again
        </Button>
      </div>
    )
  }
  if (items === null) return null
  if (items.length === 0) return null

  // The audit log's row anatomy (design v3, admin §A23): the time, the
  // agent's square, then the sentence with its state as a glyph and a word,
  // and the tools as neutral chips. It was a tinted tile over dots that said
  // the state by colour alone.
  return (
    <section aria-labelledby="agent-activity-title" className="mb-4">
      <div className="mb-3 flex items-center gap-2">
        <h3 id="agent-activity-title" className="text-heading text-foreground">
          Recent agent activity
        </h3>
        <Button
          variant="ghost"
          size="icon"
          className="ml-auto h-7 w-7 text-muted-foreground"
          onClick={load}
          disabled={loading}
          title="Refresh"
          aria-label="Refresh agent activity"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
      </div>
      <ul data-settings-card="" className="set-card ai-rows max-h-[22rem] overflow-y-auto custom-scrollbar">
        {items.map((it) => (
          <li key={it.run_id} data-activity-row="" className="ai-row">
            <span className="ai-row-time text-2xs tabular-nums text-ink-3">{formatTimeForReplyCount(it.started_at)}</span>
            <span className="ai-row-actor" aria-hidden="true">
              <AgentAvatar />
            </span>
            <span className="min-w-0">
              <span className="flex flex-wrap items-center gap-x-1.5">
                <span className="truncate text-sm font-medium text-foreground">{it.agent_name}</span>
                <span data-run-status={it.status} className={cn("inline-flex items-center gap-1 text-2xs font-medium", STATUS_INK[it.status] || "text-muted-foreground")}>
                  <StatusGlyph status={it.status} />
                  {STATUS_WORD[it.status] || it.status}
                </span>
                <span className="text-2xs text-muted-foreground">· {triggerLabel(it.trigger_source)}</span>
              </span>
              <span className="block text-sm leading-snug text-foreground/80">{it.error ? it.error : it.summary}</span>
              {it.tools_used && it.tools_used.length > 0 && (
                <span className="mt-1 flex flex-wrap gap-1">
                  {it.tools_used.slice(0, 6).map((t) => (
                    <span key={t} className="ai-chip font-mono">
                      {t.replace(/_/g, " ")}
                    </span>
                  ))}
                  {it.action_count > 0 && (
                    <span className="inline-flex items-center text-2xs text-muted-foreground">
                      {it.action_count} action{it.action_count === 1 ? "" : "s"}
                    </span>
                  )}
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}

export default AgentActivityFeed
