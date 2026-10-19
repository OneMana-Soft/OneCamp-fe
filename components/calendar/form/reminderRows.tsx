"use client"

import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Bell, Plus, X } from "@/lib/icons"
import { inlineAdd, inlineChoice } from "@/lib/ui/fieldRow"
import { reminderChoices, reminderWords } from "@/lib/calendar/reminders"

/** Up to this many reminders for an event (the API's limit). */
export const MAX_REMINDERS = 5

/** What reminds the reader by default: 10 minutes before, or 09:00 the day before an all-day event (D-CAL-4). */
export const defaultReminders = (allDay: boolean) => (allDay ? [900] : [10])

/**
 * The reader's own reminders in the Event Form (calendar A5, FORM): one row
 * each, picked from the card's choices (an all-day event's are times of
 * day), with its way off at the row's end, and "Add a reminder" up to five.
 * With none of their own, the default's show, the value then the note
 * ("10 minutes before · your default"); a change makes them theirs.
 */
export function ReminderRows({ id, reminders, allDay, onChange }: { id?: string; reminders: number[] | null; allDay: boolean; onChange: (r: number[]) => void }) {
  const shown = reminders ?? defaultReminders(allDay)
  const set = (at: number, minutes: number) => onChange(shown.map((m, i) => (i === at ? minutes : m)))
  const unused = reminderChoices(shown, allDay).find((c) => c.minutes !== null && !shown.includes(c.minutes))
  return (
    <div className="grid gap-0.5" data-form-reminders="">
      {shown.length === 0 ? <p className="flex h-8 items-center text-ui-sm text-ink-3">No reminder</p> : null}
      {shown.map((m, i) => (
        <div key={`${i}-${m}`} className="flex min-w-0 items-center gap-1" data-form-reminder="">
          <Bell className="size-3.5 shrink-0 text-ink-3" aria-hidden="true" />
          <Select value={String(m)} onValueChange={(v) => set(i, Number(v))}>
            <SelectTrigger id={i === 0 ? id : undefined} className={inlineChoice} aria-label={`Reminder ${i + 1}`} dense>
              <SelectValue>
                {reminderWords(m, allDay)}
                {reminders === null && i === 0 ? <span className="text-ink-3"> · your default</span> : null}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {reminderChoices(shown, allDay)
                .filter((c) => c.minutes !== null && (c.minutes === m || !shown.includes(c.minutes)))
                .map((c) => (
                  <SelectItem key={c.minutes} value={String(c.minutes)}>
                    {c.label}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          <button
            type="button"
            aria-label="Remove reminder"
            title="Remove reminder"
            onClick={() => onChange(shown.filter((_, j) => j !== i))}
            className="ml-auto shrink-0 rounded-sm p-0.5 text-ink-3 outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-brand"
            data-touch-target=""
          >
            <X className="size-3.5" aria-hidden="true" />
          </button>
        </div>
      ))}
      {shown.length < MAX_REMINDERS && unused?.minutes != null ? (
        <Button type="button" variant="ghost" size="sm" className={inlineAdd + " w-fit"} onClick={() => onChange([...shown, unused.minutes as number])}>
          <Plus className="size-3.5" aria-hidden="true" />
          Add a reminder
        </Button>
      ) : null}
    </div>
  )
}
