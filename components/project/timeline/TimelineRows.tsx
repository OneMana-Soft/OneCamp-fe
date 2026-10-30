"use client"

import { memo, type ComponentProps } from "react"

import { TaskStatusCell, statusKindOf } from "@/components/task/taskStatusCell"
import { StatusGlyph } from "@/components/ui/graphics/glyphs"
import { ChevronDown } from "@/lib/icons"
import type { StatusOption } from "@/lib/taskStatus"
import { cn } from "@/lib/utils/helpers/cn"
import { TimelineBar } from "./TimelineBar"

/**
 * The timeline's rows, drawn again only when what they show changes (F-1 #4,
 * FLUIDITY-LEAD): a scroll changes the virtualiser's window, and a row that
 * stays in view keeps its render. Every prop is a value or a stable function.
 */

/** A task's row on the timeline. */
export const ROW_HEIGHT = 36
/** A group's row: shorter than a task's, on the sunken step (work.md W23). */
export const GROUP_HEIGHT = 32

type BarProps = ComponentProps<typeof TimelineBar>

export const TimelineTaskRow = memo(function TimelineTaskRow({
  top,
  nameWidth,
  gridWidth,
  status,
  pending,
  onOpen,
  ...bar
}: BarProps & {
  top: number
  nameWidth: number
  gridWidth: number
  status: StatusOption | undefined
  pending: boolean
  onOpen: (taskUUID: string) => void
}) {
  const { task, done } = bar
  return (
    <div className="group/trow absolute left-0 flex" style={{ top, height: ROW_HEIGHT, width: nameWidth + gridWidth }}>
      <div
        data-sticky-lead=""
        className="sticky left-0 z-10 flex shrink-0 items-center gap-2.5 border-r border-line bg-sheet px-5 transition-colors group-hover/trow:bg-[color-mix(in_oklab,var(--sheet),var(--ink)_4%)]"
        style={{ width: nameWidth }}
      >
        {status && <TaskStatusCell status={status} label="tip" />}
        <button
          type="button"
          tabIndex={-1}
          onClick={() => !pending && onOpen(task.task_uuid)}
          className={cn("truncate text-left text-sm leading-5", done ? "text-ink-3" : "text-foreground")}
          title={task.task_name}
        >
          {task.task_name}
        </button>
      </div>
      <div className="relative transition-colors group-hover/trow:bg-hover" style={{ width: gridWidth }}>
        <TimelineBar {...bar} />
      </div>
    </div>
  )
})

export const TimelineGroupRow = memo(function TimelineGroupRow({
  id,
  top,
  width,
  nameWidth,
  first,
  label,
  count,
  collapsed,
  status,
  onToggle,
}: {
  id: string
  top: number
  width: number
  nameWidth: number
  first: boolean
  label: string
  count: number
  collapsed: boolean
  status: StatusOption | undefined
  onToggle: (id: string) => void
}) {
  return (
    <div data-timeline-group="" className={cn("absolute left-0 flex bg-sunken", !first && "border-t border-line")} style={{ top, height: GROUP_HEIGHT, width }}>
      <button
        type="button"
        aria-expanded={!collapsed}
        onClick={() => onToggle(id)}
        // At least the names column, and wider when its name needs it: a group's
        // header spans the chart too, so "In progress 10" is never cut (T-1).
        data-sticky-lead=""
        className="sticky left-0 z-10 flex shrink-0 items-center gap-2 border-r border-line bg-sunken px-5 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        style={{ minWidth: nameWidth }}
      >
        {status ? <StatusGlyph status={statusKindOf(status)} hue={status.hue} /> : null}
        <span className="whitespace-nowrap text-xs font-[510]">{label}</span>
        <span className="text-xs tabular-nums text-ink-3">{count}</span>
        <ChevronDown className={cn("ml-auto size-3.5 shrink-0 text-ink-3 transition-transform duration-[180ms]", collapsed && "-rotate-90")} />
      </button>
    </div>
  )
})
