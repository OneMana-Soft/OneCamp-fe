/** Cycles (Linear's sprints) on the client: names, dates and progress. Pure. */

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
}

export const cycleLabel = (c: Pick<Cycle, "number" | "name">) => c.name || `Cycle ${c.number}`

/** "Oct 5 – Oct 18": the last day shown is the day before it ends at midnight. */
export function cycleDates(c: Pick<Cycle, "starts_at" | "ends_at">): string {
  const f = (d: Date) => d.toLocaleDateString(undefined, { month: "short", day: "numeric" })
  const last = new Date(new Date(c.ends_at).getTime() - 1)
  return `${f(new Date(c.starts_at))} – ${f(last)}`
}

/** Share done, 0–100. */
export const percentDone = (p?: { total: number; done: number }) => (p && p.total > 0 ? Math.round((p.done / p.total) * 100) : 0)

/** Cycles a task can join: not completed, the current one first. */
export function openCycles(cycles: Cycle[]): Cycle[] {
  const rank: Record<string, number> = { current: 0, ended: 1, upcoming: 2 }
  return cycles.filter((c) => c.state !== "completed" && !c.completed_at).sort((a, b) => (rank[a.state ?? "upcoming"] ?? 3) - (rank[b.state ?? "upcoming"] ?? 3) || a.number - b.number)
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
