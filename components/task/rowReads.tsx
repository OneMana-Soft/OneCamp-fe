"use client"
import type { ReactNode } from "react"
import { useProjectStatuses } from "@/hooks/useProjectStatuses"
import { useTaskTime } from "@/hooks/useTaskTime"
import type { StatusOption } from "@/lib/taskStatus"
import { cachedData } from "@/lib/swrMutate"
import { projectStatusesKey } from "@/lib/projectStatusesKey"
import { projectOptions, type OrderedStatuses } from "@/lib/statusOrder"

// Reads that settle after a task's answer, made by the rows that show them.
// Held by the page, each answer drew the page's whole body once more (on a
// phone, every row of a task's page: V-1099); here it draws only its row.

/** A project's statuses, for the rows that show them. Without a project nothing is read and the built-in statuses stand. */
export function ProjectStatuses({ projectUUID, children }: { projectUUID?: string; children: (options: StatusOption[]) => ReactNode }) {
  const { options } = useProjectStatuses(projectUUID)
  return children(options)
}

/** The time logged on a task, for the rows that show it. */
export function TaskLoggedTime({ taskUUID, children }: { taskUUID: string; children: (seconds: number | undefined) => ReactNode }) {
  const { time } = useTaskTime(taskUUID)
  return children(time?.seconds)
}

/** A project's statuses as the app holds them now, neither read nor watched: for the moment of an action (a status picked). */
export const statusOptionsNow = (projectId?: string): StatusOption[] =>
  projectOptions(projectId ? cachedData<{ data: OrderedStatuses }>(projectStatusesKey(projectId))?.data : undefined)
