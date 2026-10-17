"use client"

import { useCallback } from "react"
import { toast } from "@/hooks/use-toast"
import { ToastAction } from "@/components/ui/toast"
import { useBulkTaskUpdate, type BulkResult } from "@/hooks/useBulkTaskUpdate"
import { notDone, tasksCount, whyNotDone } from "@/lib/bulkTasks"
import type { TaskInfoInterface } from "@/types/task"

/**
 * Deletes tasks, with Undo: the one way the app deletes them, from the task
 * panel, the phone's task sheet and a list's selection. They leave every list
 * and board at once, and the toast's Undo brings them back, as a doc's delete
 * does (components/docTree/docActions trash).
 *
 * The panel deleted on one click and the only way back was its own banner,
 * which no list shows (PTC-24); the phone's sheet left the task on its list.
 */
export function useDeleteTasks(listProjectId?: string) {
  const bulk = useBulkTaskUpdate(listProjectId)

  const restore = useCallback(
    async (tasks: TaskInfoInterface[]) => {
      const r = await bulk(tasks, { field: "restore" })
      if (r.failed > 0) toast({ variant: "destructive", title: notDone(r.failed, r.done.length, "brought back"), description: whyNotDone(r.error) })
      else if (r.done.length > 0) toast({ title: `Brought back ${named(r.done)}` })
    },
    [bulk],
  )

  return useCallback(
    async (tasks: TaskInfoInterface[]): Promise<BulkResult> => {
      const r = await bulk(tasks, { field: "delete" })
      if (r.failed > 0) {
        toast({
          variant: "destructive",
          title: notDone(r.failed, r.done.length, "deleted"),
          description: whyNotDone(r.error),
        })
      }
      if (r.done.length > 0) {
        // Undo brings back what this delete put in the trash. As they were
        // read before it, the tasks are live, and a restore passes over a
        // live task (lib/bulkTasks): Undo sent nothing and said nothing.
        const trashed = r.done.map((t) => ({ ...t, task_deleted_at: new Date().toISOString() }))
        toast({
          title: `Deleted ${named(trashed)}`,
          action: (
            <ToastAction altText="Undo: bring it back" onClick={() => void restore(trashed)}>
              Undo
            </ToastAction>
          ),
        })
      }
      return r
    },
    [bulk, restore],
  )
}

/** "“Book the launch retro”" for one task, "3 tasks" for more. */
const named = (tasks: TaskInfoInterface[]) => (tasks.length === 1 && tasks[0].task_name ? `“${tasks[0].task_name}”` : tasksCount(tasks.length))
