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
import { isTimelineKey } from "@/lib/timelineKey"
import { campHueOf, isCampHue, type CampHue } from "@/lib/campHue"
import { HUE_CLASS } from "@/components/ui/graphics/hues"
import type { StatusKind } from "@/components/ui/graphics/glyphs"

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
  /** Classes for the 6px dot a list shows beside the label. */
  dot?: string
  /** The palette name, for custom statuses. */
  swatch?: string
  /** Its glyph's shape: its category's. */
  kind?: StatusKind
  /** The hue its glyph draws in: a custom status's own, or neutral for the category's. */
  hue?: StatusHue
}

/** What a task carries about its status. */
export interface TaskStatusFields {
  task_status?: string
  task_custom_status?: string
  task_custom_status_name?: string
}

/**
 * STATUS COLOUR (design v3, work.md §1.4). A status is a shape before it is a
 * colour: its category's glyph (components/ui/graphics/glyphs StatusGlyph).
 * A project's own status keeps its category's shape and takes one of the camp
 * hues, which only tells two custom statuses apart; the shape keeps the
 * meaning. The 17 Tailwind colours custom statuses picked from are gone.
 *
 * The server still stores one of its palette names (backend
 * business/TaskStatus Colors), so a status's colour is read through
 * statusHueOf (any stored name folds onto a camp hue, so every colour already
 * saved keeps working) and written as STORED_NAME[hue].
 */
export type StatusHue = CampHue | "neutral"

/** The hues a custom status may take, by the category it counts as. "neutral" is the category's own ink. */
export const STATUS_HUES: Record<StatusCategory, StatusHue[]> = {
  backlog: ["neutral"],
  todo: ["neutral", "sky", "lake"],
  inProgress: ["sun", "sky", "lake", "berry"],
  inReview: ["dusk", "berry", "sky", "lake"],
  done: ["moss", "lake"],
  canceled: ["neutral"],
}

/** The name the server stores for each hue (one of its palette names). */
export const STORED_NAME: Record<StatusHue, string> = {
  neutral: "slate",
  sun: "amber",
  moss: "emerald",
  lake: "teal",
  sky: "sky",
  dusk: "violet",
  berry: "rose",
}

/** Every colour a status can be given: the stored names of the camp choices. */
export const STATUS_COLORS: string[] = Object.values(STORED_NAME)

/** A category's own hue: what a built-in status draws in (its glyph's colour). */
const CATEGORY_HUE: Record<StatusCategory, StatusHue> = {
  backlog: "neutral",
  todo: "neutral",
  inProgress: "sun",
  inReview: "dusk",
  done: "moss",
  canceled: "neutral",
}

/**
 * The hue a stored colour draws in. Any palette name folds onto the nearest
 * camp hue (emerald is moss, violet dusk, rose berry...); slate and anything
 * unknown are neutral, the category's own ink.
 */
export function statusHueOf(color: string | undefined | null, category?: StatusCategory): StatusHue {
  if (!color || color === "slate" || color === "neutral") return "neutral"
  if (isCampHue(color)) return color
  return campHueOf(color) ?? (category ? CATEGORY_HUE[category] : "neutral")
}

/** The shape a category draws (StatusGlyph's kinds). */
export const CATEGORY_KIND: Record<StatusCategory, StatusKind> = {
  backlog: "backlog",
  todo: "todo",
  inProgress: "progress",
  inReview: "review",
  done: "done",
  canceled: "cancelled",
}

// Literal class strings, so the stylesheet keeps every one of them.
const NEUTRAL_DOT = "bg-ink-3"
const NEUTRAL_PILL = "bg-hover text-ink-2"

/** The 6px dot for a stored colour: a status's swatch, a select field's option. */
export function colorDot(color: string): string {
  const h = statusHueOf(color)
  return h === "neutral" ? NEUTRAL_DOT : `${HUE_CLASS[h]} bg-hue`
}

/** A tinted pill for a stored colour, where one is drawn on purpose. */
function colorPill(color: string): string {
  const h = statusHueOf(color)
  return h === "neutral" ? NEUTRAL_PILL : `${HUE_CLASS[h]} bg-hue-tint text-hue-ink`
}

export const BUILT_IN_STATUSES: StatusOption[] = taskStatuses.map((s) => ({
  value: s.value,
  label: s.label,
  category: s.value as StatusCategory,
  custom: false,
  icon: s.icon,
  color: s.color,
  dot: s.dot,
  kind: CATEGORY_KIND[s.value as StatusCategory],
  hue: "neutral",
}))

export function isBuiltInStatus(value: string): value is StatusCategory {
  return BUILT_IN_STATUSES.some((s) => s.value === value)
}

/**
 * Whether a task's status is finished: Done or Canceled. A project's own
 * status is finished when the status it counts as is, which is what
 * task_status holds. Finished work is never overdue. (Backend: TASK_OPEN_FILTER.)
 */
export function isClosedStatus(taskStatus: string | undefined): boolean {
  return taskStatus === "done" || taskStatus === "canceled"
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
    color: colorPill(c.color),
    dot: colorDot(c.color),
    swatch: c.color,
    kind: CATEGORY_KIND[c.category],
    hue: statusHueOf(c.color, c.category),
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
 * statuses rewrites on the server: the project's board, list and timeline,
 * the assigned-task lists (which span projects), and a task's own panel.
 * Renaming, recategorising or deleting a status changes those tasks in the
 * database; these are what the app has to fetch again to show it.
 */
export function holdsProjectTasks(key: unknown, projectId: string): boolean {
  if (typeof key !== "string" || !projectId) return false
  if (key.startsWith("/project/taskList")) return key.includes(projectId)
  if (isTimelineKey(key, projectId)) return true
  return key.startsWith("/user/assignedTaskList") || key.startsWith("/task/info")
}
