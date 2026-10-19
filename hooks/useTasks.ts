"use client"

/**
 * The tasks a Query Spec selects, one page at a time (projects programme,
 * PROGRAM.md §4.2 #80 and #89; A2 runs specs on the server, A5 keeps their
 * answers in the Task Store).
 *
 * DAY 0. Today's read, for what it can answer: a project's tasks with no
 * filter, sort, grouping or search, from /project/taskList/<id> a page at a
 * time (the cursor is the page's number). Any other spec isn't built yet, and
 * says so without asking. Nothing calls it yet.
 */

import { useMemo } from "react"
import { useFetch } from "@/hooks/useFetch"
import { GetEndpointUrl } from "@/services/endPoints"
import type { ProjectInfoRawInterface } from "@/types/project"
import type { QueryPage, QuerySpec } from "@/lib/querySpec/types"
import type { WorkTask } from "@/lib/work/types"

export interface TasksState {
  tasks: WorkTask[]
  total: number
  /** The next page's cursor; none at the end. */
  next?: string
  status: "loading" | "ready" | "error" | "unavailable"
  retry: () => void
}

const NONE: WorkTask[] = []

/** The read today's code can make for spec, or "" for one it can't. Pure. */
export function todaysRead(spec: QuerySpec, page: QueryPage): string {
  const plain = !spec.filter && !spec.sorts?.length && !spec.groups?.length && !spec.search
  if (spec.scope.kind !== "project" || !spec.scope.id || !plain || page.size <= 0) return ""
  const index = Number(page.after ?? 0)
  if (!Number.isInteger(index) || index < 0) return ""
  const params = new URLSearchParams({ pageSize: String(page.size), pageIndex: String(index) })
  return `${GetEndpointUrl.GetProjectTaskList}/${spec.scope.id}?${params}`
}

export function useTasks(spec: QuerySpec, page: QueryPage): TasksState {
  const key = todaysRead(spec, page)
  const { data, isError, mutate } = useFetch<ProjectInfoRawInterface>(key)
  return useMemo(() => {
    const retry = () => {
      void mutate()
    }
    if (!key) return { tasks: NONE, total: 0, status: "unavailable" as const, retry }
    const tasks = data?.data?.project_tasks ?? NONE
    const total = data?.data?.project_task_count ?? 0
    const shown = (Number(page.after ?? 0) + 1) * page.size
    return {
      tasks,
      total,
      next: data && shown < total ? String(Number(page.after ?? 0) + 1) : undefined,
      status: data ? ("ready" as const) : isError ? ("error" as const) : ("loading" as const),
      retry,
    }
  }, [key, data, isError, mutate, page.after, page.size])
}
