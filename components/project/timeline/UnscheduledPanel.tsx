"use client"

import { useDraggable } from "@dnd-kit/core"
import { Button } from "@/components/ui/button"
import { CountTick } from "@/components/ui/CountTick"
import { TaskStatusCell } from "@/components/task/taskStatusCell"
import { GripVertical, X } from "@/lib/icons"
import { isPending, type TimelineTask } from "@/lib/timeline"
import { statusOptionOf, type StatusOption } from "@/lib/taskStatus"
import { ix } from "@/lib/ui/interactive"
import { cn } from "@/lib/utils/helpers/cn"

/** The kind a task dragged from the panel carries (its drag's data.type). */
export const UNSCHEDULED_DRAG = "application/x-onecamp-task"

/**
 * The open tasks with no dates (design v3, work.md W25): a 280px sheet that
 * floats inside the timeline, 8px in from the grid's edges, sliding in as the
 * task panel does. Admins drag a row onto a day to make it due then (a
 * one-day ghost bar follows the pointer, with its date), with a mouse, a
 * finger held a beat, or the keyboard (Space, then ← and →): the shared drag
 * of lib/ui/dnd, which the timeline sets up. Anyone can open one to give it
 * dates.
 */
export function UnscheduledPanel({
  tasks,
  statuses,
  canEdit,
  onOpenTask,
  onClose,
  away,
}: {
  tasks: TimelineTask[]
  statuses: StatusOption[]
  canEdit: boolean
  onOpenTask: (taskUUID: string) => void
  onClose: () => void
  /** The task being dragged out: its row is the slot it left. */
  away?: string | null
}) {
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
          {tasks.map((t) => (
            <UnscheduledRow
              key={t.task_uuid}
              task={t}
              status={statusOptionOf(t, statuses)}
              canEdit={canEdit}
              away={away === t.task_uuid}
              onOpenTask={onOpenTask}
            />
          ))}
        </ul>
      )}
    </aside>
  )
}

function UnscheduledRow({
  task: t,
  status,
  canEdit,
  away,
  onOpenTask,
}: {
  task: TimelineTask
  status: StatusOption | undefined
  canEdit: boolean
  away: boolean
  onOpenTask: (taskUUID: string) => void
}) {
  const ready = !isPending(t)
  const movable = canEdit && ready
  const { attributes, listeners, setNodeRef } = useDraggable({ id: t.task_uuid, data: { type: UNSCHEDULED_DRAG }, disabled: !movable })
  return (
    <li style={{ animation: "work-fade-in 120ms var(--ease-out) both" }}>
      <div
        ref={setNodeRef}
        {...attributes}
        {...ix("row")}
        role="button"
        tabIndex={ready ? 0 : -1}
        aria-disabled={!ready || undefined}
        aria-roledescription={movable ? "draggable task" : undefined}
        aria-describedby={movable ? attributes["aria-describedby"] : undefined}
        data-drag-state={away ? "placeholder" : undefined}
        {...listeners}
        onClick={() => ready && onOpenTask(t.task_uuid)}
        onKeyDown={(e) => {
          // Enter opens it; Space picks it up when it can move (the shared
          // drag's key), and opens it when it can't.
          if (ready && (e.key === "Enter" || (e.key === " " && !movable))) {
            e.preventDefault()
            onOpenTask(t.task_uuid)
            return
          }
          listeners?.onKeyDown?.(e)
        }}
        className={cn("group/row flex h-9 items-center gap-2.5 rounded-md px-2.5 text-sm", movable && "cursor-grab")}
      >
        {status && <TaskStatusCell status={status} label="tip" />}
        <span className="min-w-0 flex-1 truncate">{t.task_name}</span>
        {movable && (
          <GripVertical aria-hidden className="size-3.5 shrink-0 text-ink-4 opacity-100 transition-opacity [@media(hover:hover)]:opacity-0 group-hover/row:opacity-100 group-focus-visible/row:opacity-100" />
        )}
      </div>
    </li>
  )
}
