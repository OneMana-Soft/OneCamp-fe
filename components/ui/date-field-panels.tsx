"use client"

import * as React from "react"
import { format, isValid, parse } from "date-fns"

import { clockTime } from "@/lib/utils/date/clock"
import { parseEventText } from "@/lib/calendar/parseEventText"
import { Calendar } from "@/components/ui/calendar"
import { TimeList } from "@/components/ui/date-time-picker"
import { buttonVariants } from "@/components/ui/button"
import { DAY_CELL_BASE } from "@/components/ui/dayCell"
import { cn } from "@/lib/utils/helpers/cn"
import { ix } from "@/lib/ui/interactive"
import { fieldKeyDown } from "@/lib/keys/ime"

/**
 * The month in a sheet: the sheet's width, a finger's 44px a day and 44px
 * arrows. It was the computer's 280px month centred in a 390px slab, its days
 * 32px, which read as a card floating in the sheet (ANALYSIS.md §1.5).
 */
const SHEET_MONTH = {
  months: "flex flex-col",
  month: "w-full space-y-2",
  caption: "relative flex h-11 items-center justify-center",
  nav_button: cn(buttonVariants({ variant: "ghost" }), "size-11 p-0 text-ink-3 hover:text-ink"),
  nav_button_previous: "absolute left-0",
  nav_button_next: "absolute right-0",
  table: "w-full border-collapse",
  head_row: "flex w-full",
  head_cell: "flex-1 text-micro font-medium text-ink-3",
  row: "mt-0.5 flex w-full",
  cell: "relative flex h-11 flex-1 items-center justify-center p-0 text-center focus-within:relative",
  day: cn(DAY_CELL_BASE, "size-11 text-ui"),
}

/**
 * What the date and time fields (components/ui/date-field) open: the date
 * picker, and the time box over the quarter-hour list. A module of its own,
 * loaded when a field first opens, so a page with a date field doesn't carry
 * the picker until someone wants it.
 */

/** The days the picker offers first (work.md W29): the dates people pick most. */
const QUICK_DAYS = [
  { label: "Today", days: 0 },
  { label: "Tomorrow", days: 1 },
  { label: "Next week", days: 7 },
]

/** Formats a typed date may take, day first as every date the app writes; month first only where day first can't be. No year is this year. */
const TYPED = ["d/M/yyyy", "yyyy-M-d", "d MMM yyyy", "d MMMM yyyy", "MMM d, yyyy", "M/d/yyyy", "d/M", "M/d"]

/**
 * A date typed: "15/10/2026", "2026-10-15", "15 Oct 2026", "Oct 15, 2026", or
 * the words the calendar reads ("tomorrow", "next fri", "15 Oct"). Undefined
 * when it isn't one. Pure: `now` is passed in.
 */
export function typedDate(text: string, now: Date = new Date()): Date | undefined {
  const t = text.trim()
  if (!t) return undefined
  for (const f of TYPED) {
    const d = parse(t, f, now)
    if (isValid(d) && d.getFullYear() >= 1900 && d.getFullYear() <= 2200) return d
  }
  return parseEventText(t, now).date
}

/**
 * THE DATE PICKER (INTERACTION_SPEC D14): one panel for every date the app
 * asks for, a form's field (DateField), a task's or a goal's (DateProperty)
 * and a list's bulk bar alike:
 *   - a date typed, read as it is typed with the day it makes under it, and
 *     taken with Enter;
 *   - the quick days, Today, Tomorrow and Next week, where they can be picked;
 *   - the month, in the shared day cell (components/ui/calendar), bounded by
 *     `from` and `to`;
 *   - Clear, where the date may be empty and has one.
 * Under a finger the box, the quick days and Clear are 44px, and the quick
 * days 16px apart, so no tap lands on a neighbour.
 */
