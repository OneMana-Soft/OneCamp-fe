"use client"

// AgentActiveWorkPanel — the live "what are my AI teammates doing right now"
// view: the open durable jobs an agent is handling in the background, bucketed
// into blocked (waiting on you), working, and queued. It's the observability
// loop for background/async runs — a teammate that's stuck waiting on your input
// is visible here instead of only in the one thread it posted in, and each row
// can be stopped from here.
//
// Calm and self-hiding: renders nothing until loaded, and nothing when there's
// no active work. Polls on a gentle interval since the state is live, plus a
// manual refresh. Scoped server-side to the agents the viewer can see.
//
// Rows come from the shared AgentWorkRow, so this panel and the member-facing
// dialog stay identical in wording, ordering and behaviour.

import React, { useEffect, useState } from "react"
import { RefreshCw } from "@/lib/icons"
import { Button } from "@/components/ui/button"
import { useToast } from "@/hooks/use-toast"
import { useResilientPolling } from "@/hooks/useResilientPolling"
import { useStreamGapResync } from "@/hooks/useStreamGapResync"
import { useAgentWorkEvents } from "@/hooks/useAgentWorkEvents"
import { useMqtt } from "@/components/mqtt/mqttProvider"
import { AgentWorkRow, sortAgentWork } from "@/components/ai/AgentWorkRow"
import { listActiveAgentWork, type ActiveWorkItem } from "@/services/agentService"
import { AgentAvatar } from "@/components/ui/graphics/PrincipalAvatar"

// Poll interval for live work state. Gentle so it never hammers the API; the
// evolving in-thread status comment is the real-time surface, this is the
// at-a-glance roll-up.
const POLL_MS = 15000

const AgentActiveWorkPanel: React.FC<{ title?: string; className?: string }> = ({ title = "In progress", className }) => {
  const [items, setItems] = useState<ActiveWorkItem[] | null>(null)
  const [loading, setLoading] = useState(true)
  const { toast } = useToast()
  const { connectionState } = useMqtt()

  const load = React.useCallback(() => {
    setLoading(true)
    return listActiveAgentWork(100)
      .then(setItems)
      .catch(() => setItems([]))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  // Pushed: job transitions arrive on this admin's own activity topic (they own
  // the agents this panel lists), so the panel follows the work without a timer.
  useAgentWorkEvents({ onChange: () => void load() })

  // One reconcile after a stream gap (reconnect, or the tab coming forward).
  useStreamGapResync(() => void load())

  // Fallback ONLY while MQTT is unhealthy — after ~17 minutes of failed retries
  // the client gives up, and an operator staring at a frozen "In progress" panel
  // has no way to tell. Paused while hidden so a forgotten tab costs nothing.
  useResilientPolling({
    enabled: true,
    mqttHealthy: connectionState.isConnected,
    interval: POLL_MS,
    capMs: 0, // this panel is the live view; keep it honest for as long as it's open
    onPoll: load,
  })

  // No flash on first load; hide entirely when there's no active work so the
  // panel only appears when a teammate is actually busy or blocked.
  if (items === null) return null
  if (items.length === 0) return null

  const sorted = sortAgentWork(items)
  const blockedCount = items.filter((i) => i.state === "blocked").length

  // A card of rows (design v3, admin §A15 "Agents active now"): each row
  // leads with the agent's square and a 2px live bar in the agent hue that
  // breathes on opacity while the run is going. The title was on a tinted
  // tile with a refresh spinner beside it.
  return (
    <section aria-labelledby="agents-working-now" className={className}>
      <div className="mb-3 flex items-center gap-2">
        <h3 id="agents-working-now" className="text-heading text-foreground">
          {title}
        </h3>
        <span className="text-xs tabular-nums text-muted-foreground">
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
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div data-settings-card="" className="set-card">
        <ul className="max-h-[22rem] overflow-y-auto custom-scrollbar">
          {sorted.map((it) => (
            <li key={it.task_id} data-live-row="" data-live={it.state === "working" ? "true" : undefined} className="ai-live-row">
              <span aria-hidden="true" data-live-bar="" className="ai-live-bar" />
              <span className="mt-2.5 size-7 shrink-0">
                <AgentAvatar />
              </span>
              <ul className="min-w-0 flex-1">
                <AgentWorkRow
                  item={it}
                  className="pr-3"
                  onChanged={load}
                  onError={(msg) => toast({ title: "Couldn't stop it", description: msg, variant: "destructive" })}
                />
              </ul>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

export default AgentActiveWorkPanel
