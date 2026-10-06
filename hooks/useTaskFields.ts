"use client"

import { useCallback, useMemo } from "react"
import { usePost } from "@/hooks/usePost"
import { useTaskUpdate } from "@/hooks/useTaskUpdate"
import { PostEndpointUrl } from "@/services/endPoints"
import type { TaskInfoInterface } from "@/types/task"
import type { UserProfileDataInterface } from "@/types/user"

/**
 * Changes one field of a task the way a drop on a board does: shown at once,
 * put back if the server refuses (and the person is told). Who has it, for a
 * board grouped or laned by person; its priority, for lanes by priority.
 */
export function useTaskFields() {
  const post = usePost()
  const { optimisticUpdateTask, revalidateTaskKeys } = useTaskUpdate()

  const change = useCallback(
    (projectUuid: string, patch: Partial<TaskInfoInterface> & { task_uuid: string }, apiEndpoint: PostEndpointUrl, payload: Record<string, string>) => {
      optimisticUpdateTask(patch, projectUuid)
      return post
        .makeRequest({ apiEndpoint, payload: { task_uuid: patch.task_uuid, task_project_uuid: projectUuid, ...payload }, showErrorToast: true })
        .catch(() => revalidateTaskKeys(projectUuid))
    },
    [post, optimisticUpdateTask, revalidateTaskKeys],
  )

  return useMemo(
    () => ({
      /** To someone, or to nobody. */
      reassign: (taskUuid: string, projectUuid: string, assignee: UserProfileDataInterface | null) =>
        change(projectUuid, { task_uuid: taskUuid, task_assignee: assignee ?? undefined }, PostEndpointUrl.UpdateTaskAssignee, {
          task_assignee_uuid: assignee?.user_uuid ?? "",
        }),
      setPriority: (taskUuid: string, projectUuid: string, priority: string) =>
        change(projectUuid, { task_uuid: taskUuid, task_priority: priority }, PostEndpointUrl.UpdateTaskPriority, { task_priority: priority }),
    }),
    [change],
  )
}
