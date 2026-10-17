"use client"

import * as React from "react"

import { cn } from "@/lib/utils/helpers/cn"

/*
 * THE DAY CELL (content.md C03), shared by the mini month, the date picker,
 * the booking month and the table calendar. 13/450 tabular in ink; hover is
 * --hover at r8; today is a 1.5 px brand RING with the number in brand-text
 * (never a fill: the accent marks today, not a choice); selected is an ink
 * fill with sheet text, because selecting isn't an action; outside the month
 * is ink-3, a day you can still pick (D-SD4: ink-4 never carries text
 * someone reads); disabled is ink-4. The date picker (components/ui/calendar.tsx)
 * takes these as react-day-picker classNames, and DayCell below is the same
 * cell for grids drawn by hand. A file of its own, so a grid drawn by hand
 * (the calendar's phone week strip, its mini month) doesn't bring the
 * picker's library.
 */
export const DAY_CELL_BASE =
  "relative inline-flex size-8 items-center justify-center rounded-lg p-0 text-ui-sm font-[450] tabular-nums text-ink outline-none transition-colors hover:bg-hover focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-pop aria-selected:opacity-100"
export const DAY_CELL_TODAY =
  "font-semibold text-brand-text before:pointer-events-none before:absolute before:left-1/2 before:top-1/2 before:size-[26px] before:-translate-x-1/2 before:-translate-y-1/2 before:rounded-full before:ring-[1.5px] before:ring-brand before:content-['']"
export const DAY_CELL_SELECTED = "bg-ink! text-sheet! hover:bg-ink! before:ring-0!"

export interface DayCellProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  date: Date
  today?: boolean
  selected?: boolean
  outside?: boolean
  /** Has events: a 4 px dot under the number (ink-3, or a hue's strong cut). */
  dot?: boolean | string
  /** 32 (mini month, picker) or 40 (the phone's week strip). */
  size?: 32 | 40
}

/** One day for a hand-drawn grid, with the same states as the picker's. */
export const DayCell = React.forwardRef<HTMLButtonElement, DayCellProps>(function DayCell(
  { date, today, selected, outside, dot, size = 32, className, disabled, ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      type="button"
      aria-current={today ? "date" : undefined}
      aria-pressed={selected || undefined}
      data-today={today || undefined}
      disabled={disabled}
      className={cn(
        DAY_CELL_BASE,
        size === 40 && "size-10",
        outside && "text-ink-3",
        disabled && "pointer-events-none text-ink-4",
        today && DAY_CELL_TODAY,
        selected && DAY_CELL_SELECTED,
        className
      )}
      {...rest}
    >
      {date.getDate()}
      {dot ? (
        <span
          aria-hidden="true"
          className={cn("absolute bottom-1 left-1/2 size-1 -translate-x-1/2 rounded-full", selected ? "bg-sheet" : typeof dot === "string" ? dot : "bg-ink-3")}
        />
      ) : null}
    </button>
  )
})
