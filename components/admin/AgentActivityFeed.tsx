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
import { Tile } from "@/components/ui/graphics/Tile"
import { ADMIN_GROUP_HUE } from "@/components/admin/adminHues"

// The dot's word, for anyone who can't tell the colours apart or can't see
// them: the dot was colour alone, with only a hover title.
const STATUS_WORD: Record<string, string> = {
  succeeded: "Finished",
  failed: "Failed",
  running: "Running",
  stopped: "Stopped",
}

const STATUS_DOT: Record<string, string> = {
  succeeded: "bg-success",
  failed: "bg-destructive",
  running: "bg-warning",
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
      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-border/60 px-4 py-3">
        <p role="alert" className="text-sm text-muted-foreground">Couldn&apos;t load recent agent activity.</p>
        <Button variant="outline" size="sm" className="h-8" onClick={load} disabled={loading}>
          Try again
        </Button>
      </div>
    )
  }
  if (items === null) return null
  if (items.length === 0) return null

  return (
    <div className="mb-4 rounded-xl border border-border/60 bg-card/40 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border/50">
        {/* On the AI and automation group's tile; it was an orange one. */}
        <Tile hue={ADMIN_GROUP_HUE.ai} size="sm">
          <Sparkles />
        </Tile>
        <h3 className="text-sm font-semibold">Recent agent activity</h3>
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
              aria-hidden="true"
              className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", STATUS_DOT[it.status] || "bg-muted-foreground/40")}
              title={STATUS_WORD[it.status] || it.status}
            />
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-baseline gap-x-1.5">
                <span className="text-sm font-medium truncate">{it.agent_name}</span>
                <span className="sr-only">{STATUS_WORD[it.status] || it.status}</span>
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
                      className="inline-flex items-center rounded-md bg-muted px-1.5 py-0.5 text-2xs text-muted-foreground"
                    >
                      {t.replace(/_/g, " ")}
                    </span>
                  ))}
                  {it.action_count > 0 && (
                    <span className="inline-flex items-center text-2xs text-muted-foreground/70">
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
