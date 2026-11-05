/**
 * A task's type as the app shows it (linear-03; business/WorkTaxonomy): a
 * task with none is a Task. One place for its key and its order, which the
 * list's grouping, the board's columns and the pickers share. Pure.
 */
import type { TaskWorkType } from "@/types/task"

/** Where a project's types are read (GET) and made (POST). */
export const projectTypesPath = (projectId: string) => `/project/${projectId}/types`

/** A plain task's type. Its id is "": giving a task "" makes it plain. */
export const PLAIN_TASK: TaskWorkType = { id: "", builtin: "task", name: "Task", icon: "task" }

/** The type a task shows: its own, or Task. */
export const typeOf = (t?: TaskWorkType | null): TaskWorkType => t ?? PLAIN_TASK

/** One key per type: a built-in one's is the same in every project ("builtin:bug"); a plain task's is Task's. */
export function typeKey(t?: TaskWorkType | null): string {
  const shown = typeOf(t)
  return shown.builtin ? `builtin:${shown.builtin}` : `own:${shown.id}`
}

/** The built-in types in the server's order. */
const BUILT_IN = ["task", "bug", "feature", "milestone", "approval", "request"]

const rank = (t: TaskWorkType) => (t.builtin ? BUILT_IN.indexOf(t.builtin) : BUILT_IN.length)

/** The built-in types first, as the server lists them, then a project's own by name. */
export const compareTypes = (a: TaskWorkType, b: TaskWorkType): number => rank(a) - rank(b) || a.name.localeCompare(b.name)
