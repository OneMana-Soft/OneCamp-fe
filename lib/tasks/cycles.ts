/** Cycles (Linear's sprints) on the client: names, dates and progress. Pure. */

import { localDay } from "@/lib/utils/timeZone"
import type { NormalizedChart, NormalizedSeries } from "@/lib/utils/chartSpec"

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

// ─── Burndown and velocity ────────────────────────────────────────────────
// GET /project/{p}/cycles/{c}/burndown: a cycle's work by day in the reader's
// zone, and what the project's latest completed cycles finished.

/** Scope and remaining run only to today (or the day the cycle was
 * completed); ideal covers every day. Hour series are null unless a task has an estimate. */
export interface Burndown {
  days: string[]
  scope: number[]
  remaining: number[]
  ideal: number[]
  scope_hours?: number[] | null
  remaining_hours?: number[] | null
  ideal_hours?: number[] | null
  tasks: number
  done: number
  open: number
  estimated: number
  /** The cycle's estimates added up. */
  hours: number
}

export interface CycleDone {
  id: string
  number: number
  name: string
  done: number
  done_hours: number
  unfinished: number
}

export interface Velocity {
  cycles: CycleDone[]
  typical?: number
  typical_hours?: number
}

export interface BurndownView {
  cycle: Cycle
  burndown: Burndown
  velocity: Velocity
}

export type BurndownUnit = "tasks" | "hours"

const dayLabel = (day: string) => new Date(`${day}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short" })

/** The series for a unit: hours only when the cycle has them. */
function unitSeries(b: Burndown, unit: BurndownUnit) {
  const hours = unit === "hours" && !!b.remaining_hours && !!b.scope_hours && !!b.ideal_hours
  return {
    hours,
    remaining: hours ? b.remaining_hours! : b.remaining,
    scope: hours ? b.scope_hours! : b.scope,
    ideal: hours ? b.ideal_hours! : b.ideal,
  }
}

/** The burndown as a line chart: the ideal pace as a dashed guide, the scope
 * when it changed during the cycle, and the work remaining up to today. */
export function burndownChart(b: Burndown, unit: BurndownUnit): NormalizedChart {
  const { hours, remaining, scope, ideal } = unitSeries(b, unit)
  const pad = (v: number[]) => [...v, ...Array(Math.max(b.days.length - v.length, 0)).fill(0)]
  const series: NormalizedSeries[] = [{ name: "Ideal pace", values: ideal, dashed: true }]
  if (new Set(scope).size > 1) series.push({ name: "In the cycle", values: pad(scope), upTo: scope.length })
  series.push({ name: "Still to do", values: pad(remaining), upTo: remaining.length })
  return { type: "line", title: "Still to do each day, against an even pace", unit: hours ? "Hours" : "Tasks", labels: b.days.map(dayLabel), series }
}

/** What each recent completed cycle finished, as bars. */
export function velocityChart(v: Velocity, unit: BurndownUnit): NormalizedChart {
  const hours = unit === "hours" && v.typical_hours !== undefined
  return {
    type: "bar",
    title: hours ? "Hours done in each completed cycle" : "Tasks done in each completed cycle",
    labels: v.cycles.map((c) => cycleLabel(c)),
    series: [{ name: hours ? "Hours done" : "Tasks done", values: v.cycles.map((c) => (hours ? c.done_hours : c.done)) }],
  }
}

const amount = (n: number, hours: boolean) => (hours ? `${Math.round(n * 10) / 10} h` : `${n} ${n === 1 ? "task" : "tasks"}`)

/** Where the cycle stands against the ideal pace, in a sentence, or null
 * before it has started. Whether anything is left is counted in tasks: a task
 * with no estimate is still work, whatever the hours say. */
export function paceNote(b: Burndown, unit: BurndownUnit, state?: CycleState): string | null {
  const { remaining, ideal, hours } = unitSeries(b, unit)
  const today = remaining.length - 1
  if (today < 0 || state === "upcoming") return null
  if (state === "completed") return b.open === 0 ? "Completed with everything done." : `Completed with ${amount(b.open, false)} unfinished.`
  if (b.open === 0) return "Everything in it is done."
  const left = remaining[today]
  if (hours && left === 0) return `${amount(b.open, false)} left, none of them estimated.`
  const target = hours ? Math.round(ideal[today] * 10) / 10 : Math.round(ideal[today])
  const when = state === "ended" ? "by its end" : "by today"
  return left <= target
    ? `On pace: ${amount(left, hours)} left, and the ideal pace has ${amount(target, hours)} ${when}.`
    : `Behind pace: ${amount(left, hours)} left, where the ideal pace has ${amount(target, hours)} ${when}.`
}

/** How the cycle's load compares with what recent cycles finished, or null
 * when there's nothing to compare with. */
export function loadNote(b: Burndown, v: Velocity, unit: BurndownUnit): string | null {
  const hours = unit === "hours" && v.typical_hours !== undefined && !!b.scope_hours
  const typical = hours ? v.typical_hours : v.typical
  if (typical === undefined || v.cycles.length === 0) return null
  const n = Math.min(v.cycles.length, 3)
  const load = hours ? b.hours : b.tasks
  const finished = n === 1 ? `The last cycle finished ${amount(typical, hours)}` : `The last ${n} cycles finished ${amount(typical, hours)} on average`
  return `${finished}; this one holds ${amount(load, hours)}.`
}

