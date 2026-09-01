"use client"

// AgentActivityFeed — the "show your work" timeline for the agent builder.
// A calm, chronological feed of what agents actually did (which agent, when,
// what it produced, success/failure, tools used), scoped server-side to the
// agents the viewer can see. Reads the existing run history; self-hides when
// there's nothing yet.

import React, { useEffect, useState } from "react"
import { Sparkles, Loader2, RefreshCw } from "@/lib/icons"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils/helpers/cn"
import { formatTimeForReplyCount } from "@/lib/utils/date/formatTimeForReplyCount"
import { listAgentActivity, type AgentActivityItem } from "@/services/agentService"

const STATUS_DOT: Record<string, string> = {
  succeeded: "bg-emerald-500",
  failed: "bg-red-500",
  running: "bg-amber-500",
  stopped: "bg-muted-foreground/50",
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

  const load = React.useCallback(() => {
    setLoading(true)
    listAgentActivity(40)
      .then(setItems)
      .catch(() => setItems([]))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  // First load: render nothing (no flash). After load: hide entirely when the
  // workspace has no agent runs yet, so the panel never shows an empty shell.
  if (items === null) return null
  if (items.length === 0) return null

  return (
    <div className="mb-4 rounded-xl border border-border/60 bg-card/40 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border/50">
        <div className="bg-primary/10 p-1 rounded-md">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
        </div>
        <h3 className="text-sm font-semibold tracking-tight">Recent agent activity</h3>
        <Button
          variant="ghost"
          size="icon"
          className="ml-auto h-7 w-7 text-muted-foreground"
          onClick={load}
          disabled={loading}
          title="Refresh"
          aria-label="Refresh agent activity"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
        </Button>
      </div>

      <ul className="divide-y divide-border/40 max-h-[22rem] overflow-y-auto custom-scrollbar">
        {items.map((it) => (
          <li key={it.run_id} className="flex items-start gap-2.5 px-4 py-2.5">
            <span
              className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", STATUS_DOT[it.status] || "bg-muted-foreground/40")}
              title={it.status}
            />
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-baseline gap-x-1.5">
                <span className="text-sm font-medium truncate">{it.agent_name}</span>
                <span className="text-2xs text-muted-foreground">· {triggerLabel(it.trigger_source)}</span>
                <span className="text-2xs text-muted-foreground/70">
                  · {formatTimeForReplyCount(it.started_at)}
                </span>
              </span>
              <span className="block text-sm leading-snug text-foreground/80">
                {it.error ? it.error : it.summary}
              </span>
              {it.tools_used && it.tools_used.length > 0 && (
                <span className="mt-1 flex flex-wrap gap-1">
                  {it.tools_used.slice(0, 6).map((t) => (
                    <span
                      key={t}
                      className="inline-flex items-center rounded-md bg-muted px-1.5 py-0.5 text-3xs text-muted-foreground"
                    >
                      {t.replace(/_/g, " ")}
                    </span>
                  ))}
                  {it.action_count > 0 && (
                    <span className="inline-flex items-center text-3xs text-muted-foreground/70">
                      {it.action_count} action{it.action_count === 1 ? "" : "s"}
                    </span>
                  )}
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default AgentActivityFeed
