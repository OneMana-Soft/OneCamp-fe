"use client"

import { useCallback } from "react"
import { toast } from "@/hooks/use-toast"
import { ToastAction } from "@/components/ui/toast"
import { useBulkTaskUpdate, type BulkResult } from "@/hooks/useBulkTaskUpdate"
import { notDone, tasksCount } from "@/lib/bulkTasks"
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
      if (r.failed > 0) toast({ variant: "destructive", title: notDone(r.failed, r.done.length, "brought back"), description: "The list shows them as they are." })
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
          description: "You may no longer be an admin of their project. The list shows them as they are.",
        })
      }
      if (r.done.length > 0) {
        const done = r.done
        toast({
          title: `Deleted ${named(done)}`,
          action: (
            <ToastAction altText="Undo: bring it back" onClick={() => void restore(done)}>
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
