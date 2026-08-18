"use client"

/**
 * AgentWorkStrip — "an AI teammate is working on this, here's how to stop it",
 * shown on the thing itself.
 *
 * Before this, work was visible in one place (the thread or task where the agent
 * posts its status) and controllable in another (OneCamp AI → overflow menu → AI
 * teammates). Someone watching an agent head in the wrong direction had to leave
 * the conversation to stop it. This strip closes that gap: it mounts on a surface
 * (a channel thread, a task, anything with an id), asks once what is running
 * there, and renders nothing at all when the answer is nothing — so a quiet
 * thread is untouched.
 *
 * Freshness is PUSHED, not polled. The backend publishes each durable-job
 * transition to the surface's own MQTT topic, which every client is already
 * subscribed to, so the strip updates from an event: a known job's state is
 * patched in place with no request at all, a job that finished is simply dropped,
 * and only genuinely new work costs one fetch (it needs the per-person "may you
 * stop this" answer, which is never broadcast). Polling survives ONLY as a
 * fallback for a client whose MQTT connection is down — which matters most on a
 * phone, where a timer means waking the device to re-read an unchanged list.
 *
 * Deliberately generic: it takes an entity id and no surface-specific props, so
 * any surface can adopt it in one line. Permissions are the server's: it returns
 * only work this person may see, and each row says whether they may stop it, so
 * the strip never offers a control that would come back forbidden.
 */

import React, { useCallback, useEffect, useState } from "react"
import { cn } from "@/lib/utils/helpers/cn"
import { useToast } from "@/hooks/use-toast"
import { useResilientPolling } from "@/hooks/useResilientPolling"
import { useStreamGapResync } from "@/hooks/useStreamGapResync"
import { useAgentWorkEvents } from "@/hooks/useAgentWorkEvents"
import { useMqtt } from "@/components/mqtt/mqttProvider"
import { AgentWorkRow, sortAgentWork } from "@/components/ai/AgentWorkRow"
import { applyAgentWorkEvent } from "@/lib/utils/agentWork"
import { listAgentWorkForEntity, type ActiveWorkItem } from "@/services/agentService"
import { withAI } from "@/components/common/withFeature"

// Fallback interval, used only while MQTT is disconnected and something is
// running here. Push is the normal path.
const FALLBACK_POLL_MS = 15000

// A run can't outlive the worker's own bounds by much, and a phone shouldn't keep
// a thread polling all afternoon because a job got stuck; past the cap the strip
// goes quiet until the surface is revisited.
const POLL_CAP_MS = 30 * 60 * 1000

const AgentWorkStripUngated: React.FC<{
  /** The surface entity: a channel post uuid, chat message uuid, or task uuid. */
  entityId?: string | null
  /**
   * Bumped by the host when its content changes (a new comment arrived), so the
   * strip revalidates on real activity. Optional — pushed events cover the live
   * case; this catches work started by something the client didn't see.
   */
  revalidateKey?: string | number
  className?: string
}> = ({ entityId, revalidateKey, className }) => {
  const [items, setItems] = useState<ActiveWorkItem[]>([])
  const { toast } = useToast()
  const { connectionState } = useMqtt()

  const load = useCallback(async () => {
    if (!entityId) return
    try {
      setItems(await listAgentWorkForEntity(entityId))
    } catch {
      // A failed read must never break the surface it decorates: keep whatever
      // was last known and try again on the next event or fallback tick.
    }
  }, [entityId])

  useEffect(() => {
    void load()
  }, [load, revalidateKey])

  // Layer 2: the stream was untrustworthy for a while (a reconnect after a real
  // gap, or a backgrounded PWA coming forward — where iOS kills sockets without
  // telling anyone). One request per gap, so a phantom "working…" can't outlive
  // the disconnect that caused it.
  useStreamGapResync(() => void load(), !!entityId)

  // Pushed updates. Three cases, and only one of them costs a request:
  //   known job, still open  → patch its state in place (no request);
  //   known job, now closed  → drop it (no request);
  //   unknown job            → fetch once, because whether THIS person may stop
  //                            it is decided server-side and never broadcast.
  useAgentWorkEvents({
    entityId: entityId ?? undefined,
    onChange: (work) => {
      setItems((prev) => {
        const { items: next, needsFetch } = applyAgentWorkEvent(prev, work)
        if (needsFetch) void load()
        return next
      })
    },
  })

  // Fallback only: with MQTT connected there is nothing to poll for. When it is
  // down (and something is running here) the shared hook takes over, pausing
  // while the app is backgrounded and catching up the moment it returns.
  useResilientPolling({
    enabled: !!entityId && items.length > 0,
    mqttHealthy: connectionState.isConnected,
    interval: FALLBACK_POLL_MS,
    capMs: POLL_CAP_MS,
    onPoll: load,
  })

  if (!entityId || items.length === 0) return null

  return (
    <div
      // Opaque surface on purpose: a host may make this sticky (the mobile
      // thread does), and a translucent strip with the conversation scrolling
      // through it is unreadable. All positioning comes from className, so the
      // strip is invisible chrome-wise when there is nothing to show — the early
      // return above means no wrapper, no padding, no border.
      className={cn("rounded-lg border border-border/60 bg-card px-3", className)}
      aria-live="polite"
    >
      <ul className="divide-y divide-border/40">
        {sortAgentWork(items).map((it) => (
          <AgentWorkRow
            key={it.task_id}
            item={it}
            hideWhere
            onChanged={load}
            onError={(msg) => toast({ title: "Couldn't stop it", description: msg, variant: "destructive" })}
          />
        ))}
      </ul>
    </div>
  )
}
// Gated on the AI subsystem: hidden entirely on the AI-free v1 edition, and on v2
// whenever an admin has switched AI off. Wrapping the export covers every place this
// is rendered, desktop and mobile, instead of asking each of them to remember.
export const AgentWorkStrip = withAI(AgentWorkStripUngated)
export default AgentWorkStrip
