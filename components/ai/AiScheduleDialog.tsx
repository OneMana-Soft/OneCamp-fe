"use client"

/**
 * AiScheduleDialog — "Find a time" scheduling assistant.
 *
 * The user names a meeting, lists participants, and picks a length; the
 * assistant proposes times that work across everyone's free/busy (computed
 * server-side from the workspace calendar). The user picks a slot and confirms
 * to create the event AS themselves. Read-then-approve: nothing is created
 * until the user clicks a candidate and confirms.
 *
 * Only aggregate availability is shown per slot (e.g. "All free", "2 of 3
 * free") — never another person's event details.
 */

import React, { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"
import { CalendarClock, Loader2, Sparkles, Check, Users } from "@/lib/icons"
import {
  proposeSchedule,
  confirmSchedule,
  type ScheduleProposeResult,
  type ScheduleCandidate,
} from "@/services/scheduleService"

// formatSlot renders a UTC RFC3339 start/end pair in the viewer's local time.
function formatSlot(startISO: string, endISO: string): string {
  const start = new Date(startISO)
  const end = new Date(endISO)
  const day = start.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })
  const t = (d: Date) => d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
  return `${day} · ${t(start)} – ${t(end)}`
}

const AiScheduleDialog: React.FC<{
  open: boolean
  onOpenChange: (v: boolean) => void
}> = ({ open, onOpenChange }) => {
  const { toast } = useToast()
  const [title, setTitle] = useState("")
  const [participants, setParticipants] = useState("")
  const [duration, setDuration] = useState("30")
  const [windowDays, setWindowDays] = useState("7")
  const [loading, setLoading] = useState(false)
  const [confirming, setConfirming] = useState<string | null>(null)
  const [result, setResult] = useState<ScheduleProposeResult | null>(null)

  const reset = () => {
    setResult(null)
    setConfirming(null)
  }

  const find = async () => {
    const names = participants
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
    setLoading(true)
    setResult(null)
    try {
      const res = await proposeSchedule({
        title: title.trim(),
        participants: names,
        duration_mins: parseInt(duration, 10),
        window_days: parseInt(windowDays, 10),
      })
      if (!res.enabled) {
        toast({ title: "AI is not enabled for this workspace", variant: "destructive" })
        return
      }
      setResult(res)
      if (res.unresolved.length > 0) {
        toast({
          title: "Some names didn't match",
          description: `Couldn't resolve: ${res.unresolved.join(", ")}. They were left out.`,
        })
      }
    } catch {
      // surfaced by interceptor
    } finally {
      setLoading(false)
    }
  }

  const pick = async (c: ScheduleCandidate) => {
    if (!result) return
    setConfirming(c.start)
    try {
      const created = await confirmSchedule({
        title: title.trim() || "Meeting",
        start: c.start,
        end: c.end,
        participant_uuids: result.participants.map((p) => p.uuid),
        sync_to_google: true,
      })
      toast({ title: "Meeting scheduled", description: `${created.title} · ${formatSlot(c.start, c.end)}` })
      onOpenChange(false)
      reset()
    } catch {
      // surfaced
    } finally {
      setConfirming(null)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v)
        if (!v) reset()
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarClock className="h-4 w-4 text-primary" /> Find a time
          </DialogTitle>
          <DialogDescription>
            Name a meeting and who should be there. The assistant proposes times that work across
            everyone&apos;s calendars; pick one to create the event.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="space-y-1">
            <Label htmlFor="sched-title" className="text-xs">Meeting title</Label>
            <Input
              id="sched-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Design review"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="sched-people" className="text-xs">Participants</Label>
            <Input
              id="sched-people"
              value={participants}
              onChange={(e) => setParticipants(e.target.value)}
              placeholder="alice, bob (comma-separated names)"
            />
            <p className="text-[11px] text-muted-foreground/70">You&apos;re always included.</p>
          </div>
          <div className="flex gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Length</Label>
              <Select value={duration} onValueChange={setDuration}>
                <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="15">15 min</SelectItem>
                  <SelectItem value="30">30 min</SelectItem>
                  <SelectItem value="45">45 min</SelectItem>
                  <SelectItem value="60">1 hour</SelectItem>
                  <SelectItem value="90">1.5 hours</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Within</Label>
              <Select value={windowDays} onValueChange={setWindowDays}>
                <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="3">3 days</SelectItem>
                  <SelectItem value="7">1 week</SelectItem>
                  <SelectItem value="14">2 weeks</SelectItem>
                  <SelectItem value="30">1 month</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <Button onClick={find} disabled={loading} className="self-start">
            {loading ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Sparkles className="mr-1 h-4 w-4" />}
            {loading ? "Finding times…" : "Find times"}
          </Button>

          {result && (
            <div className="space-y-2 min-w-0">
              {result.participants.length > 0 && (
                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <Users className="h-3 w-3" />
                  {result.participants.map((p) => p.name).join(", ")}
                </div>
              )}
              {result.candidates.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {result.note || "No open slots found. Try a longer window or a shorter meeting."}
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
                                c.all_free ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"
                              }`}
                            >
                              {c.all_free ? "All free" : `${c.free_count} of ${c.total} free`}
                            </span>
                          </span>
                          {isConfirming ? (
                            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
                          ) : (
                            <span className="shrink-0 text-[11px] text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
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
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default AiScheduleDialog
