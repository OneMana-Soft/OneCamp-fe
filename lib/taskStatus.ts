/**
 * Task statuses: the six built-in ones every project has, and a project's own.
 *
 * A custom status ("QA", "Blocked") belongs to one built-in status, its
 * category. A task in one keeps task_status set to the category and carries
 * task_custom_status (the id) and task_custom_status_name beside it (see
 * business/TaskStatus in the backend). So "is it done?" reads task_status as
 * it always has; only what shows or picks a status reads the custom fields,
 * and that is what this module is for.
 *
 * One rule everywhere: a status's value is its custom id when it has one, else
 * its built-in key. That value is what pickers send, board columns are keyed
 * by, and the server's status filter and move endpoints accept.
 */

import type { ComponentType } from "react"
import { taskStatuses } from "@/types/table"

export type StatusCategory = "backlog" | "todo" | "inProgress" | "inReview" | "done" | "canceled"

/** A project's own status, as the server returns it. */
export interface CustomTaskStatus {
  id: string
  project_id: string
  name: string
  category: StatusCategory
  color: string
  position: number
}

/** GET /project/{id}/statuses */
export interface ProjectStatuses {
  built_in: { key: StatusCategory; label: string }[]
  custom: CustomTaskStatus[]
  colors: string[]
  max: number
}

/** One status as the app shows and offers it. */
export interface StatusOption {
  value: string
  label: string
  category: StatusCategory
  custom: boolean
  icon?: ComponentType<{ className?: string }>
  /** Classes for the status pill. */
  color: string
  /** The palette name, for custom statuses. */
  swatch?: string
}

/** What a task carries about its status. */
export interface TaskStatusFields {
  task_status?: string
  task_custom_status?: string
  task_custom_status_name?: string
}

// Literal class strings, so the stylesheet keeps every one of them.
const PILL: Record<string, string> = {
  slate: "bg-slate-500/10 text-slate-700 dark:text-slate-300",
  red: "bg-red-500/10 text-red-700 dark:text-red-300",
  orange: "bg-orange-500/10 text-orange-700 dark:text-orange-300",
  amber: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  yellow: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-300",
  lime: "bg-lime-500/10 text-lime-700 dark:text-lime-300",
  green: "bg-green-500/10 text-green-700 dark:text-green-300",
  emerald: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  teal: "bg-teal-500/10 text-teal-700 dark:text-teal-300",
  cyan: "bg-cyan-500/10 text-cyan-700 dark:text-cyan-300",
  sky: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
  blue: "bg-blue-500/10 text-blue-700 dark:text-blue-300",
  indigo: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-300",
  violet: "bg-violet-500/10 text-violet-700 dark:text-violet-300",
  purple: "bg-purple-500/10 text-purple-700 dark:text-purple-300",
  pink: "bg-pink-500/10 text-pink-700 dark:text-pink-300",
  rose: "bg-rose-500/10 text-rose-700 dark:text-rose-300",
}

const DOT: Record<string, string> = {
  slate: "bg-slate-500", red: "bg-red-500", orange: "bg-orange-500", amber: "bg-amber-500",
  yellow: "bg-yellow-500", lime: "bg-lime-500", green: "bg-green-500", emerald: "bg-emerald-500",
  teal: "bg-teal-500", cyan: "bg-cyan-500", sky: "bg-sky-500", blue: "bg-blue-500",
  indigo: "bg-indigo-500", violet: "bg-violet-500", purple: "bg-purple-500", pink: "bg-pink-500", rose: "bg-rose-500",
}

export const STATUS_COLORS = Object.keys(PILL)

/** The dot for a palette colour, in pickers. */
export function colorDot(color: string): string {
  return DOT[color] ?? DOT.slate
}

export const BUILT_IN_STATUSES: StatusOption[] = taskStatuses.map((s) => ({
  value: s.value,
  label: s.label,
  category: s.value as StatusCategory,
  custom: false,
  icon: s.icon,
  color: s.color,
}))

export function isBuiltInStatus(value: string): value is StatusCategory {
  return BUILT_IN_STATUSES.some((s) => s.value === value)
}

function builtIn(key: string): StatusOption | undefined {
  return BUILT_IN_STATUSES.find((s) => s.value === key)
}

