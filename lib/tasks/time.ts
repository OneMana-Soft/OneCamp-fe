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
}

/**
 * Minutes from what a person types: "1h 30m", "1h30", "90m", "90", "1.5h",
 * "1:30". A bare number is minutes. Null when it can't be read or is not
 * between a minute and a day.
 */
export function parseDuration(input: string): number | null {
  const s = input.trim().toLowerCase().replace(/\s+/g, " ")
  if (!s) return null
  let minutes: number | null = null
  let m: RegExpMatchArray | null
  if ((m = s.match(/^(\d{1,2}):([0-5]\d)$/))) minutes = Number(m[1]) * 60 + Number(m[2])
  else if ((m = s.match(/^(\d+(?:\.\d+)?)\s*h(?:ours?|rs?)?$/))) minutes = Math.round(Number(m[1]) * 60)
  else if ((m = s.match(/^(\d+)\s*h(?:ours?|rs?)?\s*(\d+)\s*m?(?:in(?:ute)?s?)?$/))) minutes = Number(m[1]) * 60 + Number(m[2])
  else if ((m = s.match(/^(\d+)\s*m(?:in(?:ute)?s?)?$/)) || (m = s.match(/^(\d+)$/))) minutes = Number(m[1])
  if (minutes === null || !Number.isFinite(minutes) || minutes < 1 || minutes > 24 * 60) return null
  return minutes
}

/** A duration as people read it: "45m", "2h", "1h 05m". Under a minute is "0m". */
export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds / 60))
  const h = Math.floor(total / 60)
  const m = total % 60
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${String(m).padStart(2, "0")}m`
}

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