export function DatePanel({ day, from, to, clearable, sheet, onPick, onClear }: { day?: Date; from?: Date; to?: Date; clearable: boolean; sheet?: boolean; onPick: (d: Date) => void; onClear: () => void }) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const inRange = (d: Date) => (!from || d >= from) && (!to || d <= to)
  const [text, setText] = React.useState("")
  const typed = React.useMemo(() => typedDate(text), [text])
  const root = React.useRef<HTMLDivElement>(null)
  // The day takes the focus a moment after the picker opens, once what holds
  // it (a popover, a sheet) has its focus scope: the month's own initialFocus
  // ran first, inside the popover before its scope was up, and a dialog round
  // the field pulled the focus back and the popover closed (each open after
  // the first, once the panel's chunk was in).
  React.useEffect(() => {
    const t = window.setTimeout(() => {
      const day = root.current?.querySelector<HTMLElement>('button[name="day"][tabindex="0"]')
      // Into the month, from wherever the opening left it (the popover's own
      // first focus is the typed-date box).
      if (day && !day.closest('[role="grid"]')?.contains(document.activeElement)) day.focus({ preventScroll: true })
    }, 0)
    return () => window.clearTimeout(t)
  }, [])
  const quick = QUICK_DAYS.map((q) => {
    const d = new Date(today)
    d.setDate(d.getDate() + q.days)
    return { ...q, day: d }
  }).filter((q) => inRange(q.day))
  return (
    <div ref={root} data-date-panel="" className={cn("flex flex-col", sheet && "w-full")}>
      <div className={sheet ? "px-4 pt-2" : "px-3 pt-3"}>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          // An input method's Enter picks its word, never the date (lib/keys/ime).
          onKeyDown={fieldKeyDown((e) => {
            if (e.key === "Enter" && typed && inRange(typed)) {
              e.preventDefault()
              onPick(typed)
            }
          })}
          placeholder="Type a date, like 15/10 or tomorrow"
          aria-label="Type a date"
          className="field-surface h-8 w-full rounded-md px-2.5 text-ui-sm text-ink max-sm:text-base pointer-coarse:h-11"
        />
        {typed ? (
          <p className="mt-1 px-0.5 text-meta tabular-nums text-ink-3" aria-live="polite">
            {format(typed, "EEE d MMM yyyy")} · {inRange(typed) ? "press Enter" : "out of range"}
          </p>
        ) : null}
      </div>
      {quick.length ? (
        <div role="group" aria-label="Quick days" className={cn("flex pt-2", sheet ? "gap-2 px-4" : "flex-wrap gap-1.5 px-3 pointer-coarse:gap-4")}>
          {quick.map((q) => (
            // In a sheet, the row's width shared, a finger's 44px, as "Clear after"'s chips.
            <button key={q.label} type="button" {...ix("chip")} onClick={() => onPick(q.day)} className={sheet ? "hub-chip-rest inline-flex h-11 flex-1 items-center justify-center rounded-[22px] text-meta font-medium text-ink" : "chip h-6 pointer-coarse:h-11 pointer-coarse:px-3"}>
              {q.label}
            </button>
          ))}
        </div>
      ) : null}
      <Calendar
        mode="single"
        selected={day}
        onSelect={(d) => d && onPick(d)}
        defaultMonth={day ?? (to && to < today ? to : from && from > today ? from : today)}
        disabled={[...(from ? [{ before: from }] : []), ...(to ? [{ after: to }] : [])]}
        weekStartsOn={1}
        className={sheet ? "px-3 pb-1 pt-3" : undefined}
        classNames={sheet ? SHEET_MONTH : undefined}
      />
      {clearable && day ? (
        <div className="flex justify-end border-t border-line px-2 py-1.5">
          <button type="button" {...ix("button")} onClick={onClear} className="h-7 rounded-md px-2.5 text-ui-sm text-ink-2 pointer-coarse:h-11 pointer-coarse:px-4">
            Clear
          </button>
        </div>
      ) : null}
    </div>
  )
}

/**
 * THE TIME PICKER: a time typed, read as it is typed, over the quarter hours.
 * In a phone's sheet (`sheet`) the box stays at the top of the sheet's one
 * scroller and the hours flow under it, 44px each.
 */
export function TimePanel({ minutes, since, after, sheet, onPick }: { minutes: number | null; since?: number; after?: number; sheet?: boolean; onPick: (minutes: number) => void }) {
  const [text, setText] = React.useState("")
  const typed = React.useMemo(() => (text.trim() ? parseEventText(text).startMinutes : undefined), [text])
  return (
    <>
      <div className={sheet ? "sticky top-0 z-[1] bg-pop px-3 pb-1.5 pt-1" : "px-2 pt-2"}>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={fieldKeyDown((e) => {
            if (e.key === "Enter" && typed !== undefined) {
              e.preventDefault()
              onPick(typed)
            }
          })}
          placeholder="Type a time, like 9:30"
          aria-label="Type a time"
          className="field-surface h-8 w-full rounded-md px-2.5 text-ui-sm text-ink max-sm:text-base pointer-coarse:h-11"
        />
        {typed !== undefined ? (
          <p className="mt-1 px-0.5 text-meta text-ink-3">{clockTime(new Date(2000, 0, 1, Math.floor(typed / 60), typed % 60))} · press Enter</p>
        ) : null}
      </div>
      <TimeList value={minutes} onPick={onPick} since={since} after={after} flow={sheet} className={sheet ? "px-2 pb-2" : "mt-1 border-t border-line"} />
    </>
  )
}
