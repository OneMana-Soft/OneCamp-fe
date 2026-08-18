"use client"

/**
 * MeetingPrepDialog — "Prep brief" for an upcoming event.
 *
 * On open, asks the assistant for a concise pre-meeting brief: what the
 * meeting is about, suggested talking points, relevant recent discussion, and
 * the organizer's open follow-up items. Read-only — it never changes the event.
 *
 * The brief is grounded server-side only in content the requester can already
 * see (same permission model as AskAI recall), so it can't surface anything
 * out of reach. Available to the event creator or any participant.
 */

import React, { useState, useEffect, useCallback } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { useToast } from "@/hooks/use-toast"
import { Sparkles, Loader2, RefreshCw } from "@/lib/icons"
import MarkdownMessage from "@/components/ai/MarkdownMessage"
import { meetingPrep, type MeetingPrepResult } from "@/services/scheduleService"
import { withAI } from "@/components/common/withFeature"

const MeetingPrepDialog: React.FC<{
  open: boolean
  onOpenChange: (v: boolean) => void
  eventUUID: string
}> = ({ open, onOpenChange, eventUUID }) => {
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<MeetingPrepResult | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setResult(null)
    try {
      const res = await meetingPrep(eventUUID)
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

  useEffect(() => {
    if (open && eventUUID) {
      load()
    }
    if (!open) {
      setResult(null)
    }
  }, [open, eventUUID, load])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" /> Prep brief
          </DialogTitle>
          <DialogDescription>
            A quick brief for this meeting, drawn from related discussion and your open items. Nothing
            is changed.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Preparing your brief…
          </div>
        ) : result ? (
          <div className="flex flex-col gap-3 min-w-0">
            {result.brief ? (
              <div className="rounded-lg border border-border/70 bg-card px-3 py-2 text-sm leading-relaxed">
                <MarkdownMessage content={result.brief} />
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                {result.note || "Not enough context yet to prepare a brief for this meeting."}
              </p>
            )}
            <Button variant="ghost" size="sm" className="self-start" onClick={load} disabled={loading}>
              <RefreshCw className="mr-1 h-3.5 w-3.5" /> Regenerate
            </Button>
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
export default withAI(MeetingPrepDialog)