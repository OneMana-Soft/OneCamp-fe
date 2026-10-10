"use client"

import { memo, type KeyboardEvent, type PointerEvent } from "react"
import { Check, Lock } from "@/lib/icons"
import type { EditKind, TimelineTask } from "@/lib/timeline"
import { cn } from "@/lib/utils/helpers/cn"

/**
 * Whether a bar holds its whole name: a 12px name runs about 7px a character,
 * plus the bar's padding and its status mark. A bar that can't has the name
 * beside it in full, rather than cut to "Record the…" inside it.
 */
const fitsName = (name: string, width: number, icons: number) => name.length * 7 + 24 + icons * 16 <= width

interface BarProps {
  task: TimelineTask
  left: number
  width: number
  /** Fill and text classes (lib/timeline barColor): one neutral, quieter once done. */
  color: string
  /** The status's dot colour (lib/timeline dotColor), a short mark at the bar's start. */
  mark: string
  label: string
  /** The new dates, while it's being dragged. */
  dragLabel?: string
  late: boolean
  done: boolean
  canEdit: boolean
  /** Where a name scrolled past the left edge stops, so a long bar keeps its name in view. */
  stickAt: number
  /** How many open tasks it waits on: a lock before its name. */
  blocked: number
  /** Start drawing a dependency from this bar to a task that waits on it. */
  onLinkStart?: (e: PointerEvent, task: TimelineTask) => void
  /** A dependency being drawn would end on this bar. */
  linkTarget?: boolean
  helpId?: string
  onPointerDown: (e: PointerEvent, task: TimelineTask, kind: EditKind) => void
  onKeyDown: (e: KeyboardEvent, task: TimelineTask) => void
  onClick: (task: TimelineTask) => void
}

/**
 * One task's bar. Drag it to move it, or drag an end to change when it starts
 * or is due; arrows do the same from the keyboard. A click opens the task.
 */
export const TimelineBar = memo(function TimelineBar({
  task,
  left,
  width,
  color,
  mark,
  label,
  dragLabel,
  late,
  done,
  canEdit,
  stickAt,
  blocked,
  onLinkStart,
  linkTarget,
  helpId,
  onPointerDown,
  onKeyDown,
  onClick,
}: BarProps) {
  const inside = fitsName(task.task_name, width, (done ? 1 : 0) + (blocked > 0 ? 1 : 0))
  const handles = canEdit && width >= 18
  const waiting = blocked > 0 ? `, waiting on ${blocked} ${blocked === 1 ? "task" : "tasks"}` : ""
  // Room after the bar for the dependency handle, then the name of a short bar.
  const after = canEdit && onLinkStart ? 22 : 6
  return (
    <>
      <div
        role="button"
        tabIndex={0}
        data-bar={task.task_uuid}
        aria-label={`${task.task_name}, ${label}${late ? ", late" : ""}${done ? ", done" : ""}${waiting}`}
        aria-describedby={canEdit ? helpId : undefined}
        title={`${task.task_name} · ${label}`}
        className={cn(
          "group/bar absolute top-[7px] flex h-[22px] items-center rounded-sm text-xs font-medium outline-none",
          "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          color,
          linkTarget && "ring-2 ring-primary ring-offset-2 ring-offset-background",
          dragLabel ? "z-10 cursor-grabbing" : canEdit ? "cursor-grab" : "cursor-pointer",
        )}
        style={{ left, width }}
        onPointerDown={(e) => onPointerDown(e, task, "move")}
        onKeyDown={(e) => onKeyDown(e, task)}
        onClick={() => onClick(task)}
      >
        {/* The status, as a short mark where the bar starts. */}
        <span aria-hidden className={cn("pointer-events-none absolute inset-y-0 left-0 w-[3px] rounded-l-sm", mark)} />
        {/* Late: a rule under the bar in the danger token, not a ring around it. */}
        {late && <span aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 rounded-b-sm bg-destructive" />}
        {handles && (
          <span
            aria-hidden
            className="absolute inset-y-0 left-0 w-2 cursor-ew-resize rounded-l-sm hover:bg-foreground/15"
            onPointerDown={(e) => onPointerDown(e, task, "start")}
          />
        )}
        {inside && (
          <span className="sticky flex min-w-0 items-center gap-1 pl-2.5 pr-2" style={{ left: stickAt }}>
            {done && <Check className="h-3 w-3 shrink-0" />}
            {blocked > 0 && <Lock aria-hidden className="h-3 w-3 shrink-0" />}
            <span className="truncate">{task.task_name}</span>
          </span>
        )}
        {handles && (
          <span
            aria-hidden
            className="absolute inset-y-0 right-0 w-2 cursor-ew-resize rounded-r-sm hover:bg-foreground/15"
            onPointerDown={(e) => onPointerDown(e, task, "end")}
          />
        )}
        {canEdit && onLinkStart && (
          <span
            aria-hidden
            title="Drag to the task that waits on this one"
            className="absolute -right-[18px] top-1/2 h-3 w-3 -translate-y-1/2 cursor-crosshair rounded-full border-2 border-primary bg-background opacity-0 transition-opacity group-hover/bar:opacity-100"
            onPointerDown={(e) => onLinkStart(e, task)}
          />
        )}
        {dragLabel && (
          <span className="pointer-events-none absolute -top-7 left-0 whitespace-nowrap rounded-md border bg-popover px-1.5 py-0.5 text-2xs font-medium text-popover-foreground shadow-overlay">
            {dragLabel}
          </span>
        )}
      </div>
      {!inside && (
        <span
          aria-hidden
          className={cn("pointer-events-none absolute top-[7px] flex h-[22px] items-center gap-1 whitespace-nowrap text-xs", done ? "text-faint-foreground line-through" : late ? "text-destructive" : "text-muted-foreground")}
          style={{ left: left + width + after }}
        >
          {blocked > 0 && <Lock className="h-3 w-3 shrink-0" />}
          {task.task_name}
        </span>
      )}
    </>
  )
})
