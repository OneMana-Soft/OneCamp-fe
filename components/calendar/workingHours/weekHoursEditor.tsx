"use client"

import type { ReactNode } from "react"
import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"
import { TimeField, minutesOf } from "@/components/ui/date-field"
import { clockTime } from "@/lib/utils/date/clock"
import { Plus, X } from "@/lib/icons"
import { MAX_SPANS, copiedToWorkdays, withDay, withNewSpan, withSpan, withoutSpan, type Week } from "@/lib/calendar/workingHours"

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
// A range's end as its TimeField writes it, in the person's clock.
const words = (v: string, m = minutesOf(v) ?? 0) => clockTime(new Date(2000, 0, 1, Math.floor(m / 60), m % 60))

/**
 * A week of hours, each day on or off with its ranges (several a day), in the
 * order the week starts: a person's working hours (profile) and a project's
 * business clock for its SLAs (linear-24 W2). Every change goes to onWeek.
 * readOnly draws the week as words, for someone who reads it but can't change
 * it: no switches, fields or buttons (CR-346 F5). Below sm a day's switch and
 * name sit on their own row and its ranges take the full width beneath, so a
 * range reads from -> until on one line in a phone's drawer (CR-346 F6).
 */
export function WeekHoursEditor({
  week,
  order,
  onWeek,
  readOnly,
  switchLabel = (day) => `Work on ${day}s`,
}: {
  week: Week
  order: number[]
  onWeek: (next: Week) => void
  readOnly?: boolean
  /** A day's switch, by the day's name: a booking page says "Open on Mondays" (gcal-7). */
  switchLabel?: (dayName: string) => string
}) {
  if (readOnly) {
    return (
      <dl className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-x-2 gap-y-1.5 text-ui-sm">
        {order.map((day) => {
          const spans = week[String(day)] ?? []
          return (
            <div key={day} className="contents" data-hours-day={day}>
              <dt className={spans.length ? "text-ink" : "text-ink-3"}>{DAY_NAMES[day]}</dt>
              <dd className={spans.length ? "text-ink-2" : "text-ink-3"}>{spans.length ? spans.map((s) => `${words(s.start)} → ${words(s.end)}`).join(", ") : "Off"}</dd>
            </div>
          )
        })}
      </dl>
    )
  }
  return (
    <>
      {order.map((day) => (
        <DayHours
          key={day}
          hours={week}
          k={String(day)}
          name={DAY_NAMES[day]}
          switchLabel={switchLabel(DAY_NAMES[day])}
          onToggle={(on) => onWeek(withDay(week, day, on))}
          onChange={onWeek}
          data-hours-day={String(day)}
        />
      ))}
      <div className="flex items-center gap-3 pt-1">
        <Button type="button" size="sm" variant="ghost" className="-ml-2 text-ink-2" onClick={() => onWeek(copiedToWorkdays(week, order.find((d) => (week[String(d)] ?? []).length) ?? 1))}>
          Copy {DAY_NAMES[order.find((d) => (week[String(d)] ?? []).length) ?? 1]}&apos;s hours to every working day
        </Button>
      </div>
    </>
  )
}

/**
 * One day's row: on or off, its name, its ranges (each changed, added or taken
 * away) and what follows it (a booking page date's Remove, gcal-7). `hours`
 * holds every day's ranges and `k` is this day's key in it: a weekday's number
 * in a week, a date's YYYY-MM-DD in a booking page's dates of its own. The
 * week above, a person's working hours, a project's SLA clock and a booking
 * page's dates all draw their days with it.
 */
export function DayHours({
  hours,
  k,
  name,
  switchLabel,
  offWord = "Off",
  onToggle,
  onChange,
  after,
  ...rest
}: {
  hours: Week
  k: string
  name: string
  switchLabel: string
  offWord?: string
  onToggle: (on: boolean) => void
  onChange: (next: Week) => void
  after?: ReactNode
} & Record<`data-${string}`, string>) {
  const spans = hours[k] ?? []
  const on = spans.length > 0
  return (
    <div
      className={
        after
          ? "grid grid-cols-[2.25rem_minmax(0,1fr)_auto_auto] items-start gap-x-2 py-1 sm:grid-cols-[2.25rem_6.5rem_minmax(0,1fr)_auto]"
          : "grid grid-cols-[2.25rem_minmax(0,1fr)_auto] items-start gap-x-2 py-1 sm:grid-cols-[2.25rem_6.5rem_minmax(0,1fr)]"
      }
      {...rest}
    >
      <Switch className="mt-1.5" checked={on} onCheckedChange={(v) => onToggle(v === true)} aria-label={switchLabel} />
      <span className={on ? "flex h-8 items-center text-ui-sm text-ink" : "flex h-8 items-center text-ui-sm text-ink-3"}>{name}</span>
      {on ? (
        <div className="col-span-full grid gap-1 sm:col-span-1">
          {spans.map((s, i) => (
            <div key={i} className="flex flex-wrap items-center gap-1.5" data-touch-group="">
              <TimeField bare className="h-8 w-[88px]" aria-label={`${name}: from`} value={s.start} onChange={(v) => onChange(withSpan(hours, k, i, { ...s, start: v }))} />
              <span aria-hidden="true" className="text-sm text-ink-3">
                →
              </span>
              <TimeField bare className="h-8 w-[88px]" aria-label={`${name}: until`} since={s.start} value={s.end} onChange={(v) => onChange(withSpan(hours, k, i, { ...s, end: v }))} />
              {spans.length > 1 ? (
                <Button type="button" size="icon-sm" variant="ghost" aria-label={`Remove ${name}'s range`} title="Remove range" onClick={() => onChange(withoutSpan(hours, k, i))}>
                  <X />
                </Button>
              ) : null}
              {i === spans.length - 1 && spans.length < MAX_SPANS ? (
                <Button type="button" size="icon-sm" variant="ghost" aria-label={`Add a range on ${name}`} title="Add a range" onClick={() => onChange(withNewSpan(hours, k))}>
                  <Plus />
                </Button>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <span className="flex h-8 items-center text-ui-sm text-ink-3">{offWord}</span>
      )}
      {/* Row one's last column at every width: below sm a day's ranges take the full row beneath. */}
      {after ? <span className="col-start-4 row-start-1 flex">{after}</span> : null}
    </div>
  )
}
