import { Clock } from "@/lib/icons"
import { shortDate } from "@/lib/utils/date/shortDate"
import { cn } from "@/lib/utils/helpers/cn"

/** A stored date as a Date, or null when there is none (empty, the zero epoch, unreadable). */
export function dueDateOf(value: string | Date | null | undefined): Date | null {
  if (!value) return null
  if (typeof value === "string" && (value.startsWith("0001-01-01") || value.startsWith("1970-01-01"))) return null
  const d = value instanceof Date ? value : new Date(value)
  return Number.isNaN(d.getTime()) || d.getFullYear() < 1971 ? null : d
}

const DAY = 24 * 60 * 60 * 1000
const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()

/** Whole calendar days from today to d: 0 today, 1 tomorrow, -1 yesterday. */
export function daysFromToday(d: Date, now: Date = new Date()): number {
  return Math.round((startOf(d) - startOf(now)) / DAY)
}

/** "Today", "Tomorrow", "Yesterday" within a day; else "14 Oct", or "14 Oct 2027" in another year. */
export function dueWords(d: Date, now: Date = new Date()): string {
  const days = daysFromToday(d, now)
  if (days === 0) return "Today"
  if (days === 1) return "Tomorrow"
  if (days === -1) return "Yesterday"
  return shortDate(d, now)
}

export type DueState = "none" | "today" | "overdue" | "upcoming" | "done"

export function dueState(value: string | Date | null | undefined, done = false, now: Date = new Date()): DueState {
  const d = dueDateOf(value)
  if (!d) return "none"
  if (done) return "done"
  const days = daysFromToday(d, now)
  return days === 0 ? "today" : days < 0 ? "overdue" : "upcoming"
}

/**
 * A due date as design v3 writes it (work.md W05): 12.5/16 tabular ink-2;
 * relative words within a day; "Today" as the one tinted chip a row may have
 * (sun); overdue as danger-ink text, with a 12 px clock on a card and a danger
 * chip in the panel; a done task's date in ink-3, with no colour at all.
 */
export function DueLabel({
  date,
  done = false,
  variant = "row",
  now,
  className,
}: {
  date: string | Date | null | undefined
  done?: boolean
  variant?: "row" | "card" | "panel"
  now?: Date
  className?: string
}) {
  const d = dueDateOf(date)
  if (!d) return null
  const state = dueState(d, done, now)
  const words = dueWords(d, now)
  const base = "inline-flex shrink-0 items-center whitespace-nowrap tabular-nums text-2xs"
  if (state === "today") {
    return (
      <span data-due="today" className={cn(base, "h-5 rounded-sm bg-camp-sun-tint px-1.5 text-3xs font-[510] text-camp-sun-ink", className)}>
        {variant === "panel" ? "Due today" : words}
      </span>
    )
  }
  if (state === "overdue") {
    if (variant === "panel") {
      return (
        <span data-due="overdue" className={cn(base, "h-5 rounded-sm bg-destructive/10 px-1.5 text-3xs font-[510] text-danger-ink", className)}>
          {words === "Yesterday" ? "Due yesterday" : "Overdue"}
        </span>
      )
    }
    return (
      <span data-due="overdue" className={cn(base, "gap-1 text-danger-ink", className)}>
        {variant === "card" && <Clock className="size-3" aria-hidden="true" />}
        {words}
      </span>
    )
  }
  return (
    <span data-due={state} className={cn(base, state === "done" ? "text-ink-3" : "text-ink-2", className)}>
      {words}
    </span>
  )
}

/** A start and due date as the panel shows them: "8 Oct → 10 Oct". */
export function dueRangeWords(start: string | Date | null | undefined, due: string | Date | null | undefined, now: Date = new Date()): string {
  const s = dueDateOf(start)
  const d = dueDateOf(due)
  if (s && d) return `${shortDate(s, now)} → ${shortDate(d, now)}`
  if (d) return shortDate(d, now)
  if (s) return `From ${shortDate(s, now)}`
  return ""
}
