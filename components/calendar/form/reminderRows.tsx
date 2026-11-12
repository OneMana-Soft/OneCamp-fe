"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Bell, Plus, X } from "@/lib/icons"
import { inlineAdd, inlineChoice } from "@/lib/ui/fieldRow"
import { CUSTOM_UNITS, customMinutes, customOf, keepEmail, reminderChoices, reminderWords, type CustomUnit } from "@/lib/calendar/reminders"

/** Up to this many reminders for an event (the API's limit). */
export const MAX_REMINDERS = 5

/** What reminds the reader by default: 10 minutes before, or 09:00 the day before an all-day event (D-CAL-4). */
export const defaultReminders = (allDay: boolean) => (allDay ? [900] : [10])

/**
 * The reader's own reminders: one row each,
 * picked from the card's choices (an all-day event's are times of day) or,
 * for a timed event, a custom count of minutes, hours, days or weeks up to
 * four weeks; each a pop-up or an email; "Add a reminder" up to five. With
 * none of their own, their default's show, the value then the note
 * ("10 minutes before · your default"); a change makes them theirs. Where
 * the row has no room for the note (a phone), it drops out whole, never cut,
 * and the open menu says it ("Your default: 10 minutes before"). The same
 * rows set a calendar's defaults (defaultRemindersDialog).
 */
export function ReminderRows({
  id,
  reminders,
  email,
  defaults,
  allDay,
  onChange,
  note = "your default",
}: {
  id?: string
  reminders: number[] | null
  email: number[]
  /** What shows while reminders is null, and which of it comes by email. */
  defaults?: { minutes: number[]; email: number[] }
  allDay: boolean
  onChange: (reminders: number[], email: number[]) => void
  /** The words after the first of the default's ("your default"); none when "". */
  note?: string
}) {
  const shown = reminders ?? defaults?.minutes ?? defaultReminders(allDay)
  const mail = reminders === null ? (defaults?.email ?? []) : email
  const [custom, setCustom] = useState<number | null>(null)
  const emit = (next: number[], byEmail: number[]) => onChange(next, keepEmail(byEmail, next))
  const set = (at: number, minutes: number) =>
    emit(
      shown.map((m, i) => (i === at ? minutes : m)),
      mail.map((m) => (m === shown[at] ? minutes : m)),
    )
  // The default's note, on the first row while the reader has none of their own.
  const noted = (i: number) => reminders === null && i === 0 && note !== ""
  const unused = reminderChoices(shown, allDay).find((c) => c.minutes !== null && !shown.includes(c.minutes))
  return (
    <div className="grid gap-0.5" data-form-reminders="">
      {shown.length === 0 ? <p className="flex h-8 items-center text-ui-sm text-ink-3">No reminder</p> : null}
      {shown.map((m, i) => (
        <div key={`${i}-${m}`} className="grid gap-0.5">
          <div className="flex min-w-0 items-center gap-1" data-form-reminder="">
            <Bell className="size-3.5 shrink-0 text-ink-3" aria-hidden="true" />
            <Select value={String(m)} onValueChange={(v) => (v === "custom" ? setCustom(i) : set(i, Number(v)))}>
              <SelectTrigger id={i === 0 ? id : undefined} className={inlineChoice + " min-w-0"} aria-label={`Reminder ${i + 1}`} dense>
                <SelectValue>
                  {/* One line: a note with no room wraps to a second, hidden, line, so it drops out whole. */}
                  <span className="flex h-[1lh] min-w-0 flex-wrap overflow-hidden" data-reminder-value="">
                    <span className="min-w-0 truncate">{reminderWords(m, allDay)}</span>
                    {noted(i) ? <span className="whitespace-pre text-ink-3" data-reminder-note=""> · {note}</span> : null}
                  </span>
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {noted(i) ? <SelectLabel className="text-ink-3">{`${note.charAt(0).toUpperCase()}${note.slice(1)}: ${reminderWords(m, allDay)}`}</SelectLabel> : null}
                  {reminderChoices(shown, allDay)
                    .filter((c) => c.minutes !== null && (c.minutes === m || !shown.includes(c.minutes)))
                    .map((c) => (
                      <SelectItem key={c.minutes} value={String(c.minutes)}>
                        {c.label}
                      </SelectItem>
                    ))}
                  {allDay ? null : <SelectItem value="custom">Custom…</SelectItem>}
                </SelectGroup>
              </SelectContent>
            </Select>
            <Select value={mail.includes(m) ? "email" : "popup"} onValueChange={(way) => emit(shown, way === "email" ? [...mail, m] : mail.filter((x) => x !== m))}>
              <SelectTrigger className={inlineChoice + " shrink-0"} aria-label={`Reminder ${i + 1} comes as`} dense>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="popup">Pop-up</SelectItem>
                <SelectItem value="email">Email</SelectItem>
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label="Remove reminder"
              title="Remove reminder"
              onClick={() => emit(shown.filter((_, j) => j !== i), mail)}
              className="ml-auto shrink-0 text-ink-3 hover:text-ink"
            >
              <X className="size-3.5" aria-hidden="true" />
            </Button>
          </div>
          {custom === i ? (
            <CustomReminder
              minutes={m}
              taken={shown.filter((_, j) => j !== i)}
              onDone={(minutes) => {
                setCustom(null)
                if (minutes !== null) set(i, minutes)
              }}
            />
          ) : null}
        </div>
      ))}
      {shown.length < MAX_REMINDERS && unused?.minutes != null ? (
        <Button type="button" variant="ghost" size="sm" className={inlineAdd + " w-fit"} onClick={() => emit([...shown, unused.minutes as number], mail)}>
          <Plus className="size-3.5" aria-hidden="true" />
          Add a reminder
        </Button>
      ) : null}
    </div>
  )
}

/** A custom reminder: a count and its unit, up to four weeks before; Set, or Cancel (null). */
function CustomReminder({ minutes, taken, onDone }: { minutes: number; taken: number[]; onDone: (minutes: number | null) => void }) {
  const start = customOf(minutes)
  const [count, setCount] = useState(String(start.count))
  const [unit, setUnit] = useState<CustomUnit>(start.unit)
  const at = count.trim() === "" ? null : customMinutes(Number(count), unit)
  const problem = at === null ? "Up to 4 weeks before, in whole numbers." : taken.includes(at) ? "That's already a reminder." : ""
  return (
    <div className="flex flex-wrap items-center gap-1 pl-4.5" data-custom-reminder="">
      <Input
        type="number"
        inputMode="numeric"
        min={0}
        aria-label="How many"
        value={count}
        onChange={(e) => setCount(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !problem) {
            e.preventDefault()
            onDone(at)
          }
        }}
        className="h-8 w-20"
        autoFocus
      />
      <Select value={unit} onValueChange={(u) => setUnit(u as CustomUnit)}>
        <SelectTrigger className={inlineChoice} aria-label="Unit" dense>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {CUSTOM_UNITS.map((u) => (
            <SelectItem key={u.unit} value={u.unit}>
              {u.unit} before
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button type="button" size="sm" disabled={!!problem} onClick={() => onDone(at)}>
        Set
      </Button>
      <Button type="button" size="sm" variant="ghost" onClick={() => onDone(null)}>
        Cancel
      </Button>
      {problem ? (
        <p className="w-full text-meta text-danger-ink" role="alert">
          {problem}
        </p>
      ) : null}
    </div>
  )
}
