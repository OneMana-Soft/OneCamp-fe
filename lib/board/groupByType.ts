/**
 * A board grouped by type (linear-03): a column per type of the project, in
 * the order the server lists them, plain work under Task, and the type a drop
 * into a column gives a task. Apart from lib/board/groupBy, which the timeline
 * and Workload views read to group by person, so the types load with the
 * kanban only. Pure, so it is tested without rendering.
 */
import { groupColumns, type BoardOption, type Column } from "@/lib/board/groupBy"
import { PLAIN_TASK, typeOf } from "@/lib/work/workTypes"
import type { TaskWorkType } from "@/types/task"

/** Anything with a type: a board's task. */
interface Typed {
  task_work_type?: TaskWorkType | null
}

/** A type's column: Task's is the server's Task, or Task's own key before the types load. */
const typeColumn = (t: TaskWorkType): Column => ({ value: t.id || "type:task", label: t.name, workType: t })

/**
 * A board by type: a column per type of the project, in the order the server
 * lists them (the built-in ones first), plain work under Task.
 */
export function groupByType<T extends Typed>(
  byStatus: Record<string, T[]>,
  types: TaskWorkType[] = [],
  hideEmpty = false,
): { columns: Record<string, T[]>; options: BoardOption[] } {
  const task = typeColumn(types.find((t) => t.builtin === PLAIN_TASK.builtin) ?? PLAIN_TASK)
  const known = types.map(typeColumn)
  return groupColumns(byStatus, (t) => (t.task_work_type ? typeColumn(typeOf(t.task_work_type)) : task), known.some((c) => c.value === task.value) ? known : [task, ...known], hideEmpty)
}

/**
 * The type a drop into `column` gives a task, for lib/work/keysApi setTaskType:
 * the column's type, "" for Task (a plain task); undefined when nothing changes.
 */
export function typeMove(task: Typed, column: string, options: BoardOption[]): string | undefined {
  const to = options.find((o) => o.value === column)?.workType
  if (!to) return undefined
  const next = to.builtin === PLAIN_TASK.builtin ? "" : to.id
  return next === (task.task_work_type?.id ?? "") ? undefined : next
}
