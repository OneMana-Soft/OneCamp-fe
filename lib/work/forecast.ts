/**
 * A project's forecast (linear-20): when its open work lands, from the pace
 * its tasks got done at over the last four weeks and from what that work
 * waits on, so a late task on the critical path moves the date. The read: GET
 * /project/{p}/forecast?tz=, over the work the reader may see. Dates are days
 * ("2026-11-18") in the reader's zone. Pure apart from the path: the words
 * the header's chip and its card say.
 */
import { formatDay } from "@/lib/tasks/fields"
import { count } from "@/lib/utils/count"

/** A late task on the critical path: open past its due day. external: another project's, named by it. */
export interface ForecastHold {
  task_uuid: string
  task_name: string
  external: boolean
  project_name?: string
  days_late: number
}

export interface ProjectForecast {
  project_uuid: string
  /** forecast: it has a date; done: every task is finished; starting: nothing to go on yet. */
  state: "forecast" | "done" | "starting"
  date: string | null
  optimistic: string | null
  pessimistic: string | null
  by_pace: string | null
  by_links: string | null
  /** What is open, in the unit the pace is counted in. */
  open: number
  unit: "points" | "tasks"
  per_week: number
  weeks: number
  held_by: ForecastHold[]
  /** How many late tasks hold it up: held_by names the first few. */
  held_count: number
  /**
   * Only when the project has more open tasks than one read of its plan
   * keeps: how many it has as the reader may see them (total), and of how
   * many the date follows what they wait on (counted). Its pace and open work
   * count every one.
   */
  open_cut?: { total: number; counted: number }
}

export interface ForecastAnswer {
  data: ProjectForecast
}


export const forecastPath = (projectId: string) => `/project/${projectId}/forecast`

/** The forecast's date, when it has one: a project done, or with nothing to go on yet, has none to say. */
export const forecastDay = (f: ProjectForecast | undefined): string | null => (f?.state === "forecast" && f.date ? f.date : null)

/** Whether a project's open work lands after a day ("2026-11-20"): its goal's date, say. */
export function landsAfter(f: ProjectForecast | undefined, day: string | undefined): boolean {
  const lands = forecastDay(f)
  return !!lands && !!day && lands > day
}

/** The chip's words: "Lands ~18 Nov". */
export const landsWords = (day: string, now?: Date) => `Lands ~${formatDay(day, now)}`

/** The pace's range, optimistic to pessimistic: "15 Nov – 29 Nov"; null when the pace gives none. */
export function rangeWords(f: ProjectForecast, now?: Date): string | null {
  if (!f.optimistic || !f.pessimistic || f.optimistic === f.pessimistic) return null
  return `${formatDay(f.optimistic, now)} – ${formatDay(f.pessimistic, now)}`
}

const counted = (n: number, unit: "points" | "tasks") => (unit === "points" ? count(n, "point", "points") : count(n, "task", "tasks"))

/** "4.5 points a week over the last 4 weeks, 12 points open". */
export function paceWords(f: ProjectForecast): string {
  const pace = Math.round(f.per_week * 10) / 10
  return `${counted(pace, f.unit)} a week over the last ${f.weeks} weeks, ${counted(Math.round(f.open * 10) / 10, f.unit)} open`
}

/** A late task holding the date up: "Design review, 3 days late", or "… in Marketing" for another project's. */
export function holdWords(h: ForecastHold): string {
  const late = h.days_late === 1 ? "1 day late" : `${h.days_late} days late`
  return h.external && h.project_name ? `${h.task_name} in ${h.project_name}, ${late}` : `${h.task_name}, ${late}`
}

/**
 * What the card says when the date follows what only some of the project's
 * open tasks wait on, from the server's numbers and in the order its read
 * keeps them; null otherwise. Both numbers through the one count.
 */
export function openCutWords(f: ProjectForecast): string | null {
  if (!f.open_cut) return null
  const { total, counted: followed } = f.open_cut
  const waiting = count(followed, "of them waits", "of them wait")
  return `This project has ${count(total, "open task", "open tasks")}, so the date follows what ${waiting} on, the soonest due first; its pace and open work count them all.`
}

/** Whether what the work waits on, not the pace, sets the date: the links land later than the pace. */
export const heldUp = (f: ProjectForecast): boolean => f.held_by.length > 0 && !!f.by_links && (!f.by_pace || f.by_links > f.by_pace)
