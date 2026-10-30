"use client"

import * as React from "react"

import { cn } from "@/lib/utils/helpers/cn"
import { clockTime } from "@/lib/utils/date/clock"

/**
 * The time now, on a time grid (content.md C08): the brand, never the
 * destructive red.
 *
 * - In today's column, a 1.5 px brand line with a 7 px disc at its left edge,
 *   ringed in the sheet; the disc breathes very gently.
 * - Across the week's other columns, a 1 px brand line at 30 %, so the time
 *   reads across the whole week (Notion Calendar).
 * - In the gutter, the time in an 18 px brand pill, which hides the hour label
 *   it overlaps.
 *
 * It sits by transform (translateY) and moves once a minute with no animation
 * of its own: a position change, not motion. The timeline reuses it.
 */
export interface NowLineProps {
  /** From the grid's top: px, or a CSS length (the week's calc() on its hour). */
  top: number | string
  /** Width of the time gutter, px (the pill sits in it). */
  gutter: number
  /** Number of day columns, and which is today (-1 for none). */
  columns: number
  todayIndex: number
  now: Date
  className?: string
}

export function NowLine({ top, gutter, columns, todayIndex, now, className }: NowLineProps) {
  const col = 100 / Math.max(columns, 1)
  return (
    <div
      aria-hidden="true"
      data-now-line=""
      className={cn("pointer-events-none absolute inset-x-0 top-0 z-[25] h-0", className)}
      style={{ transform: `translateY(${typeof top === "number" ? `${top}px` : top})` }}
    >
      <span
        data-now-pill=""
        className="absolute flex h-[18px] -translate-y-1/2 items-center rounded-[5px] bg-brand px-1 text-micro font-semibold tabular-nums text-brand-foreground"
        style={{ right: `calc(100% - ${gutter - 4}px)` }}
      >
        {/* The axis beside it says AM or PM: the pill says the time alone. */}
        {clockTime(now, { bare: true })}
      </span>
      <div className="absolute top-0 h-0" style={{ left: gutter, right: 0 }}>
        {/* Faint across the week. */}
        <span className="absolute inset-x-0 top-0 h-px -translate-y-1/2 bg-brand/30" />
        {todayIndex >= 0 ? (
          <span
            data-now-today=""
            className="absolute top-0 h-[1.5px] -translate-y-1/2 bg-brand"
            style={{ left: `${todayIndex * col}%`, width: `${col}%` }}
          >
            <span className="now-disc absolute -left-[3.5px] top-1/2 size-[7px] -translate-y-1/2 rounded-full bg-brand ring-2 ring-sheet" />
          </span>
        ) : null}
      </div>
    </div>
  )
}

/** The time now, a minute at a time, on the minute. */
export function useMinute(): Date {
  const [now, setNow] = React.useState(() => new Date())
  React.useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined
    // Line up with the minute, then tick every minute.
    const first = setTimeout(() => {
      setNow(new Date())
      interval = setInterval(() => setNow(new Date()), 60_000)
    }, 60_000 - (Date.now() % 60_000))
    return () => {
      clearTimeout(first)
      if (interval) clearInterval(interval)
    }
  }, [])
  return now
}
