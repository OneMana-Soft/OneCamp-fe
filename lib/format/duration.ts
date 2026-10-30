// A duration as people type it and read it, on a task and in a table's duration
// cell (whose seconds are durationSeconds.ts's). Pure.

/**
 * Minutes from what a person types: "1h 30m", "1h30", "90m", "90", "1.5h",
 * "1:30". A bare number is minutes. Null when it can't be read or is not
 * between a minute and maxMinutes (a day, unless said: an estimate allows more).
 */
export function parseDuration(input: string, maxMinutes = 24 * 60): number | null {
  const s = input.trim().toLowerCase().replace(/\s+/g, " ")
  if (!s) return null
  let minutes: number | null = null
  let m: RegExpMatchArray | null
  if ((m = s.match(/^(\d{1,2}):([0-5]\d)$/))) minutes = Number(m[1]) * 60 + Number(m[2])
  else if ((m = s.match(/^(\d+(?:\.\d+)?)\s*h(?:ours?|rs?)?$/))) minutes = Math.round(Number(m[1]) * 60)
  else if ((m = s.match(/^(\d+)\s*h(?:ours?|rs?)?\s*(\d+)\s*m?(?:in(?:ute)?s?)?$/))) minutes = Number(m[1]) * 60 + Number(m[2])
  else if ((m = s.match(/^(\d+)\s*m(?:in(?:ute)?s?)?$/)) || (m = s.match(/^(\d+)$/))) minutes = Number(m[1])
  if (minutes === null || !Number.isFinite(minutes) || minutes < 1 || minutes > maxMinutes) return null
  return minutes
}

/** parseDuration for work (an estimate, a capacity): a bare number is hours. */
export function parseWorkDuration(input: string, maxMinutes: number): number | null {
  const t = input.trim()
  return parseDuration(/^\d+(\.\d+)?$/.test(t) ? `${t}h` : t, maxMinutes)
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
