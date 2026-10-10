/**
 * Goals (business/Goal on the server): an outcome the team is after by a
 * date, with one owner. Progress is worked out on the server, from the
 * projects that serve the goal, its sub-goals, or a number; check-ins say
 * where it stands. Pure helpers, for their test.
 */
import { displayNameOf, matchesPerson } from "@/lib/personName"
import type { Ending, Health } from "@/lib/projectUpdates"
import { daysSince } from "@/lib/utils/relativeTime"

export type Measure = "projects" | "subgoals" | "number"
export type GoalStatus = "open" | Ending

export interface GoalOwner {
  user_uuid: string
  user_full_name?: string
  user_name?: string
  user_profile_object_key?: string
}

export interface GoalSummary {
  id: string
  title: string
  owner: GoalOwner
  start_date?: string
  due_date: string
  measure: Measure
  start_value?: number
  target_value?: number
  current_value?: number
  unit?: string
  /** 0 to 1; null when there is nothing to measure yet. */
  progress: number | null
  /** Where an open goal would be by now if it moved evenly over its time. */
  expected?: number
  /** The latest check-in's health (or ending); none before the first. */
  health?: Health | Ending
  checked_in_at?: string
  status: GoalStatus
  closed_at?: string
  parent_id?: string
  projects: number
  subgoals: number
  can_edit: boolean
  created_at: string
}

export interface GoalProjectLine {
  project_uuid: string
  project_name: string
  open: number
  done: number
  overdue: number
  progress: number | null
  health?: Health
  updated_at?: string
  archived?: boolean
}

export interface GoalCheckIn {
  id: string
  goal_id: string
  author_uuid: string
  author_name: string
  health: Health | Ending
  body: string
  value?: number
  progress?: number
  created_at: string
  updated_at: string
}

export interface GoalDetail extends GoalSummary {
  description: string
  parent?: { id: string; title: string }
  project_list: GoalProjectLine[]
  hidden_projects: number
  subgoal_list: GoalSummary[]
  checkins: GoalCheckIn[]
}

/** A goal as the editor writes it. */
export interface GoalInput {
  title: string
  description: string
  owner_uuid: string
  parent_id: string
  start_date: string
  due_date: string
  measure: Measure
  start_value?: number
  target_value?: number
  current_value?: number
  unit: string
  project_uuids?: string[]
}

export const MEASURES: { value: Measure; label: string; hint: string }[] = [
  { value: "projects", label: "Its projects", hint: "How much of the work in the projects serving it is done, each project counting the same." },
  { value: "subgoals", label: "Its sub-goals", hint: "The average of the goals under it." },
  { value: "number", label: "A number", hint: "A number you move as it changes: customers, revenue, hours, a score. It can go down, too." },
]

/** A check-in is due once the last is two weeks old (as on the server). */
export const CHECK_IN_DUE_DAYS = 14

/** "55%"; a dash for nothing to measure. Pure. */
export function percent(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—"
  return `${Math.round(Math.min(1, Math.max(0, v)) * 100)}%`
}

const CURRENCY_SIGN = /^\p{Sc}$/u

/** A number goal's value with its unit: "410 teams", "$250,000", "12.5%". As the server writes it. Pure. */
export function amount(v: number, unit = ""): string {
  const n = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(v)
  if (!unit) return n
  if (unit === "%") return `${n}%`
  if (CURRENCY_SIGN.test(unit)) return v < 0 ? `-${unit}${n.slice(1)}` : `${unit}${n}`
  return `${n} ${unit}`
}

/** What a goal's progress is made of, in a few words: "410 of 500 teams", "2 projects", "3 sub-goals". Pure. */
type NumberGoal = Pick<GoalSummary, "measure" | "start_value" | "current_value" | "target_value" | "unit">

/** Whether a unit is a word ("teams"), said once, rather than a sign ("$", "%") written on every number. Pure. */
const wordUnit = (unit?: string) => !!unit && unit !== "%" && !CURRENCY_SIGN.test(unit)

/** Whether a number goal counts down: a faster reply, fewer open bugs. Pure. */
const countsDown = (g: NumberGoal) => g.start_value !== undefined && g.target_value !== undefined && g.target_value < g.start_value

export function measureLine(g: NumberGoal & Pick<GoalSummary, "projects" | "subgoals">): string {
  switch (g.measure) {
    case "number": {
      if (g.current_value === undefined || g.target_value === undefined) return "A number"
      // Counting down, "of" would read backwards ("3.5 of 2 hours").
      if (countsDown(g)) return `${amount(g.current_value, g.unit)} now, aiming for ${amount(g.target_value, g.unit)}`
      // A word unit is said once ("410 of 500 teams"); a sign goes on both ("$2,000 of $5,000").
      return `${amount(g.current_value, wordUnit(g.unit) ? "" : g.unit)} of ${amount(g.target_value, g.unit)}`
    }
    case "projects":
      return g.projects === 0 ? "No projects yet" : g.projects === 1 ? "1 project" : `${g.projects} projects`
    default:
      return g.subgoals === 0 ? "No sub-goals yet" : g.subgoals === 1 ? "1 sub-goal" : `${g.subgoals} sub-goals`
  }
}

/**
 * Where a goal's progress comes from, as its page says it: "410 teams, from
 * 320 to 500", "From the tasks done in the one project serving it", "The
 * average of its 3 sub-goals". Pure.
 */
