/**
 * The backlog tab (projects B3, STEP4_PLAN §4 #9, STEP5 spec F): its answer
 * from GET /project/{p}/backlog, its words, and a move painted before the
 * server answers. Its paths sit here, not in services/endPoints.ts, which
 * every route's first load carries. Pure, but for the calls at the end.
 */
import axiosInstance, { OWN_ERRORS } from "@/lib/axiosInstance"
import { parseWorkDuration } from "@/lib/format/duration"
import type { Cycle, CycleState } from "@/lib/tasks/cycles"
import { countedPoints, pointsText, type EstimateScale } from "@/lib/work/points"
import { dayDate } from "@/lib/utils/timeZone"
import type { TaskInfoInterface } from "@/types/task"

export type BacklogTask = TaskInfoInterface & { task_sub_task_done?: number }

/** An open cycle as a container. */
export interface PlanCycle extends Cycle {
  state: CycleState
  progress: { total: number; started: number; done: number }
  tasks: BacklogTask[]
  estimate_minutes: number
  /** Its points, when the project estimates in points (linear-05). */
  estimate_points?: number
}

/** A cycle a selection can move into (the selection's bar): its id, its name, and when it runs. */
export interface CycleChoice {
  id: string
  label: string
  dates: string
}

export interface BacklogData {
  cycles: PlanCycle[]
  /** A page of the backlog; count and estimate_minutes are all of it. */
  tasks: BacklogTask[]
  count: number
  estimate_minutes: number
  /** What the latest completed cycles finished, in minutes; none before one has. */
  capacity_minutes?: number
  /** The same two in points, when the project estimates in points (linear-05). */
  estimate_points?: number
  capacity_points?: number
  /** The project's scale, null in hours: the unit of every number here, read with them. */
  scale?: EstimateScale | null
}

/**
 * A project's cycle schedule (B3b): its cycles run themselves. starts_at is
 * the first cycle's start: a moment from the server, a "YYYY-MM-DD" day the
 * person picked on the way there.
 */
export interface CycleSchedule {
  weeks: number
  cooldown_weeks: number
  upcoming: number
  roll_over: boolean
  /** A task that starts joins the cycle running then (linear-12). */
  add_started: boolean
  starts_at: string
}

export interface BacklogAnswer {
  data: { backlog: BacklogData; schedule?: CycleSchedule | null; can_edit: boolean; can_plan: boolean }
}

/** "Every 2 weeks · 2 ready ahead · unfinished tasks move on". */
export function scheduleLine(s: CycleSchedule): string {
  const every = s.weeks === 1 ? "Every week" : `Every ${s.weeks} weeks`
  const off = s.cooldown_weeks > 0 ? ", then a week off" : ""
  const rest = s.roll_over ? "unfinished tasks move on" : "unfinished tasks go back to the backlog"
  return `${every}${off} · ${s.upcoming} ready ahead · ${rest}`
}

/** A picked day as midnight where the person is, the moment the server reads. */
const startOfDay = (day: string) => (dayDate(day) ?? new Date(day)).toISOString()

/** Where a task can go: a cycle's id, or the backlog. */
export const BACKLOG = "backlog"

export const backlogPath = (projectId: string) => `/project/${projectId}/backlog`

/** "18 h", "1.5 h". */
export function hoursText(minutes: number): string {
  return `${Math.round((minutes / 60) * 10) / 10} h`
}

/**
 * How the backlog counts work: in hours, from its tasks' minutes, or in
 * points on the project's scale (linear-05) once the server counts them, a
 * task with none counting as the scale says.
 */
export interface Measure {
  points: boolean
  /** "18 h", "13 points". */
  text: (n: number) => string
  /** What a task counts as. */
  task: (t: BacklogTask) => number
  /** A cycle's work, and the backlog's. */
  cycle: (c: PlanCycle) => number
  backlog: (d: BacklogData) => number
  /** The capacity set for a cycle, and the project's: what its recent cycles finished. */
  own: (c: PlanCycle) => number | undefined
  project: (d: BacklogData) => number | undefined
}

