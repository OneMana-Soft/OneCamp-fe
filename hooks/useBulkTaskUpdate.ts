"use client"

import { useCallback } from "react"
import type { BulkChange } from "@/lib/bulkTasks"
import { useTaskUpdate } from "@/hooks/useTaskUpdate"
import type { TaskInfoInterface } from "@/types/task"

export interface BulkResult {
  /** Saved. */
  changed: number
  /** Refused by the server, and put back on screen. */
  failed: number
  /** Already that way, so nothing was sent. */
  unchanged: number
  /** The tasks saved, for an Undo. */
  done: TaskInfoInterface[]
  /** The first refusal (lib/bulkTasks whyNotDone). */
  error?: unknown
}

export type BulkDeps = Pick<ReturnType<typeof useTaskUpdate>, "optimisticUpdateTask" | "optimisticDeleteTask" | "revalidateTaskKeys">

/**
 * Applies one change to many tasks: shown on every list and board at once,
 * then saved (lib/work/bulkApply, loaded on first use) and put back where the
 * server refused. The caller says how it went.
 */
export function useBulkTaskUpdate(listProjectId?: string) {
  const { optimisticUpdateTask, optimisticDeleteTask, revalidateTaskKeys } = useTaskUpdate()
  return useCallback(
    async (tasks: TaskInfoInterface[], change: BulkChange): Promise<BulkResult> =>
      (await import("@/lib/work/bulkApply")).applyBulk({ optimisticUpdateTask, optimisticDeleteTask, revalidateTaskKeys }, listProjectId, tasks, change),
    [listProjectId, optimisticUpdateTask, optimisticDeleteTask, revalidateTaskKeys],
  )
}