export function progressSource(g: NumberGoal & Pick<GoalSummary, "projects" | "subgoals">): string {
  switch (g.measure) {
    case "number": {
      if (g.current_value === undefined || g.start_value === undefined || g.target_value === undefined) return "A number"
      const each = wordUnit(g.unit) ? "" : g.unit
      return `${amount(g.current_value, g.unit)}, from ${amount(g.start_value, each)} ${countsDown(g) ? "down " : ""}to ${amount(g.target_value, wordUnit(g.unit) ? g.unit : each)}`
    }
    case "projects":
      if (g.projects === 0) return "No project serves it yet"
      if (g.projects === 1) return "From the tasks done in the one project serving it"
      return `The average of the ${g.projects} projects serving it, each counting the same`
    default:
      if (g.subgoals === 0) return "No sub-goals yet"
      if (g.subgoals === 1) return "From its one sub-goal"
      return `The average of its ${g.subgoals} sub-goals`
  }
}

/**
 * How an open goal is doing against its time, in points: positive is ahead of
 * where it would be if it moved evenly, negative behind. Undefined when there
 * is no progress or no pace to compare. Pure.
 */
export function paceGap(g: Pick<GoalSummary, "progress" | "expected" | "status">): number | undefined {
  if (g.status !== "open" || g.progress === null || g.expected === undefined) return undefined
  return Math.round((g.progress - g.expected) * 100)
}

/** The pace as a short line: "On pace", "12 points ahead", "20 points behind". Pure. */
export function paceLine(gap: number | undefined): string | undefined {
  if (gap === undefined) return undefined
  if (Math.abs(gap) < 5) return "On pace"
  return gap > 0 ? `${gap} points ahead of its time` : `${-gap} points behind its time`
}

/** Whether whoever can check in should: an open goal with no check-in, or a two-week-old one. Pure. */
export function checkInDue(g: Pick<GoalSummary, "status" | "can_edit" | "checked_in_at">, now: number): boolean {
  if (g.status !== "open" || !g.can_edit) return false
  return !g.checked_in_at || daysSince(g.checked_in_at, now) >= CHECK_IN_DUE_DAYS
}

/** A goal date ("2026-12-31") as people read it: "31 Dec", with the year when it isn't this one. Pure. */
export function dueLabel(day: string, now: Date = new Date()): string {
  const [y, m, d] = day.split("-").map(Number)
  if (!y || !m || !d) return day
  const date = new Date(y, m - 1, d)
  return date.toLocaleDateString("en-GB", y === now.getFullYear() ? { day: "numeric", month: "short" } : { day: "numeric", month: "short", year: "numeric" })
}

/** Whether an open goal's due date has passed, in the reader's own calendar. Pure. */
export function overdue(g: Pick<GoalSummary, "status" | "due_date">, today: string): boolean {
  return g.status === "open" && g.due_date < today
}

/** The last day of the quarter a day is in, as a goal date: the default due date. Pure. */
export function quarterEnd(now: Date = new Date()): string {
  const q = Math.floor(now.getMonth() / 3)
  const end = new Date(now.getFullYear(), q * 3 + 3, 0)
  const p = (n: number) => String(n).padStart(2, "0")
  return `${end.getFullYear()}-${p(end.getMonth() + 1)}-${p(end.getDate())}`
}

export interface GoalNode {
  goal: GoalSummary
  depth: number
}

/**
 * Goals as an indented list: each goal followed by its sub-goals, in the
 * order given (the server's: open first, soonest due). A goal whose parent
 * isn't in the list starts its own branch, so filtering never hides one. Pure.
 */
export function goalTree(goals: GoalSummary[]): GoalNode[] {
  const ids = new Set(goals.map((g) => g.id))
  const children = new Map<string, GoalSummary[]>()
  for (const g of goals) {
    if (g.parent_id && ids.has(g.parent_id)) {
      const list = children.get(g.parent_id) ?? []
      list.push(g)
      children.set(g.parent_id, list)
    }
  }
  const out: GoalNode[] = []
  const seen = new Set<string>()
  const walk = (g: GoalSummary, depth: number) => {
    if (seen.has(g.id)) return
    seen.add(g.id)
    out.push({ goal: g, depth })
    for (const c of children.get(g.id) ?? []) walk(c, depth + 1)
  }
  for (const g of goals) if (!g.parent_id || !ids.has(g.parent_id)) walk(g, 0)
  // A loop left in old data has no root: its goals still show.
  for (const g of goals) walk(g, 0)
  return out
}

/** The goals a goal may sit under: open ones the reader can change, never itself or its own sub-goals. The server also keeps goals four levels deep at most. Pure. */
export function parentChoices(goals: GoalSummary[], self?: string, current?: string): GoalSummary[] {
  // Putting a goal under another moves the other's progress: only goals the
  // reader can change are offered, and the goal's present parent stays shown.
  const offer = (g: GoalSummary) => g.status === "open" && (g.can_edit || g.id === current)
  if (!self) return goals.filter(offer)
  const below = new Set<string>([self])
  let grew = true
  while (grew) {
    grew = false
    for (const g of goals) {
      if (g.parent_id && below.has(g.parent_id) && !below.has(g.id)) {
        below.add(g.id)
        grew = true
      }
    }
  }
  return goals.filter((g) => offer(g) && !below.has(g.id))
}

export type GoalFilter = { status: "open" | "closed"; mine: boolean; query: string }

/** The goals a filter shows. Pure. */
export function filterGoals(goals: GoalSummary[], f: GoalFilter, me?: string): GoalSummary[] {
  const q = f.query.trim().toLowerCase()
  return goals.filter((g) => {
    if ((g.status === "open") !== (f.status === "open")) return false
    if (f.mine && g.owner.user_uuid !== me) return false
    if (!q) return true
    return g.title.toLowerCase().includes(q) || matchesPerson(g.owner, q)
  })
}

/** The owner's name, or that the account is gone. Pure. */
export function ownerName(o: GoalOwner): string {
  return displayNameOf(o) || "A former member"
}
