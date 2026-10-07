"use client"

import { useCallback } from "react"
import { toast } from "@/hooks/use-toast"
import { useTaskUpdate } from "@/hooks/useTaskUpdate"
import axiosInstance, { OWN_ERRORS } from "@/lib/axiosInstance"
import { appMutate } from "@/lib/swrMutate"
import { timelineKey } from "@/lib/timelineKey"
import type { TimelineData } from "@/lib/timeline"
import { apiErrorMessage } from "@/lib/utils/apiError"
import { GetEndpointUrl, PostEndpointUrl } from "@/services/endPoints"

/**
 * Making a task of a project wait on another, or stop waiting: from the
 * timeline (an arrow drawn between bars) and from a task's panel. The arrow
 * shows at once; then the board's and the list's "blocked" marks and both
 * tasks' panels are fetched again, and a refusal (a loop, another project) is
 * explained and the timeline put back.
 */
export function useTaskDependencies(projectId: string) {
  const { revalidateTaskKeys } = useTaskUpdate()

  return useCallback(
    async (taskId: string, blockerId: string, remove = false) => {
      void appMutate(
        timelineKey(projectId),
        (current: { data?: TimelineData } | undefined) => {
          if (!current?.data) return current
          const tasks = current.data.tasks.map((t) => {
            if (t.task_uuid !== taskId) return t
            const others = (t.task_blocked_by ?? []).filter((b) => b.task_uuid !== blockerId)
            return { ...t, task_blocked_by: remove ? others : [...others, { task_uuid: blockerId }] }
          })
          return { ...current, data: { ...current.data, tasks } }
        },
        { revalidate: false },
      )
      let ok = true
      try {
        await axiosInstance.post(
          remove ? PostEndpointUrl.RemoveTaskDependency : PostEndpointUrl.AddTaskDependency,
          { task_uuid: taskId, blocked_by_uuid: blockerId },
          OWN_ERRORS,
        )
      } catch (err) {
        ok = false
        toast({
          variant: "destructive",
          title: remove ? "The dependency wasn't removed" : "The dependency wasn't added",
          description: apiErrorMessage(err, "Try again in a moment."),
        })
      }
      revalidateTaskKeys(projectId)
      void appMutate(`${GetEndpointUrl.GetTaskInfo}/${taskId}`)
      void appMutate(`${GetEndpointUrl.GetTaskInfo}/${blockerId}`)
      return ok
    },
    [projectId, revalidateTaskKeys],
  )
}
