/**
 * A board grouped by something other than status, as Linear's board can be:
 * by who has each task (a "No assignee" column, then people by name) here,
 * and by its type in lib/board/groupByType, which only the kanban loads, so
 * the timeline and Workload views that group by person never load the types.
 * One function lays the columns out for both. Pure, so it is tested without
 * rendering.
 */
import { displayNameOf } from "@/lib/personName"
import type { StatusOption } from "@/lib/taskStatus"
import type { TaskWorkType } from "@/types/task"

export type BoardGrouping = "status" | "assignee" | "type"

/** The column a task with nobody on it sits in. */
export const NO_ASSIGNEE = "none"

interface Member {
  user_uuid: string
  user_name?: string
  user_full_name?: string
}

const nameOf = (m: Member) => displayNameOf(m) || "Someone"

/** A board's column: on a board of types, it carries its type (its glyph, and what a drop sets). */
export type BoardOption = StatusOption & { workType?: TaskWorkType }

/** A column: its key, its name, and on a board of types its type. */
export type Column = Pick<BoardOption, "value" | "label" | "workType">

/**
 * The columns of a board by a key of each task: every known column, then any
 * a task brings that isn't known (someone who left, an archived type), so no
 * task drops out of sight. `order` sorts them; `hideEmpty` leaves out columns
 * with nothing (Asana's "hide empty groups").
 */
export function groupColumns<T>(
  byStatus: Record<string, T[]>,
  columnOf: (t: T) => Column,
  known: Column[],
  hideEmpty: boolean,
  order?: (a: Column, b: Column) => number,
): { columns: Record<string, T[]>; options: BoardOption[] } {
  const all = new Map<string, Column>(known.map((c) => [c.value, c]))
  const columns: Record<string, T[]> = {}
  for (const tasks of Object.values(byStatus)) {
    for (const t of tasks) {
      const c = columnOf(t)
      if (!all.has(c.value)) all.set(c.value, c)
      ;(columns[c.value] ??= []).push(t)
    }
  }
  const shown = [...all.values()].filter((c) => !hideEmpty || (columns[c.value]?.length ?? 0) > 0)
  if (order) shown.sort(order)
  return {
    columns: Object.fromEntries(shown.map((c) => [c.value, columns[c.value] ?? []])),
    options: shown.map((c) => ({ ...c, category: "todo", custom: false, color: "" })),
  }
}

/** Anything with an assignee: a board's task, or a timeline's. */
interface Assigned {
  task_assignee?: Member | null
}

const NOBODY: Column = { value: NO_ASSIGNEE, label: "No assignee" }

export function groupByAssignee<T extends Assigned>(
  byStatus: Record<string, T[]>,
  members: Member[] = [],
  /** Leave out people with nothing (Asana's "hide empty groups"). */
  hideEmpty = false,
): { columns: Record<string, T[]>; options: StatusOption[] } {
  const person = (m: Member): Column => ({ value: m.user_uuid, label: nameOf(m) })
  return groupColumns(
    byStatus,
    // Someone who has tasks but has left the project still gets a column:
    // their work has not gone anywhere.
    (t) => (t.task_assignee?.user_uuid ? person(t.task_assignee) : NOBODY),
    [NOBODY, ...members.filter((m) => m?.user_uuid).map(person)],
    hideEmpty,
    (a, b) => (a === NOBODY ? -1 : b === NOBODY ? 1 : a.label.localeCompare(b.label)),
  )
}
