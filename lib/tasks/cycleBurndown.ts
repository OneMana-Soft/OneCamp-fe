/** A cycle's burndown and the project's velocity on the client, as charts and notes. Pure. */

import { shortDate } from "@/lib/utils/date/dateWords"
import type { NormalizedChart, NormalizedSeries } from "@/lib/utils/chartSpec"
import { pointsText } from "@/lib/work/points"
import { cycleLabel, type Cycle, type CycleState } from "@/lib/tasks/cycles"

// GET /project/{p}/cycles/{c}/burndown: a cycle's work by day in the reader's
// zone, and what the project's latest completed cycles finished.

/** Scope and remaining run only to today (or the day the cycle was
 * completed); ideal covers every day. Hour series are null unless a task has
 * an estimate, and point series unless the project estimates in points. */
export interface Burndown {
  days: string[]
  scope: number[]
  remaining: number[]
  ideal: number[]
  scope_hours?: number[] | null
  remaining_hours?: number[] | null
  ideal_hours?: number[] | null
  scope_points?: number[] | null
  remaining_points?: number[] | null
  ideal_points?: number[] | null
  tasks: number
  done: number
  open: number
  estimated: number
  /** The cycle's estimates added up. */
  hours: number
  /** Its tasks with points, and what they all count as (a task with none as the scale says). */
  pointed?: number
  points?: number
}

export interface CycleDone {
  id: string
  number: number
  name: string
  done: number
  done_hours: number
  done_points?: number
  unfinished: number
}

export interface Velocity {
  cycles: CycleDone[]
  typical?: number
  typical_hours?: number
  typical_points?: number
}

export interface BurndownView {
  cycle: Cycle
  burndown: Burndown
  velocity: Velocity
}

export type BurndownUnit = "tasks" | "hours" | "points"

const UNIT_NAMES: Record<BurndownUnit, string> = { tasks: "Tasks", hours: "Hours", points: "Points" }

const dayLabel = (day: string) => shortDate(new Date(`${day}T00:00:00`))

/** The series for a unit, and the unit they're in: hours only when the cycle has them, points only when its project counts them. */
function unitSeries(b: Burndown, unit: BurndownUnit): { unit: BurndownUnit; remaining: number[]; scope: number[]; ideal: number[] } {
  if (unit === "hours" && b.remaining_hours && b.scope_hours && b.ideal_hours) return { unit, remaining: b.remaining_hours, scope: b.scope_hours, ideal: b.ideal_hours }
  if (unit === "points" && b.remaining_points && b.scope_points && b.ideal_points) return { unit, remaining: b.remaining_points, scope: b.scope_points, ideal: b.ideal_points }
  return { unit: "tasks", remaining: b.remaining, scope: b.scope, ideal: b.ideal }
}

/** The units a cycle's burndown can be counted in: tasks, hours when a task has an estimate, points when the project counts them. */
export const burndownUnits = (b: Burndown): BurndownUnit[] => [
  "tasks",
  ...(b.estimated > 0 && b.scope_hours ? (["hours"] as const) : []),
  ...(b.scope_points ? (["points"] as const) : []),
]

/** The burndown as a line chart: the ideal pace as a dashed guide, the scope
 * when it changed during the cycle, and the work remaining up to today. */
export function burndownChart(b: Burndown, unit: BurndownUnit): NormalizedChart {
  const { unit: shown, remaining, scope, ideal } = unitSeries(b, unit)
  const pad = (v: number[]) => [...v, ...Array(Math.max(b.days.length - v.length, 0)).fill(0)]
  const series: NormalizedSeries[] = [{ name: "Ideal pace", values: ideal, dashed: true }]
  if (new Set(scope).size > 1) series.push({ name: "In the cycle", values: pad(scope), upTo: scope.length })
  series.push({ name: "Still to do", values: pad(remaining), upTo: remaining.length })
  return { type: "line", title: "Still to do each day, against an even pace", unit: UNIT_NAMES[shown], labels: b.days.map(dayLabel), series }
}

/** What each recent completed cycle finished, as bars. */
export function velocityChart(v: Velocity, unit: BurndownUnit): NormalizedChart {
  const shown = velocityUnit(v, unit)
  const done = (c: CycleDone) => (shown === "hours" ? c.done_hours : shown === "points" ? (c.done_points ?? 0) : c.done)
  return {
    type: "bar",
    title: `${UNIT_NAMES[shown]} done in each completed cycle`,
    labels: v.cycles.map((c) => cycleLabel(c)),
    series: [{ name: `${UNIT_NAMES[shown]} done`, values: v.cycles.map(done) }],
  }
}

/** The unit velocity can say: hours or points only when its cycles counted them. */
function velocityUnit(v: Velocity, unit: BurndownUnit): BurndownUnit {
  if (unit === "hours" && v.typical_hours !== undefined) return "hours"
  if (unit === "points" && v.typical_points !== undefined) return "points"
  return "tasks"
}

const amount = (n: number, unit: BurndownUnit) =>
  unit === "hours" ? `${Math.round(n * 10) / 10} h` : unit === "points" ? pointsText(n) : `${n} ${n === 1 ? "task" : "tasks"}`

/** Where the cycle stands against the ideal pace, in a sentence, or null
 * before it has started. Whether anything is left is counted in tasks: a task
 * with no estimate is still work, whatever the hours say. */
export function paceNote(b: Burndown, unit: BurndownUnit, state?: CycleState): string | null {
  const { remaining, ideal, unit: shown } = unitSeries(b, unit)
  const today = remaining.length - 1
  if (today < 0 || state === "upcoming") return null
  if (state === "completed") return b.open === 0 ? "Completed with everything done." : `Completed with ${amount(b.open, "tasks")} unfinished.`
  if (b.open === 0) return "Everything in it is done."
  const left = remaining[today]
  if (shown !== "tasks" && left === 0) return `${amount(b.open, "tasks")} left, none of them estimated.`
  const target = shown === "tasks" ? Math.round(ideal[today]) : Math.round(ideal[today] * 10) / 10
  const when = state === "ended" ? "by its end" : "by today"
  return left <= target
    ? `On pace: ${amount(left, shown)} left, and the ideal pace has ${amount(target, shown)} ${when}.`
    : `Behind pace: ${amount(left, shown)} left, where the ideal pace has ${amount(target, shown)} ${when}.`
}

/** How the cycle's load compares with what recent cycles finished, or null
 * when there's nothing to compare with. */
export function loadNote(b: Burndown, v: Velocity, unit: BurndownUnit): string | null {
  const shown = velocityUnit(v, unitSeries(b, unit).unit)
  const typical = shown === "hours" ? v.typical_hours : shown === "points" ? v.typical_points : v.typical
  if (typical === undefined || v.cycles.length === 0) return null
  const n = Math.min(v.cycles.length, 3)
  const load = shown === "hours" ? b.hours : shown === "points" ? (b.points ?? 0) : b.tasks
  const finished = n === 1 ? `The last cycle finished ${amount(typical, shown)}` : `The last ${n} cycles finished ${amount(typical, shown)} on average`
  return `${finished}; this one holds ${amount(load, shown)}.`
}
