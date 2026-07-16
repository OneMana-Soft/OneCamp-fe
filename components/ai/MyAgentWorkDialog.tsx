"use client"

/**
 * MyAgentWorkDialog — the member-facing "AI teammates" view: the open durable
 * jobs YOU are involved in (ones you triggered or that run as you), across any
 * agent, bucketed into blocked (waiting on you), working, and queued. Gives
 * every member the async-work observability loop that used to be admin-only —
 * a teammate blocked on your input is visible here, not just in the one thread
 * it posted in. Self-scoped server-side; polls gently while open.
 */

import React, { useCallback, useEffect, useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Loader2, Clock, AlertTriangle, Sparkles } from "@/lib/icons"
import { cn } from "@/lib/utils/helpers/cn"
import { formatTimeForReplyCount } from "@/lib/utils/date/formatTimeForReplyCount"
import { listMyAgentWork, type ActiveWorkItem, type ActiveWorkState } from "@/services/agentService"

const POLL_MS = 15000

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

const MyAgentWorkDialog: React.FC<{ open: boolean; onOpenChange: (v: boolean) => void }> = ({
  open,
  onOpenChange,
}) => {
  const [items, setItems] = useState<ActiveWorkItem[] | null>(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    listMyAgentWork(100)
      .then(setItems)
      .catch(() => setItems([]))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!open) return
    load()
    const id = setInterval(load, POLL_MS)
    return () => clearInterval(id)
  }, [open, load])

  const sorted = items
    ? [...items].sort((a, b) => {
        const d = (STATE_ORDER[a.state] ?? 9) - (STATE_ORDER[b.state] ?? 9)
        if (d !== 0) return d
        return b.updated_at.localeCompare(a.updated_at)
      })
    : []
  const blockedCount = items?.filter((i) => i.state === "blocked").length ?? 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-primary" />
            AI teammates
            {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
          </DialogTitle>
          <DialogDescription>
            What your AI teammates are doing for you right now
            {blockedCount > 0 ? ` — ${blockedCount} waiting on you` : ""}.
          </DialogDescription>
        </DialogHeader>

        {items === null ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : items.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            Nothing in progress. When you hand work to an AI teammate, it shows up here.
          </div>
        ) : (
          <ul className="max-h-[24rem] divide-y divide-border/40 overflow-y-auto custom-scrollbar">
            {sorted.map((it) => (
              <li
                key={it.task_id}
                className={cn("flex items-start gap-2.5 px-1 py-2.5", it.state === "blocked" && "bg-amber-500/5")}
              >
                <span className="mt-0.5 shrink-0">
                  <StateIcon state={it.state} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-baseline gap-x-1.5">
                    <span className="truncate text-sm font-medium">{it.agent_name}</span>
                    <span
                      className={cn(
                        "text-[11px]",
                        it.state === "blocked" ? "font-medium text-amber-600" : "text-muted-foreground",
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
        )}
      </DialogContent>
    </Dialog>
  )
}

export default MyAgentWorkDialog
