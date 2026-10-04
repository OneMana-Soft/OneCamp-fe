/**
 * Recurring tasks: the rule the server keeps (RRULE-lite, as its scheduler
 * reads it) as a form a person fills in, and back as a sentence. Pure.
 */

export type Freq = "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY"
export type RepeatMode = "schedule" | "completion"

export interface RepeatSpec {
  freq: Freq
  interval: number
  /** Weekly on a schedule only: "MO".."SU". */
  days: string[]
  mode: RepeatMode
}

export interface TaskRecurrence {
  task_uuid: string
  rule: string
  mode: RepeatMode
}

export const WEEKDAYS: { code: string; short: string; long: string }[] = [
  { code: "MO", short: "M", long: "Mon" },
  { code: "TU", short: "T", long: "Tue" },
  { code: "WE", short: "W", long: "Wed" },
  { code: "TH", short: "T", long: "Thu" },
  { code: "FR", short: "F", long: "Fri" },
  { code: "SA", short: "S", long: "Sat" },
  { code: "SU", short: "S", long: "Sun" },
]

const UNIT: Record<Freq, string> = { DAILY: "day", WEEKLY: "week", MONTHLY: "month", YEARLY: "year" }

export function parseRule(rule: string, mode: RepeatMode = "schedule"): RepeatSpec | null {
  const parts = Object.fromEntries(
    rule
      .split(";")
      .map((s) => s.split("="))
      .filter((kv) => kv.length === 2)
      .map(([k, v]) => [k.trim().toUpperCase(), v.trim().toUpperCase()]),
  )
  const freq = parts.FREQ as Freq
  if (!(freq in UNIT)) return null
  const interval = Math.max(1, Number(parts.INTERVAL) || 1)
  const days = parts.BYDAY ? WEEKDAYS.map((d) => d.code).filter((c) => parts.BYDAY.split(",").includes(c)) : []
  return { freq, interval, days, mode }
}

export function buildRule(spec: RepeatSpec): string {
  let rule = `FREQ=${spec.freq}`
  const n = Math.min(365, Math.max(1, Math.round(spec.interval) || 1))
  if (n > 1) rule += `;INTERVAL=${n}`
  if (spec.freq === "WEEKLY" && spec.mode === "schedule" && spec.days.length > 0) {
    rule += `;BYDAY=${WEEKDAYS.map((d) => d.code).filter((c) => spec.days.includes(c)).join(",")}`
  }
  return rule
}

/** "Every week on Mon, Thu", "Every 2 months", "3 days after it's done". */
export function describeRepeat(spec: RepeatSpec): string {
  const unit = UNIT[spec.freq]
  const every = spec.interval === 1 ? unit : `${spec.interval} ${unit}s`
  if (spec.mode === "completion") return `${spec.interval === 1 ? `1 ${unit}` : every} after it's done`
  const on =
    spec.freq === "WEEKLY" && spec.days.length > 0
      ? ` on ${spec.days.length === 5 && !spec.days.includes("SA") && !spec.days.includes("SU") ? "weekdays" : WEEKDAYS.filter((d) => spec.days.includes(d.code)).map((d) => d.long).join(", ")}`
      : ""
  return `Every ${every}${on}`
}
