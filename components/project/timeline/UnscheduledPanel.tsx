"use client"

import type { DragEvent } from "react"
import { Button } from "@/components/ui/button"
import { X } from "@/lib/icons"
import { isPending, type TimelineTask } from "@/lib/timeline"
import { cn } from "@/lib/utils/helpers/cn"

/** What a task dragged from the panel carries. */
export const UNSCHEDULED_DRAG = "application/x-onecamp-task"

/**
 * The open tasks with no dates. Admins drag one onto a day to make it due
 * then (Asana's Unscheduled drawer); anyone can open one to give it dates.
 * On a phone it slides over the timeline instead of standing beside it.
 */
export function UnscheduledPanel({
  tasks,
  canEdit,
  overlay,
  onOpenTask,
  onClose,
}: {
  tasks: TimelineTask[]
  canEdit: boolean
  overlay: boolean
  onOpenTask: (taskUUID: string) => void
  onClose: () => void
}) {
  const start = (e: DragEvent, t: TimelineTask) => {
    e.dataTransfer.setData(UNSCHEDULED_DRAG, t.task_uuid)
    e.dataTransfer.effectAllowed = "move"
  }
  return (
    <aside
      aria-label="Tasks with no dates"
      className={cn("flex w-64 shrink-0 flex-col border-l bg-background", overlay && "absolute inset-y-0 right-0 z-40 shadow-xl")}
    >
      <div className="flex items-start justify-between gap-2 border-b px-3 py-2">
        <div className="min-w-0">
          <p className="text-sm font-medium">Unscheduled</p>
          <p className="text-xs text-muted-foreground">
            {canEdit ? "Drag a task onto a day to make it due then." : "Open a task to see or give it dates."}
          </p>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" aria-label="Close Unscheduled" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>
      {tasks.length === 0 ? (
        <p className="p-4 text-sm text-muted-foreground">Every open task has a date.</p>
      ) : (
        <ul className="flex-1 overflow-y-auto p-2">
          {tasks.map((t) => {
            const ready = !isPending(t)
            return (
              <li key={t.task_uuid}>
                <div
                  role="button"
                  tabIndex={ready ? 0 : -1}
                  aria-disabled={!ready}
                  draggable={canEdit && ready}
                  onDragStart={(e) => start(e, t)}
                  onClick={() => ready && onOpenTask(t.task_uuid)}
                  onKeyDown={(e) => {
                    if (ready && (e.key === "Enter" || e.key === " ")) {
                      e.preventDefault()
                      onOpenTask(t.task_uuid)
                    }
                  }}
                  className={cn(
                    "truncate rounded-md px-2 py-1.5 text-sm outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring",
                    canEdit && ready ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
                    !ready && "opacity-60",
                  )}
                  title={t.task_name}
                >
                  {t.task_name}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </aside>
  )
}
