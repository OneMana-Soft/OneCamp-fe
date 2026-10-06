"use client"

import { useCallback } from "react"
import { usePost } from "@/hooks/usePost"
import { useTaskUpdate } from "@/hooks/useTaskUpdate"
import { PostEndpointUrl } from "@/services/endPoints"
import type { UserProfileDataInterface } from "@/types/user"

/**
 * Gives a task to someone (or to nobody), the way a drop on a board grouped
 * by assignee does: shown at once, put back if the server refuses.
 */
export function useReassignTask() {
  const post = usePost()
  const { optimisticUpdateTask, revalidateTaskKeys } = useTaskUpdate()
  return useCallback(
    (taskUuid: string, projectUuid: string, assignee: UserProfileDataInterface | null) => {
      optimisticUpdateTask({ task_uuid: taskUuid, task_assignee: assignee ?? undefined }, projectUuid)
      return post
        .makeRequest({
          apiEndpoint: PostEndpointUrl.UpdateTaskAssignee,
          payload: { task_uuid: taskUuid, task_project_uuid: projectUuid, task_assignee_uuid: assignee?.user_uuid ?? "" },
          showErrorToast: true,
        })
        .catch(() => revalidateTaskKeys(projectUuid))
    },
    [post, optimisticUpdateTask, revalidateTaskKeys],
  )
}
