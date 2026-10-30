import type { CampHue } from "@/lib/campHue"

/** Your week (calendar B3, gcal-new-time-insights): GET /calendar/insights, the asker's own. Pure. */
export interface WeekInsights {
  from: string
  to: string
  meeting_minutes: number
  one_on_one_minutes: number
  group_minutes: number
  meetings: number
  average_meeting_minutes: number
  focus_minutes: number
  own_minutes: number
  away_minutes: number
  has_hours: boolean
  working_minutes: number
  free_minutes: number
  to_answer: number
  usual_meeting_minutes: number
  people: { user_uuid: string; name: string; minutes: number; meetings: number }[]
}

export function yourWeekPath(weekStart: Date): string {
  const to = new Date(weekStart)
  to.setDate(to.getDate() + 7)
  return `/calendar/insights?from=${encodeURIComponent(weekStart.toISOString())}&to=${encodeURIComponent(to.toISOString())}`
}

/** 150 -> "2h 30m", 45 -> "45m", 0 -> "0m". */
export function hm(minutes: number): string {
  const m = Math.max(0, Math.round(minutes))
  const h = Math.floor(m / 60)
  const r = m % 60
  if (!h) return `${r}m`
  return r ? `${h}h ${r}m` : `${h}h`
}

/** This week's meetings beside the usual week, in words; null when there's no usual week yet. */
export function usualWords(w: Pick<WeekInsights, "meeting_minutes" | "usual_meeting_minutes">): string | null {
  if (!w.usual_meeting_minutes) return null
  const d = w.meeting_minutes - w.usual_meeting_minutes
  if (Math.abs(d) < 30) return "About your usual week"
  return `${hm(Math.abs(d))} ${d > 0 ? "more" : "less"} than usual`
}

export interface WeekPart {
  key: "one" | "group" | "focus" | "own" | "free"
  label: string
  minutes: number
  hue?: CampHue
}

/** The bar's parts, in order, only those with time: meetings one to one, in groups, focus, on your own, free. */
export function weekParts(w: WeekInsights): WeekPart[] {
  const parts: WeekPart[] = [
    { key: "one", label: "1:1 meetings", minutes: w.one_on_one_minutes, hue: "sky" },
    { key: "group", label: "Group meetings", minutes: w.group_minutes, hue: "dusk" },
    { key: "focus", label: "Focus", minutes: w.focus_minutes, hue: "moss" },
    { key: "own", label: "On your own", minutes: w.own_minutes, hue: "sun" },
    { key: "free", label: "Free working time", minutes: w.has_hours ? w.free_minutes : 0 },
  ]
  return parts.filter((p) => p.minutes > 0)
}
