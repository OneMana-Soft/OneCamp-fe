import { addDays, endOfDay } from "date-fns"
import type { CalendarEventTask } from "@/types/calendar"
import type { TaskInfoInterface } from "@/types/task"

/**
 * Time for a task (calendar B1, gcal-new-task-blocks): a task as a block names
 * it, the calendar's event_task, from a task as your list reads it. Pure.
 */
export function blockTaskOf(t: Pick<TaskInfoInterface, "task_uuid" | "task_name" | "task_status"> & { task_project?: { project_uuid?: string; project_name?: string } | null }): CalendarEventTask {
  const p = t.task_project
  return {
    task_uuid: t.task_uuid,
    task_name: t.task_name,
    task_status: t.task_status,
    ...(p?.project_uuid ? { project_uuid: p.project_uuid, project_name: p.project_name } : {}),
  }
}

/** What a block at `day` offers first: your open tasks due within two weeks of it, the overdue ones included. Pure. */
export const blockDueBy = (day: Date): Date => endOfDay(addDays(day, 14))
