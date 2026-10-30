/**
 * A rule's time (package 9 R3; the server's business/Workflow schedule.go and
 * due.go). A schedule is one of the repeat rules the builder offers, written
 * as the RFC 5545 text the server reads with the calendar's recurrence
 * engine, at a time of day in the rule's zone. A due trigger fires a number
 * of days before a task's due day, or the day after it, at a time of day.
 * Said in the app's words, on the reader's clock. Pure.
 */

import { WEEK, dayName, type Weekday } from "@/lib/calendar/repeat"
import { clockTime } from "@/lib/utils/date/clock"

export type RepeatKind = "daily" | "weekdays" | "weekly" | "monthly"

export interface Repeat {
  kind: RepeatKind
  /** Weekly: the days, Monday first. */
  days: Weekday[]
  /** Monthly: the day of the month, 1 to 31, or -1 for its last day. */
  monthDay: number
}

const WORKING: Weekday[] = ["MO", "TU", "WE", "TH", "FR"]

/** A new schedule: every Monday. */
export const MONDAYS: Repeat = { kind: "weekly", days: ["MO"], monthDay: 1 }

/** The repeat a rule's text says; one the builder doesn't make reads as every Monday. */
export function repeatOf(rule: string | undefined): Repeat {
  const parts = Object.fromEntries(
    (rule ?? "")
      .replace(/^RRULE:/i, "")
      .split(";")
      .map((p) => p.split("="))
      .filter((kv) => kv.length === 2)
      .map(([k, v]) => [k.trim().toUpperCase(), v.trim().toUpperCase()]),
  )
  if (parts.FREQ === "DAILY") return { kind: "daily", days: [], monthDay: 1 }
  if (parts.FREQ === "MONTHLY") {
    const d = Number(parts.BYMONTHDAY)
    return { kind: "monthly", days: [], monthDay: d === -1 || (d >= 1 && d <= 31) ? d : 1 }
  }
  if (parts.FREQ === "WEEKLY") {
    const days = WEEK.filter((d) => (parts.BYDAY ?? "").split(",").includes(d))
    if (days.length === 5 && WORKING.every((d) => days.includes(d))) return { kind: "weekdays", days, monthDay: 1 }
    if (days.length) return { kind: "weekly", days, monthDay: 1 }
  }
  return { ...MONDAYS }
}

/** The text the server keeps for a repeat. */
export function ruleOf(r: Repeat): string {
  switch (r.kind) {
    case "daily":
      return "FREQ=DAILY"
    case "weekdays":
      return `FREQ=WEEKLY;BYDAY=${WORKING.join(",")}`
    case "monthly":
      return `FREQ=MONTHLY;BYMONTHDAY=${r.monthDay === -1 ? -1 : Math.min(31, Math.max(1, Math.round(r.monthDay) || 1))}`
    case "weekly": {
      const days = WEEK.filter((d) => r.days.includes(d))
      return `FREQ=WEEKLY;BYDAY=${(days.length ? days : ["MO"]).join(",")}`
    }
  }
}

/** 1st, 2nd, 3rd, 4th … 21st, 22nd, 31st. */
export function ordinal(n: number): string {
  const tens = n % 100
  if (tens >= 11 && tens <= 13) return `${n}th`
  return `${n}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`
}

function listed(items: string[]) {
  if (items.length <= 1) return items.join("")
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`
}

/** A wall-clock time ("09:00") on the reader's clock: "9:00 AM", "09:00". */
export function atTime(at: string | undefined): string {
  const t = at || "09:00"
  return clockTime(t) || t
}

/** When a schedule runs, in a sentence: "every Monday at 9:00 AM", "on the last day of every month at 6:00 PM". */
export function scheduleText(rule: string | undefined, at: string | undefined): string {
  const r = repeatOf(rule)
  const time = `at ${atTime(at)}`
  switch (r.kind) {
    case "daily":
      return `every day ${time}`
    case "weekdays":
      return `every weekday ${time}`
    case "monthly":
      return `on the ${r.monthDay === -1 ? "last day" : ordinal(r.monthDay)} of every month ${time}`
    case "weekly":
      if (r.days.length === 7) return `every day ${time}`
      return `every ${listed(r.days.map(dayName))} ${time}`
  }
}

/** When a due trigger fires, in a sentence: "a task is due tomorrow", "a task becomes overdue". */
export function dueText(trigger: "task_due_soon" | "task_overdue", days: number | undefined): string {
  if (trigger === "task_overdue") return "a task becomes overdue"
  const n = Math.max(0, Math.round(days ?? 1))
  return n === 0 ? "a task is due today" : n === 1 ? "a task is due tomorrow" : `a task is due in ${n} days`
}
