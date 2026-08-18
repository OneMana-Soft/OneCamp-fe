"use client"

/**
 * MyAgentWorkDialog — the member-facing "AI teammates" view: the open durable
 * jobs YOU are involved in (ones you triggered or that run as you), across any
 * agent, bucketed into blocked (waiting on you), working, and queued. Gives
 * every member the async-work observability loop that used to be admin-only —
 * a teammate blocked on your input is visible here, not just in the one thread
 * it posted in. Self-scoped server-side; polls gently while open.
 *
 * Each row is the shared AgentWorkRow, so this view and the builder's
 * mission-control panel present (and stop) live work identically.
 */

import React, { useCallback, useEffect, useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Loader2, Sparkles } from "@/lib/icons"
import { useToast } from "@/hooks/use-toast"
import { useResilientPolling } from "@/hooks/useResilientPolling"
import { useStreamGapResync } from "@/hooks/useStreamGapResync"
import { useAgentWorkEvents } from "@/hooks/useAgentWorkEvents"
import { useMqtt } from "@/components/mqtt/mqttProvider"
import { AgentWorkRow, sortAgentWork } from "@/components/ai/AgentWorkRow"
import { SkeletonRows } from "@/components/ui/skeletonRows"
import { EmptyState } from "@/components/ui/empty-state"
import { listMyAgentWork, type ActiveWorkItem } from "@/services/agentService"

const POLL_MS = 15000

const MyAgentWorkDialog: React.FC<{ open: boolean; onOpenChange: (v: boolean) => void }> = ({
  open,
  onOpenChange,
}) => {
  const [items, setItems] = useState<ActiveWorkItem[] | null>(null)
  const [loading, setLoading] = useState(false)
  const { toast } = useToast()
  const { connectionState } = useMqtt()

  const load = useCallback(() => {
    setLoading(true)
    return listMyAgentWork(100)
      .then(setItems)
      .catch(() => setItems([]))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (open) void load()
  }, [open, load])

  // Pushed: every durable-job transition reaches this client on its own activity
  // topic, so the list follows the work without asking. The list is small and the
  // per-person "may you stop it" answer is never broadcast, so a re-read is the
  // honest way to apply an event.
  useAgentWorkEvents({ onChange: () => { if (open) void load() } })

  // Reconcile once after a stream gap (reconnect / PWA foreground).
  useStreamGapResync(() => { if (open) void load() }, open)

  // Fallback ONLY while MQTT is unhealthy: after ~17 minutes of failed retries
  // the client stops trying, so a dead broker with live internet would otherwise
  // leave this dialog frozen with no way to notice. Paused while hidden, backs
  // off on error.
  useResilientPolling({
    enabled: open,
    mqttHealthy: connectionState.isConnected,
    interval: POLL_MS,
    capMs: 30 * 60 * 1000,
    onPoll: load,
  })

  const sorted = items ? sortAgentWork(items) : []
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
          // Content-shaped, not a spinner: the list keeps its size, so nothing
          // jumps under a thumb when the data lands.
          <div role="status" aria-label="Loading your AI teammates' work">
            <SkeletonRows rows={3} />
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            icon={Sparkles}
            title="Nothing in progress"
            description="When you hand work to an AI teammate, it shows up here."
          />
        ) : (
          <ul className="max-h-[24rem] divide-y divide-border/40 overflow-y-auto custom-scrollbar">
            {sorted.map((it) => (
              <AgentWorkRow
                key={it.task_id}
                item={it}
                className="px-1"
                onChanged={load}
                onError={(msg) => toast({ title: "Couldn't stop it", description: msg, variant: "destructive" })}
              />
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  )
}

export default MyAgentWorkDialog
