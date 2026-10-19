"use client"

/**
 * One task (projects programme, PROGRAM.md §5; A5 builds it: read from the
 * Task Store, painted at once, patched by the change feed).
 *
 * DAY 0. Today's read: /task/info/<id>, on the key the task panel asks with,
 * so the two share one request. Nothing calls it yet; A5 moves the panel and
 * the lists onto it and replaces the read behind it.
 */

import { useMemo } from "react"
import { useFetch } from "@/hooks/useFetch"
import { GetEndpointUrl } from "@/services/endPoints"
import type { TaskInfoRawInterface } from "@/types/task"
import type { WorkTask } from "@/lib/work/types"

export interface TaskState {
  task?: WorkTask
  status: "loading" | "ready" | "error"
  retry: () => void
}

export function useTask(id: string | null | undefined): TaskState {
  const { data, isError, mutate } = useFetch<TaskInfoRawInterface>(id ? `${GetEndpointUrl.GetTaskInfo}/${id}` : "")
  return useMemo(
    () => ({
      task: data?.data,
      status: data ? "ready" : isError ? "error" : "loading",
      retry: () => {
        void mutate()
      },
    }),
    [data, isError, mutate],
  )
}
