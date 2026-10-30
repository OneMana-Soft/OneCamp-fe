// Time on tasks: how people type a duration, how one reads, and the ranges a
// report covers. Pure, so the timer, the entry form and the report agree.

export interface TimeEntry {
  id: string
  task_uuid: string
  project_uuid: string
  user_id: string
  started_at: string
  ended_at: string | null
  note: string
  billable: boolean
}

export interface TimeEntryView extends TimeEntry {
  person: string
  seconds: number
  mine: boolean
}

export interface TimeLine {
  id: string
  name: string
  seconds: number
  billable_seconds: number
  /** With the project's rates (its admins only): what the billable time comes to, in minor units. */
  amount_cents?: number
  /** A person's line: the hourly rate they were charged at, in minor units. */
  rate_cents?: number
  /** A task's line: its billable time at each rate (people on different rates may share a task). */
  rated?: { rate_cents: number; billable_seconds: number }[]
}

export interface TimeReport {
  from: string
  to: string
  seconds: number
  billable_seconds: number
  entries: number
  running: number
  by_person: TimeLine[]
  by_task: TimeLine[]
  truncated: boolean
  /** With the project's rates (its admins only): the currency and what the billable time comes to. */
  currency?: string
  amount_cents?: number
}

// How people type and read a duration is lib/format/duration's, which a
// table's duration reads too.
export { formatDuration, parseDuration, parseWorkDuration } from "@/lib/format/duration"

/** A running timer's clock: "0:04:09", "1:20:00". */
export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  return `${h}:${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`
}

/** Hours to two places, as an invoice reads them. */
export const formatHours = (seconds: number) => (seconds / 3600).toFixed(2)

export type ReportPreset = "this-week" | "last-week" | "this-month" | "last-month" | "last-30"

export const REPORT_PRESETS: { value: ReportPreset; label: string }[] = [
  { value: "this-week", label: "This week" },
  { value: "last-week", label: "Last week" },
  { value: "this-month", label: "This month" },
  { value: "last-month", label: "Last month" },
  { value: "last-30", label: "Last 30 days" },
]

/** A preset as [from, to) in the viewer's own time; weeks start on Monday. */
export function presetRange(preset: ReportPreset, now: Date): { from: Date; to: Date } {
  const day = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const monday = new Date(day)
  monday.setDate(day.getDate() - ((day.getDay() + 6) % 7))
  const tomorrow = new Date(day)
  tomorrow.setDate(day.getDate() + 1)
  switch (preset) {
    case "this-week":
      return { from: monday, to: tomorrow }
    case "last-week": {
      const from = new Date(monday)
      from.setDate(monday.getDate() - 7)
      return { from, to: monday }
    }
    case "this-month":
      return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: tomorrow }
    case "last-month":
      return { from: new Date(now.getFullYear(), now.getMonth() - 1, 1), to: new Date(now.getFullYear(), now.getMonth(), 1) }
    case "last-30": {
      const from = new Date(tomorrow)
      from.setDate(tomorrow.getDate() - 30)
      return { from, to: tomorrow }
    }
  }
}
