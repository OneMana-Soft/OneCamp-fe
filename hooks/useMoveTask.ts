"use client"

import { useCallback } from "react"
import { usePost } from "@/hooks/usePost"
import { useTaskUpdate } from "@/hooks/useTaskUpdate"
import { PostEndpointUrl } from "@/services/endPoints"
import type { SettledDrop } from "@/lib/utils/kanbanDrop"
import type { TaskStatusFields } from "@/lib/taskStatus"

/**
 * Saves a card dropped on a board: its column and its place in it. The board
 * shows the result at once; if the server refuses, the board is fetched again
 * so the card goes back to where it really is, and the person is told.
 */
export function useMoveTask() {
  const post = usePost()
  const { optimisticUpdateTask, revalidateTaskKeys } = useTaskUpdate()

  return useCallback(
    // drop.column is the column's status value: a built-in key or a project's
    // own status id, which the server accepts as is. patch is what the task
    // becomes (lib/taskStatus statusPatch), for the cache until it answers.
    (taskUuid: string, projectUuid: string, drop: SettledDrop<{ task_uuid: string }>, patch: TaskStatusFields) => {
      optimisticUpdateTask({ task_uuid: taskUuid, ...patch }, projectUuid, drop.index, { before: drop.before, after: drop.after })
      return post
        .makeRequest({
          apiEndpoint: PostEndpointUrl.MoveTask,
          payload: {
            task_uuid: taskUuid,
            task_status: drop.column,
            before_task_uuid: drop.before,
            after_task_uuid: drop.after,
          },
          showErrorToast: true,
        })
        .catch(() => revalidateTaskKeys(projectUuid))
    },
    [post, optimisticUpdateTask, revalidateTaskKeys],
  )
}
