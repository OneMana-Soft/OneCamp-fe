"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useCheckIns } from "@/hooks/useCheckIns"
import { useToast } from "@/hooks/use-toast"
import { Loader2, MessageSquare, Pause, Play, Trash2 } from "@/lib/icons"
import { DAY_LABELS, SUGGESTED_QUESTIONS, describeSchedule, nextLabel, type CheckIn, type CheckInInput } from "@/lib/checkins"
import { cn } from "@/lib/utils/helpers/cn"
import { browserTZ } from "@/lib/utils/timeZone"

/** Setting up a check-in, or changing one: the question, the days and the time. */
function CheckInForm({ editing, onSave, onCancel }: { editing?: CheckIn; onSave: (input: CheckInInput) => Promise<unknown>; onCancel: () => void }) {
  const [question, setQuestion] = useState(editing?.question ?? "")
  const [days, setDays] = useState<number[]>(editing?.days ?? [1, 2, 3, 4, 5])
  const [time, setTime] = useState(editing?.time ?? "17:00")
  const [busy, setBusy] = useState(false)
  const tz = editing?.tz ?? browserTZ()
  const toggle = (d: number) => setDays(days.includes(d) ? days.filter((x) => x !== d) : [...days, d])

  const save = async () => {
    if (!question.trim() || days.length === 0 || busy) return
    setBusy(true)
    try {
      await onSave({ question, days, time, tz })
      onCancel()
    } catch {
      // The server's message is shown already.
    } finally {
      setBusy(false)
    }
  }

  return (
    <form
      className="grid gap-3 rounded-lg border border-border/70 p-3"
      onSubmit={(e) => {
        e.preventDefault()
        void save()
      }}
      aria-label={editing ? "Change the check-in" : "Set up a check-in"}
    >
      <div className="grid gap-1.5">
        <Label htmlFor="checkin-question">Question</Label>
        <Input
          id="checkin-question"
          value={question}
          maxLength={300}
          autoFocus
          placeholder="What did you work on today?"
          onChange={(e) => setQuestion(e.target.value)}
        />
        {!editing && !question && (
          <div className="flex flex-wrap gap-1.5">
            {SUGGESTED_QUESTIONS.map((s) => (
              <button
                key={s.question}
                type="button"
                className="rounded-full border border-border/70 px-2.5 py-0.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
                onClick={() => {
                  setQuestion(s.question)
                  setDays(s.days)
                  setTime(s.time)
                }}
              >
                {s.question}
              </button>
            ))}
          </div>
        )}
      </div>
      <fieldset className="grid gap-1.5">
        <legend className="mb-1 text-sm font-medium">Asked on</legend>
        <div className="flex flex-wrap gap-1" role="group" aria-label="Asked on">
          {DAY_LABELS.map((label, i) => {
            const on = days.includes(i + 1)
            return (
              <button
                key={label}
                type="button"
                aria-pressed={on}
                onClick={() => toggle(i + 1)}
                className={cn(
                  "h-8 w-11 rounded-md border text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
                  on ? "border-transparent bg-primary text-primary-foreground" : "border-border/70 text-muted-foreground hover:bg-accent",
                )}
              >
                {label}
              </button>
            )
          })}
        </div>
      </fieldset>
      <div className="flex flex-wrap items-end gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="checkin-time">At</Label>
          <Input id="checkin-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} className="h-9 w-32" required />
        </div>
        <p className="pb-2 text-xs text-muted-foreground">{tz}</p>
      </div>
      <p className="text-xs text-muted-foreground">
        Everyone in the channel is asked. The question is posted here and the answers go in its thread; people who are away get an email.
      </p>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={busy || !question.trim() || days.length === 0}>
          {busy && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
          {editing ? "Save" : "Set up check-in"}
        </Button>
      </div>
    </form>
  )
}

/**
 * A channel's automatic check-ins: a question asked on a schedule, answered in
 * its thread. Everyone in the channel sees them; its moderators set them up.
 */
export function ChannelCheckIns({ channelId }: { channelId: string }) {
  const { toast } = useToast()
  const { checkIns, canEdit, isLoading, create, edit, setPaused, remove, askNow } = useCheckIns(channelId)
  const [form, setForm] = useState<{ editing?: CheckIn } | null>(null)
  const [confirming, setConfirming] = useState<string | null>(null)

  if (isLoading || (!canEdit && checkIns.length === 0)) return null

  const run = (fn: () => Promise<unknown>, done: string) => () =>
    void fn()
      .then(() => toast({ title: done }))
      .catch(() => {})

  return (
    <section className="grid gap-2" aria-label="Check-ins">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold">
          <MessageSquare className="h-4 w-4 text-muted-foreground" aria-hidden />
          Check-ins
        </h3>
        {canEdit && !form && (
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setForm({})}>
            New check-in
          </Button>
        )}
      </div>
      {checkIns.length === 0 && !form && (
        <p className="text-xs text-muted-foreground">
          Ask the channel a question on a schedule, like &quot;What did you work on today?&quot; every weekday at 17:00, instead of a status meeting.
        </p>
      )}
      {form && !form.editing && <CheckInForm onSave={create} onCancel={() => setForm(null)} />}
      <ul className="grid gap-2">
        {checkIns.map((c) =>
          form?.editing?.id === c.id ? (
            <li key={c.id}>
              <CheckInForm editing={c} onSave={(input) => edit(c.id, input)} onCancel={() => setForm(null)} />
            </li>
          ) : (
            <li key={c.id} className="grid gap-1.5 rounded-lg border border-border/60 p-3">
              <p className="text-sm font-medium">{c.question}</p>
              <p className="text-xs text-muted-foreground">
                {describeSchedule(c.days, c.time)} ({c.tz}){c.paused ? " · paused" : nextLabel(c.next_run_at) ? ` · next ${nextLabel(c.next_run_at)}` : ""}
              </p>
              {canEdit && (
                <div className="flex flex-wrap items-center gap-1">
                  {confirming === c.id ? (
                    <>
                      <span className="text-xs text-muted-foreground">Delete it? Past answers stay in the channel.</span>
                      <Button size="sm" variant="ghost" className="h-7" onClick={() => setConfirming(null)}>
                        Keep
                      </Button>
                      <Button size="sm" variant="destructive" className="h-7" onClick={run(() => remove(c.id), "Check-in deleted")}>
                        Delete
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={run(() => askNow(c.id), "Asked in the channel")}>
                        Ask now
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setForm({ editing: c })}>
                        Edit
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        aria-label={c.paused ? "Resume the check-in" : "Pause the check-in"}
                        onClick={run(() => setPaused(c.id, !c.paused), c.paused ? "Check-in resumed" : "Check-in paused")}
                      >
                        {c.paused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7" aria-label="Delete the check-in" onClick={() => setConfirming(c.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </>
                  )}
                </div>
              )}
            </li>
          ),
        )}
      </ul>
    </section>
  )
}
