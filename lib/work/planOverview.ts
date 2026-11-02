import { PRIORITY_NAMES, priorityLevel } from "@/lib/tasks/priority"
import { taskDate } from "@/lib/tasks/taskDate"
import { dayDate, localDay } from "@/lib/utils/timeZone"
import { PLAN_CATEGORIES, periodOf, type ProjectPlan } from "@/lib/work/projectPlan"

/**
 * The projects overview read by its plans (linear-15): the sorts a plan adds,
 * and the days a project's timeline bar runs across. Its own module, so home's
 * projects strip, which shares lib/projectsOverview, never carries the plan's code.
 */
export type PlanSort = "priority" | "target" | "status" | "lead"
export const PLAN_SORTS: readonly { value: PlanSort; label: string }[] = [
  { value: "priority", label: "Priority" },
  { value: "target", label: "Target date" },
  { value: "status", label: "Status" },
  { value: "lead", label: "Lead" },
]
export const isPlanSort = (v: unknown): v is PlanSort => PLAN_SORTS.some((s) => s.value === v)

/** What the plan's sorts, ends and spans read from an overview row. */
export interface Planned {
  project_name: string
  plan?: ProjectPlan | null
  first_day?: string
  last_day?: string
  open?: number
}

/**
 * Where a project ends, as the overview and the timeline show it (V-255): its
 * plan's target at its period's last day, else its tasks' last day, as a day
 * where the viewer is; late once that day is over with work open (with no
 * clock, never). None with neither.
 */
export function endOf(p: Planned, now?: Date): { day: string; target: boolean; late: boolean } | undefined {
  const t = p.plan?.target
  const last = taskDate(p.last_day)
  const day = t ? periodOf(t.date, t.resolution).last : last && localDay(last)
  return day ? { day, target: !!t, late: !!now && (p.open ?? 0) > 0 && day < localDay(now) } : undefined
}

const byName = (a: Planned, b: Planned) => a.project_name.localeCompare(b.project_name, undefined, { sensitivity: "base" })

// Each key puts a project with no value after every project with one.
const keyOf: Record<PlanSort, (p: Planned) => number | string | undefined> = {
  // The shared scale turned around, so urgent (4) leads and none (0) has no key.
  priority: (p) => -priorityLevel(p.plan?.priority) || undefined,
  // The day the Target column shows (V-257).
  target: (p) => endOf(p)?.day,
  status: (p) => {
    const i = PLAN_CATEGORIES.findIndex((c) => c.key === p.plan?.status?.category)
    return i < 0 ? undefined : i
  },
  lead: (p) => p.plan?.lead?.name || undefined,
}

function compareKeys(a: number | string | undefined, b: number | string | undefined): number {
  if (a === undefined || b === undefined) return a === b ? 0 : a === undefined ? 1 : -1
  if (typeof a === "string" && typeof b === "string") return a.localeCompare(b, undefined, { sensitivity: "base" })
  return a < b ? -1 : a > b ? 1 : 0
}

export function sortByPlan<T extends Planned>(list: readonly T[], sort: PlanSort): T[] {
  const key = keyOf[sort]
  return [...list].sort((a, b) => compareKeys(key(a), key(b)) || byName(a, b))
}

/** A day the server sent, as midnight of that day where the viewer is. */
const dayOf = (s?: string) => {
  const d = taskDate(s)
  return d ? new Date(d.getFullYear(), d.getMonth(), d.getDate()) : undefined
}

/**
 * The days a project's bar runs across, as midnights where the viewer is:
 * from its plan's start to its target, each at its period's edge (Q4 from
 * 1 Oct to 31 Dec), taking an end the plan leaves unset from its tasks' days,
 * and one end alone as that one day; null with neither. A plan's day is read
 * where the viewer is (dayDate): new Date("2026-09-30") is UTC's midnight, the
 * 29th in New York. A tasks' end that would draw the bar backwards is dropped,
 * so the plan's own end stands alone.
 */
export function planSpanOf(p: Planned): { start: Date; end: Date } | null {
  const { start, target } = p.plan ?? {}
  let first = start ? dayDate(periodOf(start.date, start.resolution).first) : dayOf(p.first_day)
  let last = target ? dayDate(periodOf(target.date, target.resolution).last) : dayOf(p.last_day)
  if (first && last && first > last) {
    if (start) last = undefined
    else first = undefined
  }
  const from = first ?? last
  return from ? { start: from, end: last ?? from } : null
}

/**
 * What a plan says of who leads a project and how it matters, in words, in
 * this order: "led by Ana Diaz", "Urgent priority", "labels Revenue, Q4 bet".
 * Only the parts it has. The timeline's bar says them to a screen reader and
 * in its tip, and its peek on a touch screen shows the same (linear-15).
 */
export function planWords(plan: ProjectPlan | null | undefined): string[] {
  if (!plan) return []
  const level = priorityLevel(plan.priority)
  const labels = (plan.labels ?? []).map((l) => l.name).filter(Boolean)
  return [
    plan.lead?.name ? `led by ${plan.lead.name}` : "",
    level ? `${PRIORITY_NAMES[level]} priority` : "",
    labels.length > 0 ? `labels ${labels.join(", ")}` : "",
  ].filter(Boolean)
}
