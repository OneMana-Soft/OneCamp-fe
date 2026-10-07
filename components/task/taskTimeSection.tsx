"use client"

// The task panel's Time row: start or stop a timer on the task, add time by
// hand, and see who spent how long. Anyone who can see the task can log time;
// people change only their own entries.

import * as React from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { useToast } from "@/hooks/use-toast"
import { serverMessage } from "@/lib/http/serverMessage"
import { ChevronDown, CircleStop, Pencil, Play, Plus, Trash2 } from "@/lib/icons"
import { formatClock, formatDuration, parseDuration, type TimeEntryView } from "@/lib/tasks/time"
import { startTimer, stopTimer, useElapsed, useRunningTimer, useTaskTime, type SpanInput } from "@/hooks/useTaskTime"
import { fieldLabel, fieldRow } from "@/lib/ui/fieldRow"
import { localDay } from "@/lib/utils/timeZone"

const shortDay = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" })

export function TaskTimeSection({ taskUUID }: { taskUUID: string }) {
  const { toast } = useToast()
  const { time, add, update, remove } = useTaskTime(taskUUID)
  const { running } = useRunningTimer()
  const [open, setOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<TimeEntryView | "new" | null>(null)
  const [busy, setBusy] = React.useState(false)

  const runningHere = running?.entry.task_uuid === taskUUID ? running.entry : null
  const elapsed = useElapsed(runningHere?.started_at)
  // The server's total counts a running timer up to when it was read; the live
  // clock replaces that part, so the total ticks with it.
  const runningAsRead = runningHere ? (time?.entries.find((e) => e.id === runningHere.id)?.seconds ?? 0) : 0
  const total = (time?.seconds ?? 0) - runningAsRead + (runningHere ? elapsed : 0)

  const act = async (fn: () => Promise<void>, failed: string) => {
    setBusy(true)
    try {
      await fn()
    } catch (e) {
      toast({ title: failed, description: serverMessage(e), variant: "destructive" })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={fieldRow("start")}>
      <div className="pt-1.5">
        <span className={fieldLabel}>Time</span>
      </div>
      <div className="min-w-0 grid gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {runningHere ? (
            <Button size="sm" variant="destructive" className="h-8 gap-1.5" disabled={busy} onClick={() => act(() => stopTimer(taskUUID), "Couldn't stop the timer")}>
              <CircleStop className="h-4 w-4" />
              <span className="tabular-nums">{formatClock(elapsed)}</span>
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              className="h-8 gap-1.5"
              disabled={busy}
              title={running ? `Stops the timer on "${running.task_name}"` : undefined}
              onClick={() => act(() => startTimer(taskUUID, running?.entry.task_uuid), "Couldn't start the timer")}
            >
              <Play className="h-3.5 w-3.5" />
              Start timer
            </Button>
          )}
          <Button size="sm" variant="ghost" className="h-8 gap-1" onClick={() => { setOpen(true); setEditing("new") }}>
            <Plus className="h-3.5 w-3.5" />
            Add time
          </Button>
          {(time?.entries.length ?? 0) > 0 && (
            <Button size="sm" variant="ghost" className="h-8 gap-1 text-muted-foreground" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
              <span className="tabular-nums">{formatDuration(total)}</span> logged
              <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
            </Button>
          )}
        </div>

        {editing === "new" && (
          <SpanForm
            onCancel={() => setEditing(null)}
            onSave={(span) => act(async () => { await add(span); setEditing(null) }, "Couldn't add that time")}
          />
        )}

        {open && time && time.entries.length > 0 && (
          <ul className="grid gap-1 rounded-md border p-2 text-sm">
            {time.entries.map((e) =>
              editing !== "new" && editing?.id === e.id ? (
                <li key={e.id}>
                  <SpanForm
                    entry={e}
                    onCancel={() => setEditing(null)}
                    onSave={(span) => act(async () => { await update(e.id, span); setEditing(null) }, "Couldn't change that time")}
                  />
                </li>
              ) : (
                <li key={e.id} className="group flex items-center gap-2 rounded px-1 py-0.5 hover:bg-muted/50">
                  <span className="w-14 shrink-0 text-xs text-muted-foreground">{shortDay(e.started_at)}</span>
                  <span className="w-16 shrink-0 tabular-nums">{e.ended_at ? formatDuration(e.seconds) : "running"}</span>
                  <span className="min-w-0 flex-1 truncate">
                    {e.person}
                    {e.note && <span className="text-muted-foreground"> · {e.note}</span>}
                  </span>
                  {!e.billable && <span className="rounded bg-muted px-1.5 text-2xs text-muted-foreground">not billable</span>}
                  {e.mine && e.ended_at && (
                    <span className="flex shrink-0 gap-0.5 sm:pointer-events-none sm:opacity-0 sm:group-hover:pointer-events-auto sm:group-hover:opacity-100 sm:group-focus-within:pointer-events-auto sm:group-focus-within:opacity-100">
                      <Button size="icon" variant="ghost" className="h-7 w-7" aria-label="Change this time" onClick={() => setEditing(e)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7" aria-label="Delete this time" onClick={() => act(() => remove(e.id), "Couldn't delete that time")}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </span>
                  )}
                </li>
              ),
            )}
          </ul>
        )}
      </div>
    </div>
  )
}

function SpanForm({ entry, onSave, onCancel }: { entry?: TimeEntryView; onSave: (span: SpanInput) => void; onCancel: () => void }) {
  const [day, setDay] = React.useState(() => localDay(entry ? new Date(entry.started_at) : new Date()))
  const [duration, setDuration] = React.useState(entry ? formatDuration(entry.seconds) : "")
  const [note, setNote] = React.useState(entry?.note ?? "")
  const [billable, setBillable] = React.useState(entry?.billable ?? true)
  const minutes = parseDuration(duration)
  const id = React.useId()

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!minutes) return
    // Keep the time of day an entry had; a new one ends now, or at the end of
    // the working day for an earlier date.
    const [y, m, d] = day.split("-").map(Number)
    let start: Date
    if (entry) {
      const was = new Date(entry.started_at)
      start = new Date(y, m - 1, d, was.getHours(), was.getMinutes())
    } else {
      const today = localDay(new Date()) === day
      const end = today ? new Date() : new Date(y, m - 1, d, 18, 0)
      start = new Date(end.getTime() - minutes * 60_000)
    }
    onSave({ started_at: start.toISOString(), minutes, note, billable })
  }

  return (
    <form onSubmit={submit} className="grid gap-2 rounded-md border bg-muted/30 p-2">
      <div className="grid grid-cols-2 gap-2">
        <div className="grid gap-1">
          <Label htmlFor={`${id}-day`} className="text-2xs text-muted-foreground">Day</Label>
          <Input id={`${id}-day`} type="date" value={day} max={localDay(new Date())} onChange={(e) => setDay(e.target.value)} className="h-8" required />
        </div>
        <div className="grid gap-1">
          <Label htmlFor={`${id}-dur`} className="text-2xs text-muted-foreground">How long</Label>
          <Input
            id={`${id}-dur`}
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            placeholder="1h 30m"
            className="h-8"
            aria-invalid={duration !== "" && !minutes}
            autoFocus
          />
        </div>
      </div>
      {duration !== "" && !minutes && <p className="text-xs text-destructive">Try &ldquo;45m&rdquo;, &ldquo;1h 30m&rdquo; or &ldquo;1:30&rdquo;, up to 24 hours.</p>}
      <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="What did you do? (optional)" aria-label="Note" maxLength={500} className="h-8" />
      <div className="flex items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-xs">
          <Switch checked={billable} onCheckedChange={setBillable} aria-label="Billable" />
          Billable
        </label>
        <div className="flex gap-2">
          <Button type="button" size="sm" variant="ghost" className="h-8" onClick={onCancel}>Cancel</Button>
          <Button type="submit" size="sm" className="h-8" disabled={!minutes}>{entry ? "Save" : "Add"}</Button>
        </div>
      </div>
    </form>
  )
}
