"use client"

import { useCallback } from "react"
import { toast } from "@/hooks/use-toast"
import { useTaskUpdate } from "@/hooks/useTaskUpdate"
import axiosInstance, { OWN_ERRORS } from "@/lib/axiosInstance"
import { appMutate } from "@/lib/swrMutate"
import { withWay, type DependencyWay } from "@/lib/tasks/dependency"
import { timelineKey } from "@/lib/timelineKey"
import type { TimelineData } from "@/lib/timeline"
import { apiErrorMessage } from "@/lib/utils/apiError"
import { GetEndpointUrl, PostEndpointUrl } from "@/services/endPoints"
import type { TaskInfoInterface } from "@/types/task"

const FINISH_TO_START: DependencyWay = { kind: "fs", lag: 0 }

/** A task's panel as SWR holds it, with one of its dependency lists' entries changed. */
function changeEntry(list: "task_blocked_by" | "task_blocks", other: string, way: DependencyWay) {
  return (current: { data?: TaskInfoInterface } | undefined) => {
    const entries = current?.data?.[list]
    if (!current?.data || !entries?.some((t) => t.task_uuid === other)) return current
    return { ...current, data: { ...current.data, [list]: entries.map((t) => (t.task_uuid === other ? withWay(t, list, way) : t)) } }
  }
}

/**
 * Making a task of a project wait on another, changing how, or stopping it:
 * from the timeline (an arrow drawn between bars) and from a task's panel.
 * The arrow, and a change of kind or lag, show at once; then the board's and
 * the list's "blocked" marks and both tasks' panels are fetched again, and a
 * refusal (a loop, another project) is explained and the timeline put back.
 * A new dependency is finish to start unless way says otherwise.
 */
export function useTaskDependencies(projectId: string) {
  const { revalidateTaskKeys } = useTaskUpdate()

  return useCallback(
    async (taskId: string, blockerId: string, remove = false, way: DependencyWay = FINISH_TO_START) => {
      void appMutate(
        timelineKey(projectId),
        (current: { data?: TimelineData } | undefined) => {
          if (!current?.data) return current
          const tasks = current.data.tasks.map((t) => {
            if (t.task_uuid !== taskId) return t
            const was = t.task_blocked_by ?? []
            if (remove) return { ...t, task_blocked_by: was.filter((b) => b.task_uuid !== blockerId) }
            const entry = withWay(was.find((b) => b.task_uuid === blockerId) ?? { task_uuid: blockerId }, "task_blocked_by", way)
            return { ...t, task_blocked_by: [...was.filter((b) => b.task_uuid !== blockerId), entry] }
          })
          return { ...current, data: { ...current.data, tasks } }
        },
        { revalidate: false },
      )
      if (!remove) {
        void appMutate(`${GetEndpointUrl.GetTaskInfo}/${taskId}`, changeEntry("task_blocked_by", blockerId, way), { revalidate: false })
        void appMutate(`${GetEndpointUrl.GetTaskInfo}/${blockerId}`, changeEntry("task_blocks", taskId, way), { revalidate: false })
      }
      let ok = true
      try {
        await axiosInstance.post(
          remove ? PostEndpointUrl.RemoveTaskDependency : PostEndpointUrl.AddTaskDependency,
          remove ? { task_uuid: taskId, blocked_by_uuid: blockerId } : { task_uuid: taskId, blocked_by_uuid: blockerId, kind: way.kind, lag: way.lag },
          OWN_ERRORS,
        )
      } catch (err) {
        ok = false
        toast({
          variant: "destructive",
          title: remove ? "The dependency wasn't removed" : "The dependency wasn't saved",
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