function customOption(c: Pick<CustomTaskStatus, "id" | "name" | "category" | "color">): StatusOption {
  return {
    value: c.id,
    label: c.name,
    category: c.category,
    custom: true,
    // It counts as its category, so it wears that shape.
    icon: builtIn(c.category)?.icon,
    color: PILL[c.color] ?? PILL.slate,
    swatch: c.color,
  }
}

/**
 * Every status a project offers, in board order: each built-in status
 * followed by the custom ones that count as it, in the order the project's
 * admins set.
 */
export function statusOptions(project?: ProjectStatuses | null): StatusOption[] {
  const customs = [...(project?.custom ?? [])].sort((a, b) => a.position - b.position)
  const out: StatusOption[] = []
  for (const b of BUILT_IN_STATUSES) {
    out.push(b)
    for (const c of customs) if (c.category === b.value) out.push(customOption(c))
  }
  return out
}

/** The value a task's status has: its custom id, or its built-in key. */
export function statusValueOf(task: TaskStatusFields): string {
  return task.task_custom_status || task.task_status || "todo"
}

/**
 * The option a task is shown with. A custom status the list no longer has (it
 * was deleted a moment ago, or this view does not know the project's
 * statuses, as on My Tasks) still reads by the name the task carries.
 */
export function statusOptionOf(task: TaskStatusFields, options: StatusOption[] = BUILT_IN_STATUSES): StatusOption | undefined {
  const value = statusValueOf(task)
  const known = options.find((o) => o.value === value)
  if (known) return known
  if (task.task_custom_status && task.task_custom_status_name && task.task_status) {
    return customOption({ id: task.task_custom_status, name: task.task_custom_status_name, category: task.task_status as StatusCategory, color: "slate" })
  }
  return builtIn(task.task_status || "")
}

/**
 * The fields a task takes on when moved to value: the category, and the
 * custom status or none. For updating what is on screen before the server
 * answers.
 */
export function statusPatch(value: string, options: StatusOption[]): Required<TaskStatusFields> {
  const o = options.find((x) => x.value === value)
  if (o?.custom) {
    return { task_status: o.category, task_custom_status: o.value, task_custom_status_name: o.label }
  }
  return { task_status: o?.category ?? value, task_custom_status: "", task_custom_status_name: "" }
}

/**
 * The fields a live update sets on a task: the full status when the message
 * says which custom status (if any) the task is in, else undefined, and only
 * a built-in status applies (see updateTaskStatusInTaskList).
 */
export function statusFieldsFromMessage(p: { status?: string; custom_status?: string; custom_status_name?: string }): TaskStatusFields | undefined {
  if (!p.status || p.custom_status === undefined) return undefined
  return { task_status: p.status, task_custom_status: p.custom_status || "", task_custom_status_name: p.custom_status ? p.custom_status_name || "" : "" }
}

/**
 * Split a board's columns by category (as the server sends them) into one
 * column per status: a built-in column keeps the tasks in no custom status,
 * and each custom status gets its own. Order within each is kept.
 */
export function columnsByStatus<T extends TaskStatusFields>(byCategory: Record<string, T[]>, options: StatusOption[]): Record<string, T[]> {
  const out: Record<string, T[]> = {}
  for (const o of options) out[o.value] = []
  for (const [category, tasks] of Object.entries(byCategory)) {
    for (const t of tasks) {
      const custom = t.task_custom_status
      // A task in a custom status this view does not know stays with its category.
      const key = custom && custom in out ? custom : category
      ;(out[key] ??= []).push(t)
    }
  }
  return out
}

/**
 * Whether a fetched URL holds tasks whose status a change to projectId's
 * statuses rewrites on the server: the project's board and list, the
 * assigned-task lists (which span projects), and a task's own panel.
 * Renaming, recategorising or deleting a status changes those tasks in the
 * database; these are what the app has to fetch again to show it.
 */
export function holdsProjectTasks(key: unknown, projectId: string): boolean {
  if (typeof key !== "string" || !projectId) return false
  if (key.startsWith("/project/taskList")) return key.includes(projectId)
  return key.startsWith("/user/assignedTaskList") || key.startsWith("/task/info")
}
