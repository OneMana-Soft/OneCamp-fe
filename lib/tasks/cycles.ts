/** Cycles (Linear's sprints) on the client: names, dates and progress. Pure. */

import { shortDate } from "@/lib/utils/date/dateWords"
import { localDay } from "@/lib/utils/timeZone"

export type CycleState = "upcoming" | "current" | "ended" | "completed"

export interface Cycle {
  id: string
  project_uuid: string
  number: number
  name: string
  starts_at: string
  ends_at: string
  completed_at?: string
  done_count?: number
  carried_count?: number
  progress?: { total: number; started: number; done: number }
  state?: CycleState
  /** Set by hand, in minutes; else the project's. */
  capacity_minutes?: number
  /** Set by hand in points, when the project estimates in points (linear-05). */
  capacity_points?: number
}

export const cycleLabel = (c: Pick<Cycle, "number" | "name">) => c.name || `Cycle ${c.number}`

/** "5 Oct to 18 Oct": the last day shown is the day before it ends at midnight.
 * Day first, as every date in the task lists, and words rather than an en dash. */
export function cycleDates(c: Pick<Cycle, "starts_at" | "ends_at">): string {
  const last = new Date(new Date(c.ends_at).getTime() - 1)
  return `${shortDate(new Date(c.starts_at))} to ${shortDate(last)}`
}

/** Share done, 0–100. */
export const percentDone = (p?: { total: number; done: number }) => (p && p.total > 0 ? Math.round((p.done / p.total) * 100) : 0)

/** "3 d left", "Ends today", "Starts in 2 d", or "Ended": how the cycle stands in time. Pure. */
export function timeLeft(c: Pick<Cycle, "starts_at" | "ends_at" | "completed_at">, now = Date.now()): string {
  if (c.completed_at) return "Completed"
  const day = 86_400_000
  const start = Date.parse(c.starts_at)
  const end = Date.parse(c.ends_at)
  if (now < start) return `Starts in ${Math.max(1, Math.ceil((start - now) / day))} d`
  const left = Math.ceil((end - now) / day)
  if (left < 0) return "Ended"
  if (left === 0) return "Ends today"
  return `${left} d left`
}

/** Cycles a task can join: not completed, the current one first. */
export function openCycles(cycles: Cycle[]): Cycle[] {
  const rank: Record<string, number> = { current: 0, ended: 1, upcoming: 2 }
  return cycles.filter((c) => c.state !== "completed" && !c.completed_at).sort((a, b) => (rank[a.state ?? "upcoming"] ?? 3) - (rank[b.state ?? "upcoming"] ?? 3) || a.number - b.number)
}

/**
 * The cycles under way, the one ending first first: those running now, and
 * with `ended`, those past their end not yet completed. Two or more run at
 * once only in a project that runs cycles side by side (jira-04 C).
 */
export function runningCycles<C extends Cycle>(cycles: C[], ended = false): C[] {
  return cycles
    .filter((c) => !c.completed_at && (c.state === "current" || (ended && c.state === "ended")))
    .sort((a, b) => Date.parse(a.ends_at) - Date.parse(b.ends_at) || a.number - b.number)
}

/** Where completing c carries its unfinished tasks, as the server's nextCycle: the first
 * open cycle after it sharing no days with it (never one running beside it), or a new one. */
export function carryTarget<C extends Cycle>(cycles: C[], c: Cycle): C | undefined {
  const [s, e] = [Date.parse(c.starts_at), Date.parse(c.ends_at)]
  return cycles.filter((x) => x.number > c.number && !x.completed_at && !(Date.parse(x.starts_at) < e && s < Date.parse(x.ends_at))).sort((a, b) => a.number - b.number)[0]
}

/** Where a new cycle starts: the day the last one ends, or today. */
export function nextStart(cycles: Cycle[], today: Date = new Date()): string {
  const last = cycles.reduce<Date | null>((m, c) => {
    const e = new Date(c.ends_at)
    return !m || e > m ? e : m
  }, null)
  return localDay(last && last > today ? last : today)
}

/** The task-list filter that shows one cycle. */
export const cycleFilter = (id: string) => ({ id: "task_cycle", value: [id] })
