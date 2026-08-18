"use client"

/**
 * RescheduleDialog — "Find a better time" for an existing event.
 *
 * For a meeting the user already created, the assistant reports who currently
 * has a conflict at its time and proposes alternative slots that work across
 * the same participants (free/busy aware, computed server-side). The user picks
 * a slot and confirms to MOVE the event AS themselves through the normal
 * calendar update path. Read-then-approve: nothing changes until confirm.
 *
 * Only aggregate availability is shown per slot ("All free", "2 of 3 free") and
 * only the names of those with a conflict at the current time -- never another
 * person's event details.
 */

import React, { useState, useEffect, useCallback } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { useToast } from "@/hooks/use-toast"
import { CalendarClock, Loader2, Check, Users, AlertTriangle } from "@/lib/icons"
import {
  proposeReschedule,
  confirmReschedule,
  type RescheduleResult,
  type ScheduleCandidate,
} from "@/services/scheduleService"
import { withAI } from "@/components/common/withFeature"

// formatSlot renders a UTC RFC3339 start/end pair in the viewer's local time.
function formatSlot(startISO: string, endISO: string): string {
  const start = new Date(startISO)
  const end = new Date(endISO)
  const day = start.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })
  const t = (d: Date) => d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
  return `${day} · ${t(start)} – ${t(end)}`
}

const RescheduleDialog: React.FC<{
  open: boolean
  onOpenChange: (v: boolean) => void
  eventUUID: string
  onRescheduled?: () => void
}> = ({ open, onOpenChange, eventUUID, onRescheduled }) => {
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [confirming, setConfirming] = useState<string | null>(null)
  const [result, setResult] = useState<RescheduleResult | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setResult(null)
    try {
      const res = await proposeReschedule(eventUUID)
      if (!res.enabled) {
        toast({ title: "AI is not enabled for this workspace", variant: "destructive" })
        return
      }
      setResult(res)
    } catch {
      // surfaced by interceptor
    } finally {
      setLoading(false)
    }
  }, [eventUUID, toast])

  // Fetch options whenever the dialog opens for a given event.
  useEffect(() => {
    if (open && eventUUID) {
      load()
    }
    if (!open) {
      setResult(null)
      setConfirming(null)
    }
  }, [open, eventUUID, load])

  const pick = async (c: ScheduleCandidate) => {
    setConfirming(c.start)
    try {
      await confirmReschedule({
        event_uuid: eventUUID,
        start: c.start,
        end: c.end,
        sync_to_google: true,
      })
      toast({ title: "Meeting moved", description: formatSlot(c.start, c.end) })
      onRescheduled?.()
      onOpenChange(false)
    } catch {
      // surfaced
    } finally {
      setConfirming(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarClock className="h-4 w-4 text-primary" /> Find a better time
          </DialogTitle>
          <DialogDescription>
            The assistant proposes times that work across everyone&apos;s calendars. Pick one to move
            this meeting; participants and details stay the same.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Checking calendars…
          </div>
        ) : result ? (
          <div className="flex flex-col gap-3 min-w-0">
            {/* Current time + conflict summary */}
            <div className="rounded-lg border border-border/70 bg-muted/40 px-3 py-2 space-y-1">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Currently</div>
              <div className="text-sm font-medium truncate">
                {formatSlot(result.current_start, result.current_end)}
              </div>
              {result.conflict_count > 0 ? (
                <div className="flex items-start gap-1.5 text-[11px] text-warning">
                  <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                  <span>
                    {result.conflict_count} {result.conflict_count === 1 ? "person has" : "people have"} a
                    conflict{result.conflicts.length > 0 ? `: ${result.conflicts.join(", ")}` : ""}
                  </span>
                </div>
              ) : (
                <div className="text-[11px] text-success">
                  No conflicts right now — but you can still move it.
                </div>
              )}
            </div>

            {result.participants.length > 0 && (
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <Users className="h-3 w-3" />
                {result.participants.map((p) => p.name).join(", ")}
              </div>
            )}

            {result.candidates.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {result.note || "No open slots found. Try again later or move it manually."}
              </p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {result.candidates.map((c) => {
                  const isConfirming = confirming === c.start
                  return (
                    <li key={c.start}>
                      <button
                        type="button"
                        disabled={!!confirming}
                        onClick={() => pick(c)}
                        className="group flex w-full items-center gap-2 rounded-lg border border-border/70 bg-card px-3 py-2 text-left transition-colors hover:border-primary hover:bg-primary/5 disabled:opacity-60"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium truncate">{formatSlot(c.start, c.end)}</span>
                          <span
                            className={`text-[11px] ${
                              c.all_free ? "text-success" : "text-warning"
                            }`}
                          >
                            {c.all_free ? "All free" : `${c.free_count} of ${c.total} free`}
                          </span>
                        </span>
                        {isConfirming ? (
                          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
                        ) : (
                          <span className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100">
                            <Check className="h-4 w-4 text-primary" />
                          </span>
                        )}
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}


// Gated on the AI subsystem: hidden entirely on the AI-free v1 edition, whose backend
// serves no AI routes, and on v2 whenever an admin has switched AI off. Wrapping the
// export covers every place this is rendered, desktop and mobile, rather than asking
// each of them to remember.
export default withAI(RescheduleDialog)