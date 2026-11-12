// The selection bar's priorities, apart from lib/bulkTasks, which the task page carries. Pure.
import { tasksCount } from "@/lib/bulkTasks"
import { NO_PRIORITY, TASK_PRIORITIES } from "@/types/taskScale"

/** Most urgent first, then No priority (""), which takes it off. */
export const BULK_PRIORITIES = [...TASK_PRIORITIES, NO_PRIORITY]

/** What a priority set on n tasks says once it's done. */
export const prioritySaid = (n: number, value: string) =>
  value ? `Set ${tasksCount(n)} to ${BULK_PRIORITIES.find((p) => p.value === value)?.label ?? value} priority` : `Took the priority off ${tasksCount(n)}`
