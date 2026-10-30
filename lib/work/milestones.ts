/**
 * Milestones (linear-16): the stages of a project's work, each with a name, a
 * few words, an optional target day and its tasks. A milestone's progress
 * counts its tasks as a cycle's does; the first unfinished one in a project's
 * order is marked next; one can be shared with other projects, whose tasks
 * join it too. Each reader's counts take in only the tasks they may open.
 * Types, words and requests; pure but for the requests.
 */

import { startOfDay } from "date-fns"
import axiosInstance, { OWN_ERRORS } from "@/lib/axiosInstance"
import { taskDate } from "@/lib/tasks/taskDate"
import { shortDate } from "@/lib/utils/date/dateWords"
import { dayDate, localDay } from "@/lib/utils/timeZone"

/** A milestone's tasks by where they stand: done counts cancelled ones too. */
export interface MilestoneProgress {
  total: number
  started: number
  done: number
}

/** A milestone as one project's list shows it to its reader (GET /project/{p}/milestones). */
export interface Milestone {
  id: string
  /** Its home: the project that made it, whose admins change it. */
  project_uuid: string
  name: string
  description: string
  /** The day it should be done by, "2026-11-30", or null. */
  target_date: string | null
  progress: MilestoneProgress
  /** Its tasks' first day and last (RFC 3339), when any is dated. */
  starts?: string
  ends?: string
  /** Whether this list's project made it. */
  home: boolean
  /** The projects it shows in that the reader may open (its home first when it is one), and how many more. */
  projects: { project_uuid: string; project_name: string }[]
  hidden_projects: number
  /** The first unfinished one in the project's order: the one to focus on. */
  next: boolean
  /** Whether the reader runs its home, whose admins rename, date, share and delete it. */
  can_edit: boolean
}

export interface MilestonesAnswer {
  /** null for none from servers before V-51; a screen reads it through listOnceRead. */
  data: { milestones: Milestone[] | null; can_manage: boolean }
}

/** What a person sets on a milestone. */
export interface MilestoneInput {
  name: string
  description: string
  target_date: string | null
}

/** The most milestones a project shows, and the longest name and description (migration 935). */
export const MILESTONES_MOST = 50
export const NAME_MOST = 80
export const DESCRIPTION_MOST = 2000

export const milestonesPath = (projectId: string) => `/project/${projectId}/milestones`

/** Whether a milestone is done: it has tasks, and every one is closed. */
export const finished = (p: MilestoneProgress) => p.total > 0 && p.done === p.total

/** Its progress in words: "3 of 8 done", "2 of 8 done · 3 started", "No tasks yet". */
export function progressWords(p: MilestoneProgress): string {
  if (p.total === 0) return "No tasks yet"
  return p.started > 0 ? `${p.done} of ${p.total} done · ${p.started} started` : `${p.done} of ${p.total} done`
}

/** Its target day in words ("30 Nov"), and whether it has passed while it's unfinished. */
export function targetWords(m: Pick<Milestone, "target_date" | "progress">, now: Date = new Date()): { text: string; late: boolean } | null {
  const day = dayDate(m.target_date)
  if (!day) return null
  return { text: shortDate(day, now), late: m.target_date! < localDay(now) && !finished(m.progress) }
}

/** Where a milestone sits on a timeline: its tasks' days (the thin bar), its target day (the diamond), and the days both cover. */
export interface MilestoneDays {
  start: Date
  end: Date
  tasks?: { start: Date; end: Date }
  target?: Date
}

/** A milestone's days on a timeline, or null when it has neither dated tasks nor a target day. */
export function milestoneDays(m: Pick<Milestone, "starts" | "ends" | "target_date">): MilestoneDays | null {
  const first = taskDate(m.starts)
  const last = taskDate(m.ends)
  const a = first ? startOfDay(first) : last ? startOfDay(last) : undefined
  const b = last ? startOfDay(last) : a
  const tasks = a && b ? (a <= b ? { start: a, end: b } : { start: b, end: a }) : undefined
  const target = dayDate(m.target_date)
  if (!tasks && !target) return null
  const days = [tasks?.start, tasks?.end, target].filter((d): d is Date => !!d)
  return { start: new Date(Math.min(...days.map(Number))), end: new Date(Math.max(...days.map(Number))), tasks, target }
}

/** The other projects it shows in, for a reader in project here: "Also in Shop and 1 project you can't open"; null when none. */
export function alsoIn(m: Pick<Milestone, "projects" | "hidden_projects">, here: string): string | null {
  const names = m.projects.filter((p) => p.project_uuid.toLowerCase() !== here.toLowerCase()).map((p) => p.project_name)
  if (m.hidden_projects > 0) names.push(`${m.hidden_projects} ${m.hidden_projects === 1 ? "project" : "projects"} you can't open`)
  if (names.length === 0) return null
  const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`
  return `Also in ${list}`
}

/** The milestone a task is in, as GET and POST /task/milestone answer it. */
export type TaskMilestone = Pick<Milestone, "id" | "project_uuid" | "name" | "description" | "target_date">

export const taskMilestonePath = (taskUUID: string) => `/task/milestone/${taskUUID}`

/** Puts a task in a milestone its project shows, or ("") takes it out; answers the milestone it's in now. */
export async function setTaskMilestone(taskUUID: string, milestoneId: string): Promise<TaskMilestone | null> {
  const res = await axiosInstance.post<{ data: TaskMilestone | null }>("/task/milestone", { task_uuid: taskUUID, milestone_id: milestoneId }, OWN_ERRORS)
  return res.data.data
}
