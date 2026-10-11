"use client"

import type { DragEvent } from "react"
import { Button } from "@/components/ui/button"
import { CountTick } from "@/components/ui/CountTick"
import { TaskStatusCell } from "@/components/task/taskStatusCell"
import { GripVertical, X } from "@/lib/icons"
import { isPending, type TimelineTask } from "@/lib/timeline"
import { statusOptionOf, type StatusOption } from "@/lib/taskStatus"
import { cn } from "@/lib/utils/helpers/cn"

/** What a task dragged from the panel carries. */
export const UNSCHEDULED_DRAG = "application/x-onecamp-task"

/**
 * The open tasks with no dates (design v3, work.md W25): a 280px sheet that
 * floats inside the timeline, 8px in from the grid's edges, sliding in as the
 * task panel does. Admins drag a row onto a day to make it due then (a
 * one-day ghost bar follows the pointer, with its date); anyone can open one
 * to give it dates.
 */
export function UnscheduledPanel({
  tasks,
  statuses,
  canEdit,
  onOpenTask,
  onClose,
}: {
  tasks: TimelineTask[]
  statuses: StatusOption[]
  canEdit: boolean
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
      data-unscheduled=""
      className="absolute bottom-2 right-2 top-2 z-40 flex w-[280px] max-w-[calc(100%-1rem)] flex-col overflow-hidden rounded-xl bg-raised shadow-e3"
      style={{ animation: "work-panel-in 240ms var(--ease-in-out) both" }}
    >
      <div className="flex h-10 shrink-0 items-center justify-between gap-2 pl-4 pr-1.5">
        <p className="text-xs font-[510]">
          Unscheduled <span className="text-ink-3">·</span> <CountTick value={tasks.length} className="text-ink-3" />
        </p>
        <Button variant="ghost" size="icon" className="size-7 shrink-0" aria-label="Close Unscheduled" onClick={onClose}>
          <X className="size-4" />
        </Button>
      </div>
      {canEdit && tasks.length > 0 && <p className="px-4 pb-2 text-xs text-ink-3">Drag a task onto a day to make it due then.</p>}
      {tasks.length === 0 ? (
        <p className="p-4 text-sm text-ink-2">Every open task has a date.</p>
      ) : (
        <ul className="flex-1 overflow-y-auto px-1.5 pb-1.5">
          {tasks.map((t) => {
            const ready = !isPending(t)
            const status = statusOptionOf(t, statuses)
            return (
              <li key={t.task_uuid} style={{ animation: "work-fade-in 120ms var(--ease-out) both" }}>
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
                    "group/row flex h-9 items-center gap-2.5 rounded-md px-2.5 text-sm outline-none transition-colors hover:bg-hover focus-visible:ring-2 focus-visible:ring-ring",
                    canEdit && ready ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
                    !ready && "opacity-60",
                  )}
                >
                  {status && <TaskStatusCell status={status} label="tip" />}
                  <span className="min-w-0 flex-1 truncate">{t.task_name}</span>
                  {canEdit && ready && (
                    <GripVertical aria-hidden className="size-3.5 shrink-0 text-ink-4 opacity-100 transition-opacity [@media(hover:hover)]:opacity-0 group-hover/row:opacity-100" />
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </aside>
  )
}
