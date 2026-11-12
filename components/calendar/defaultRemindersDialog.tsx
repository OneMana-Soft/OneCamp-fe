"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { ResponsiveDialog } from "@/components/ui/responsive-dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { ReminderRows } from "@/components/calendar/form/reminderRows"
import { defaultRemindersFor, type ReminderDefaults, type ReminderSet } from "@/lib/calendar/reminders"

/** The reader's preferences as read: every calendar's defaults as kept (calendar.default_reminders), or the read's state. */
export type DefaultsRead = { all: unknown } | "loading" | "failed"

/**
 * A calendar's default reminders for the reader (calendar head A, gcal-5):
 * for its timed events and its all-day ones, each a pop-up or an email, set
 * with the Event Form's rows. They remind of every event on it the reader set
 * none for, and only the reader. On a phone it is the shared sheet, Save
 * pinned at its foot. Its chunk takes no data: the caller reads and saves
 * (onSave says why a save was refused, or null). It opens at once: rows of
 * skeleton while the preferences are read, and Try again if that read failed.
 */
export default function DefaultRemindersDialog({
  calendar,
  read,
  onRetry,
  onSave,
  onClose,
}: {
  /** "mine" for the reader's own calendar and their invitations, else a calendar's id. */
  calendar: { id: string; name: string }
  read: DefaultsRead
  onRetry: () => void
  onSave: (next: ReminderDefaults) => Promise<string | null>
  onClose: () => void
}) {
  const start = (all: unknown, allDay: boolean): ReminderSet => {
    const d = defaultRemindersFor(all, calendar.id, allDay)
    return { minutes: d.minutes, email: d.email }
  }
  // What the reader changed; until then, what was kept (the read may land after the dialog opens).
  const [edited, setEdited] = useState<{ timed: ReminderSet; allDay: ReminderSet } | null>(null)
  const sets = edited ?? (typeof read === "object" ? { timed: start(read.all, false), allDay: start(read.all, true) } : null)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState("")
  const save = async () => {
    if (!sets) return
    setBusy(true)
    const why = await onSave({ timed: sets.timed, all_day: sets.allDay })
    setBusy(false)
    if (why) setProblem(why)
    else onClose()
  }
  const part = (label: string, whole: boolean) => (
    <section className="grid gap-1" data-default-reminders={whole ? "all-day" : "timed"}>
      <h3 className="text-meta font-medium text-ink-2">{label}</h3>
      {sets ? (
        <ReminderRows
          reminders={(whole ? sets.allDay : sets.timed).minutes}
          email={(whole ? sets.allDay : sets.timed).email ?? []}
          allDay={whole}
          note=""
          onChange={(minutes, email) => setEdited({ ...sets, [whole ? "allDay" : "timed"]: { minutes, email } })}
        />
      ) : (
        <div className="grid gap-1.5 py-1" aria-hidden="true">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-6 w-32" />
        </div>
      )}
    </section>
  )
  return (
    <ResponsiveDialog
      title="Default reminders"
      description={`For events in ${calendar.name} that have no reminders of their own. Only you get them.`}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void save()} busy={busy} disabled={!sets}>
            Save
          </Button>
        </>
      }
    >
      <div className="grid gap-4" aria-busy={read === "loading" || undefined}>
        {read === "failed" && !sets ? (
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-meta text-danger-ink" role="alert">
              Your reminders couldn&apos;t be read.
            </p>
            <Button variant="ghost" size="sm" onClick={onRetry}>
              Try again
            </Button>
          </div>
        ) : (
          <>
            {part("Events", false)}
            {part("All-day events", true)}
          </>
        )}
        {problem ? (
          <p className="text-meta text-danger-ink" role="alert">
            {problem}
          </p>
        ) : null}
      </div>
    </ResponsiveDialog>
  )
}
