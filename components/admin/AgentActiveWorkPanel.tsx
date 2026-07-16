"use client"

// AgentActiveWorkPanel — the live "what are my AI teammates doing right now"
// view: the open durable jobs an agent is handling in the background, bucketed
// into blocked (waiting on you), working, and queued. It's the observability
// loop for background/async runs — a teammate that's stuck waiting on your input
// is visible here instead of only in the one thread it posted in.
//
// Calm and self-hiding: renders nothing until loaded, and nothing when there's
// no active work. Polls on a gentle interval since the state is live, plus a
// manual refresh. Scoped server-side to the agents the viewer can see.

import React, { useEffect, useState } from "react"
import { Loader2, RefreshCw, Clock, AlertTriangle } from "@/lib/icons"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils/helpers/cn"
import { formatTimeForReplyCount } from "@/lib/utils/date/formatTimeForReplyCount"
import { listActiveAgentWork, type ActiveWorkItem, type ActiveWorkState } from "@/services/agentService"

// Poll interval for live work state. Gentle so it never hammers the API; the
// evolving in-thread status comment is the real-time surface, this is the
// at-a-glance roll-up.
const POLL_MS = 15000

// State presentation: blocked draws attention (it needs the viewer), working is
// an active spinner, queued is a calm clock. Ordered so blocked sorts first.
const STATE_ORDER: Record<ActiveWorkState, number> = { blocked: 0, working: 1, queued: 2 }

const STATE_LABEL: Record<ActiveWorkState, string> = {
  blocked: "Waiting on you",
  working: "Working",
  queued: "Queued",
}

const StateIcon: React.FC<{ state: ActiveWorkState }> = ({ state }) => {
  if (state === "working") return <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-500" />
  if (state === "blocked") return <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
  return <Clock className="h-3.5 w-3.5 text-muted-foreground/60" />
}

const AgentActiveWorkPanel: React.FC = () => {
  const [items, setItems] = useState<ActiveWorkItem[] | null>(null)
  const [loading, setLoading] = useState(true)

  const load = React.useCallback(() => {
    setLoading(true)
    listActiveAgentWork(100)
      .then(setItems)
      .catch(() => setItems([]))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    load()
    const id = setInterval(load, POLL_MS)
    return () => clearInterval(id)
  }, [load])

  // No flash on first load; hide entirely when there's no active work so the
  // panel only appears when a teammate is actually busy or blocked.
  if (items === null) return null
  if (items.length === 0) return null

  const sorted = [...items].sort((a, b) => {
    const d = (STATE_ORDER[a.state] ?? 9) - (STATE_ORDER[b.state] ?? 9)
    if (d !== 0) return d
    return b.updated_at.localeCompare(a.updated_at)
  })
  const blockedCount = items.filter((i) => i.state === "blocked").length

  return (
    <div className="mb-4 rounded-xl border border-border/60 bg-card/40 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border/50">
        <div className="bg-amber-500/10 p-1 rounded-md">
          <Loader2 className={cn("h-3.5 w-3.5 text-amber-500", loading && "animate-spin")} />
        </div>
        <h3 className="text-sm font-semibold tracking-tight">In progress</h3>
        <span className="text-[11px] text-muted-foreground">
          {items.length} active{blockedCount > 0 ? ` · ${blockedCount} waiting on you` : ""}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="ml-auto h-7 w-7 text-muted-foreground"
          onClick={load}
          disabled={loading}
          title="Refresh"
          aria-label="Refresh active agent work"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
        </Button>
      </div>

      <ul className="divide-y divide-border/40 max-h-[22rem] overflow-y-auto custom-scrollbar">
        {sorted.map((it) => (
          <li
            key={it.task_id}
            className={cn(
              "flex items-start gap-2.5 px-4 py-2.5",
              it.state === "blocked" && "bg-amber-500/5",
            )}
          >
            <span className="mt-0.5 shrink-0">
              <StateIcon state={it.state} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-baseline gap-x-1.5">
                <span className="text-sm font-medium truncate">{it.agent_name}</span>
                <span
                  className={cn(
                    "text-[11px]",
                    it.state === "blocked" ? "text-amber-600 font-medium" : "text-muted-foreground",
                  )}
                >
                  · {STATE_LABEL[it.state]}
                </span>
                <span className="text-[11px] text-muted-foreground/70">· {it.where}</span>
                <span className="text-[11px] text-muted-foreground/70">
                  · {formatTimeForReplyCount(it.updated_at)}
                </span>
              </span>
              {it.state === "blocked" && it.note && (
                <span className="block text-[13px] leading-snug text-foreground/80">{it.note}</span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default AgentActiveWorkPanel
