"use client"

/**
 * AgentWorkRow — one live agent job, rendered identically wherever it appears.
 *
 * The member view (MyAgentWorkDialog) and the builder's mission-control panel
 * (AgentActiveWorkPanel) show the same thing: which teammate, what state, where,
 * how long ago, and what it needs. They had drifted into two copies of the state
 * labels, icons, sort order and row markup, so a change to any of it had to be
 * made twice. This module owns all of it once — including the Stop control, which
 * must behave the same in both places since it acts on live work.
 *
 * Stop is deliberately quiet (a hover/focus-revealed ghost button, no
 * confirmation dialog): stopping is safe and reversible in the sense that
 * nothing half-applied is left behind, the agent posts what it had done, and the
 * work can be handed back to it. A modal for that would be friction, but a row
 * that keeps saying "Working" after the click would be a lie — so the row
 * switches to "Stopping…" immediately and the parent refreshes.
 */

import React, { useState } from "react"
import { Loader2, Clock, AlertTriangle, CircleStop } from "@/lib/icons"
import { cn } from "@/lib/utils/helpers/cn"
import { formatTimeForReplyCount } from "@/lib/utils/date/formatTimeForReplyCount"
import { stopAgentWork, type ActiveWorkItem, type ActiveWorkState } from "@/services/agentService"
import { withAI } from "@/components/common/withFeature"

// State presentation in one place: order (blocked first — it needs the viewer),
// the human label, and whether it draws attention. Unknown states degrade to a
// calm queued-like row rather than rendering blank.
export const AGENT_WORK_STATE_META: Record<ActiveWorkState, { order: number; label: string; attention: boolean }> = {
  blocked: { order: 0, label: "Waiting on you", attention: true },
  working: { order: 1, label: "Working", attention: false },
  stopping: { order: 2, label: "Stopping…", attention: false },
  queued: { order: 3, label: "Queued", attention: false },
  stopped: { order: 4, label: "Stopped", attention: false },
}

const stateMeta = (state: ActiveWorkState) => AGENT_WORK_STATE_META[state] ?? AGENT_WORK_STATE_META.queued

// sortAgentWork orders work the way a person reads it: what needs them first,
// then the most recently active. Pure — the same ordering in every surface.
export function sortAgentWork(items: ActiveWorkItem[]): ActiveWorkItem[] {
  return [...items].sort((a, b) => {
    const d = stateMeta(a.state).order - stateMeta(b.state).order
    if (d !== 0) return d
    return b.updated_at.localeCompare(a.updated_at)
  })
}

export const AgentWorkStateIcon: React.FC<{ state: ActiveWorkState }> = ({ state }) => {
  if (state === "working") return <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-500" />
  if (state === "stopping") return <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
  if (state === "blocked") return <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
  return <Clock className="h-3.5 w-3.5 text-muted-foreground/60" />
}

const AgentWorkRowUngated: React.FC<{
  item: ActiveWorkItem
  // onChanged lets the parent re-read the feed once a stop lands, so the row's
  // optimistic state is replaced by the server's truth rather than trusted.
  onChanged?: () => void
  // onError surfaces a failed stop through the host's own toast/notice, keeping
  // this component free of a notification dependency.
  onError?: (message: string) => void
  // hideWhere drops the "in a channel thread" phrase. Set it when the row is
  // rendered ON that surface: repeating where you already are is noise, and the
  // line reads better without it. Cross-surface lists keep it.
  hideWhere?: boolean
  className?: string
}> = ({ item, onChanged, onError, hideWhere, className }) => {
  const [stopping, setStopping] = useState(false)
  // Optimistic: the moment a stop is accepted the row reads "Stopping…", even
  // before the poll comes back with the server's state.
  const state: ActiveWorkState = stopping && item.state !== "stopping" ? "stopping" : item.state
  const meta = stateMeta(state)
  const canStop = item.can_stop !== false && state !== "stopping" && state !== "stopped"

  const stop = async () => {
    setStopping(true)
    try {
      await stopAgentWork(item.task_id)
      onChanged?.()
    } catch (e) {
      setStopping(false)
      onError?.(e instanceof Error ? e.message : "Couldn't stop this work")
    }
  }

  return (
    <li
      className={cn(
        "group flex items-start gap-2.5 py-2.5",
        state === "blocked" && "bg-amber-500/5",
        className,
      )}
    >
      <span className="mt-0.5 shrink-0">
        <AgentWorkStateIcon state={state} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-baseline gap-x-1.5">
          <span className="truncate text-sm font-medium">{item.agent_name}</span>
          <span className={cn("text-2xs", meta.attention ? "font-medium text-amber-600" : "text-muted-foreground")}>
            · {meta.label}
          </span>
          {!hideWhere && <span className="text-2xs text-muted-foreground/70">· {item.where}</span>}
          {/* Who asked. Placed before the timestamp because attribution answers
              "is this mine?" — the question a person scanning a list of live work
              actually has — while the time only matters once they've found their
              row. Omitted entirely when nobody asked (a scheduled routine), since
              "for nobody" is worse than silence. */}
          {item.requested_by && (
            <span className="text-2xs text-muted-foreground/70">· for {item.requested_by}</span>
          )}
          <span className="text-2xs text-muted-foreground/70">· {formatTimeForReplyCount(item.updated_at)}</span>
        </span>
        {state === "blocked" && item.note && (
          <span className="block text-xs leading-snug text-foreground/80">{item.note}</span>
        )}
      </span>
      {canStop && (
        <button
          type="button"
          onClick={stop}
          disabled={stopping}
          title={`Stop ${item.agent_name}`}
          aria-label={`Stop ${item.agent_name}'s current work`}
          className={cn(
            // Touch-first sizing: a comfortable tap target by default, trimmed
            // only where a fine pointer makes a smaller one usable.
            "mt-0.5 inline-flex min-h-8 shrink-0 items-center gap-1 rounded-md px-2.5 text-2xs text-muted-foreground",
            "[@media(hover:hover)]:min-h-0 [@media(hover:hover)]:px-1.5 [@media(hover:hover)]:py-0.5",
            // Visible by DEFAULT, and hidden-until-hover ONLY on devices that
            // have hover. On a phone (OneCamp runs as a PWA) there is no hover,
            // so a hover-revealed control is simply an invisible, unreachable
            // one — the whole feature would be missing on mobile.
            "opacity-100 [@media(hover:hover)]:opacity-0",
            "transition-opacity hover:bg-destructive/10 hover:text-destructive",
            "[@media(hover:hover)]:group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100",
            "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-destructive/40",
          )}
        >
          <CircleStop className="h-3.5 w-3.5" />
          Stop
        </button>
      )}
    </li>
  )
}
// Gated on the AI subsystem: hidden entirely on the AI-free v1 edition, whose backend
// serves no AI routes, and on v2 whenever an admin has switched AI off. Wrapping the
// export covers every place this is rendered, desktop and mobile, rather than asking
// each of them to remember.
export const AgentWorkRow = withAI(AgentWorkRowUngated)
export default AgentWorkRow