const est = (t: BacklogTask) => (t.task_estimate_minutes && t.task_estimate_minutes > 0 ? t.task_estimate_minutes : 0)

export const HOURS: Measure = {
  points: false,
  text: hoursText,
  task: est,
  cycle: (c) => c.estimate_minutes,
  backlog: (d) => d.estimate_minutes,
  own: (c) => c.capacity_minutes,
  project: (d) => d.capacity_minutes,
}

/** The backlog's measure: points when its answer counts them on a scale, else hours. */
export function measureOf(data: BacklogData): Measure {
  const scale = data.scale
  if (data.estimate_points === undefined || !scale) return HOURS
  return {
    points: true,
    text: pointsText,
    task: (t) => countedPoints(scale, t.task_estimate_points),
    cycle: (c) => c.estimate_points ?? 0,
    backlog: (d) => d.estimate_points ?? 0,
    own: (c) => c.capacity_points,
    project: (d) => d.capacity_points,
  }
}

/** "12 tasks · 18 h of 24 h", "12 tasks · 6 of 8 points", "12 tasks · 13 points", "12 tasks". */
export function totalsLine(count: number, amount: number, capacity?: number, text: (n: number) => string = hoursText): string {
  const tasks = `${count} ${count === 1 ? "task" : "tasks"}`
  // Points name their unit once: "6 of 8 points", never "6 points of 8 points".
  if (capacity) return `${tasks} · ${text(amount).replace(/ points?$/, "")} of ${text(capacity)}`
  return amount > 0 ? `${tasks} · ${text(amount)}` : tasks
}

/** What a cycle is planned against: the capacity set for it, or the project's (what its recent cycles finished). */
export const capacityOf = (c: PlanCycle, data: BacklogData, m: Measure = HOURS): number | undefined => m.own(c) ?? m.project(data)

/** The most capacity a cycle takes, in minutes (the server's limit: 100,000 hours). */
const CAPACITY_MOST_MINUTES = 6_000_000

/** A capacity as typed ("30", "7.5h", "30h 30m") in minutes, or null when it isn't one a cycle takes. */
export const capacityMinutes = (typed: string): number | null => parseWorkDuration(typed, CAPACITY_MOST_MINUTES)

/** The most capacity a cycle takes in points (the server's limit). */
const CAPACITY_MOST_POINTS = 100_000

/** A capacity in points as typed ("40"), or null when it isn't a whole number a cycle takes. */
export function capacityPoints(typed: string): number | null {
  const t = typed.trim()
  if (!/^\d+$/.test(t)) return null
  const n = Number(t)
  return n >= 1 && n <= CAPACITY_MOST_POINTS ? n : null
}

/** How full a cycle is against capacity, as Workload says it: at is within a tenth either side. */
export function loadOf(minutes: number, capacity?: number): "under" | "at" | "over" | undefined {
  if (!capacity) return undefined
  if (minutes > capacity * 1.1) return "over"
  return minutes >= capacity * 0.9 ? "at" : "under"
}

const closed = (s: string) => s === "done" || s === "canceled"
const started = (s: string) => s === "inProgress" || s === "inReview"

function counted(tasks: BacklogTask[]) {
  return {
    total: tasks.length,
    started: tasks.filter((t) => started(t.task_status)).length,
    done: tasks.filter((t) => closed(t.task_status)).length,
  }
}

