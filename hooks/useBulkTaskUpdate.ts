"use client"

import { useCallback } from "react"
import axiosInstance, { OWN_ERRORS } from "@/lib/axiosInstance"
import { appMutate } from "@/lib/swrMutate"
import { bulkRequest, type BulkChange } from "@/lib/bulkTasks"
import { settleLimited } from "@/lib/utils/settleLimited"
import { useTaskUpdate } from "@/hooks/useTaskUpdate"
import { GetEndpointUrl } from "@/services/endPoints"
import type { TaskInfoInterface } from "@/types/task"

export interface BulkResult {
  /** Saved. */
  changed: number
  /** Refused by the server, and put back on screen. */
  failed: number
  /** Already that way, so nothing was sent. */
  unchanged: number
}

/** Requests at a time: enough to be quick, few enough to leave the server room. */
const AT_ONCE = 4

/**
 * Applies one change to many tasks: shown on every list and board at once,
 * then saved task by task through the single-task endpoints, and put back
 * where the server refused. The caller says how it went (one message for the
 * lot, not one per task, so failures are quiet here).
 */
export function useBulkTaskUpdate(listProjectId?: string) {
  const { optimisticUpdateTask, revalidateTaskKeys } = useTaskUpdate()
  return useCallback(
    async (tasks: TaskInfoInterface[], change: BulkChange): Promise<BulkResult> => {
      const work = tasks.flatMap((task) => {
        const request = bulkRequest(task, change)
        const project = task.task_project?.project_uuid || listProjectId
        return request && project ? [{ task, request, project }] : []
      })
      for (const w of work) optimisticUpdateTask({ task_uuid: w.task.task_uuid, ...w.request.patch }, w.project)
      const results = await settleLimited(work, AT_ONCE, (w) =>
        axiosInstance.post(w.request.endpoint, { task_uuid: w.task.task_uuid, task_project_uuid: w.project, ...w.request.payload }, OWN_ERRORS),
      )
      const refused = work.filter((_, i) => results[i].status === "rejected")
      for (const project of new Set(refused.map((w) => w.project))) revalidateTaskKeys(project)
      // A task open in the panel shows its new status, assignee or tags too.
      const opened = new Set(work.map((w) => `${GetEndpointUrl.GetTaskInfo}/${w.task.task_uuid}`))
      void appMutate((key) => typeof key === "string" && opened.has(key))
      return { changed: work.length - refused.length, failed: refused.length, unchanged: tasks.length - work.length }
    },
    [listProjectId, optimisticUpdateTask, revalidateTaskKeys],
  )
}
