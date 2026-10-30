"use client"

import * as React from "react"

import { cn } from "@/lib/utils/helpers/cn"
import { DateField, TimeField, hhmm, minutesOf } from "@/components/ui/date-field"

/** "yyyy-MM-ddTHH:mm" (a datetime-local box's value) as its day and its time. */
function splitDateTime(value: string | undefined): [day: string, time: string] {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(value ?? "")
  return m ? [m[1], m[2]] : ["", ""]
}

/**
 * A day and a time as one value, "yyyy-MM-ddTHH:mm", or "" until both are
 * set. On min's own day a time at or before min's moves on to the first
 * quarter hour after it, so a day moved to today never keeps a time that has
 * passed. Pure.
 */
export function joinDateTime(day: string, time: string, min?: string): string {
  if (!day || !time) return ""
  const [minDay, minTime] = splitDateTime(min)
  const t = minutesOf(time)
  const m = minutesOf(minTime)
  if (day === minDay && t !== null && m !== null && t <= m) {
    const next = (Math.floor(m / 15) + 1) * 15
    if (next < 24 * 60) return `${day}T${hhmm(next)}`
  }
  return `${day}T${time}`
}

const HALVES = ["Date", "Time"] as const

/**
 * A DATE AND A TIME, in place of the browser's datetime-local box (D14): the
 * shared DateField and TimeField (components/ui/date-field), nothing of its
 * own, so each half opens the one date or time picker, by its field on a
 * computer or a tablet, and on a phone as a panel of the sheet it is in or a
 * sheet of its own. One value, "yyyy-MM-ddTHH:mm" in local time (the box's,
 * toLocalInputValue), with `min` and `max` of the same form: days outside
 * them can't be picked, and on min's day the times start after it. A moment
 * is asked for, so neither half clears. Side by side from 288px, where
 * "Wed 21 Oct 2026" and "12:45 PM" fit whole; stacked in a narrower popover
 * (Pause's, Schedule send's, the composer's menu), where the day was cut.
 *
 *   DateTimeField (role=group, aria-label | aria-labelledby)
 *   ├── DateField  labels[0], "Date"
 *   └── TimeField  labels[1], "Time"
 */
export function DateTimeField({
  value,
  onChange,
  min,
  max,
  labels = HALVES,
  dense,
  disabled,
  className,
  ...aria
}: {
  value: string
  onChange: (value: string) => void
  min?: string
  max?: string
  /** Each half's name, and its picker's title on a phone ("Clears on", "Clears at"). */
  labels?: readonly [day: string, time: string]
  dense?: boolean
  disabled?: boolean
  className?: string
  "aria-label"?: string
  "aria-labelledby"?: string
  "aria-describedby"?: string
  "aria-invalid"?: boolean
}) {
  const [day, time] = splitDateTime(value)
  // A half picked before the other waits here until both are set.
  const [held, setHeld] = React.useState<[string, string]>([day, time])
  const d = day || held[0]
  const t = time || held[1]
  const [minDay, minTime] = splitDateTime(min)
  // A day moved to min's carries its time along, so that time may have passed;
  // a time picked or typed is taken as it is, and the caller's rule says why.
  const pick = (nd: string, nt: string, clampTo?: string) => {
    setHeld([nd, nt])
    onChange(joinDateTime(nd, nt, clampTo))
  }
  const half = { dense, disabled, required: true, "aria-describedby": aria["aria-describedby"], "aria-invalid": aria["aria-invalid"] }
  return (
    <div
      role="group"
      aria-label={aria["aria-labelledby"] ? undefined : aria["aria-label"]}
      aria-labelledby={aria["aria-labelledby"]}
      data-slot="date-time-field"
      className={cn("@container/dt min-w-0", className)}
    >
      <div className="grid gap-2 @[18rem]/dt:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <DateField {...half} aria-label={labels[0]} value={d} min={minDay || undefined} max={splitDateTime(max)[0] || undefined} onChange={(nd) => pick(nd, t, min)} />
        <TimeField {...half} aria-label={labels[1]} value={t} after={d && d === minDay ? minTime : undefined} onChange={(nt) => pick(d, nt)} />
      </div>
    </div>
  )
}