/** The backlog with task moved to `to` (a cycle's id or BACKLOG), every total following, in m too; null when there's nothing to move. */
export function moveTask(data: BacklogData, taskId: string, to: string, m: Measure = HOURS): BacklogData | null {
  const fromCycle = data.cycles.find((c) => c.tasks.some((t) => t.task_uuid === taskId))
  const inBacklog = data.tasks.find((t) => t.task_uuid === taskId)
  const task = inBacklog ?? fromCycle?.tasks.find((t) => t.task_uuid === taskId)
  if (!task || (inBacklog && to === BACKLOG) || fromCycle?.id === to) return null
  if (to !== BACKLOG && !data.cycles.some((c) => c.id === to)) return null
  const next: BacklogData = { ...data }
  if (inBacklog) {
    next.tasks = data.tasks.filter((t) => t.task_uuid !== taskId)
    next.count = data.count - 1
    next.estimate_minutes = data.estimate_minutes - est(task)
    if (m.points) next.estimate_points = m.backlog(data) - m.task(task)
  }
  if (to === BACKLOG) {
    next.tasks = [task, ...data.tasks]
    next.count = data.count + 1
    next.estimate_minutes = data.estimate_minutes + est(task)
    if (m.points) next.estimate_points = m.backlog(data) + m.task(task)
  }
  next.cycles = data.cycles.map((c) => {
    let tasks = c.tasks
    if (c.id === fromCycle?.id) tasks = c.tasks.filter((t) => t.task_uuid !== taskId)
    if (c.id === to) tasks = [...c.tasks, task]
    if (tasks === c.tasks) return c
    const points = m.points ? { estimate_points: tasks.reduce((n, t) => n + m.task(t), 0) } : {}
    return { ...c, tasks, progress: counted(tasks), estimate_minutes: tasks.reduce((n, t) => n + est(t), 0), ...points }
  })
  return next
}

/** The backlog with each of tasks moved to `to`, as moveTask moves one; null when none of them moves. */
export function moveTasks(data: BacklogData, taskIds: string[], to: string, m: Measure = HOURS): BacklogData | null {
  let next: BacklogData | null = null
  for (const id of taskIds) next = moveTask(next ?? data, id, to, m) ?? next
  return next
}

/** Puts a task in a cycle, or ("") in none. */
export async function setTaskCycle(taskUUID: string, cycleId: string): Promise<void> {
  await axiosInstance.post("/task/cycle", { task_uuid: taskUUID, cycle_id: cycleId }, OWN_ERRORS)
}

/** Sets the capacity a cycle is planned against, in minutes or (points) points, or (null) gives it the project's again. */
export async function setCycleCapacity(projectId: string, cycleId: string, amount: number | null, points = false): Promise<void> {
  await axiosInstance.post(`/project/${projectId}/cycles/${cycleId}/capacity`, { [points ? "capacity_points" : "capacity_minutes"]: amount }, OWN_ERRORS)
}

/** Starts an upcoming cycle now, as long as it was planned. */
export async function startCycle(projectId: string, cycleId: string): Promise<void> {
  await axiosInstance.post(`/project/${projectId}/cycles/${cycleId}/start`, {}, OWN_ERRORS)
}

/** Completes a cycle; its unfinished tasks go to the next cycle (carry) or the backlog. */
export async function completeCycle(projectId: string, cycleId: string, carry: boolean): Promise<void> {
  await axiosInstance.post(`/project/${projectId}/cycles/${cycleId}/complete`, { carry }, OWN_ERRORS)
}

/** Makes the project's next cycle: two weeks from the day picked ("YYYY-MM-DD"). */
export async function createCycle(projectId: string, day: string): Promise<void> {
  await axiosInstance.post(`/project/${projectId}/cycles`, { name: "", starts_at: startOfDay(day), weeks: 2 }, OWN_ERRORS)
}

/** Makes the project's cycles run themselves, from the day picked; the server makes the ones it keeps ready. */
export async function saveSchedule(projectId: string, s: CycleSchedule): Promise<void> {
  await axiosInstance.post(`/project/${projectId}/cycles/schedule`, { ...s, starts_at: startOfDay(s.starts_at) }, OWN_ERRORS)
}

/** Hands the project's cycles back to its people; the cycles made stay. */
export async function stopSchedule(projectId: string): Promise<void> {
  await axiosInstance.post(`/project/${projectId}/cycles/schedule/stop`, {}, OWN_ERRORS)
}

/** A person's calendar link to a project's cycles (linear-12): GET (whether there's one), POST (make one) and POST …/stop. */
export const cycleFeedUrl = (projectId: string) => `/project/${projectId}/cycles/feed`
