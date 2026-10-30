"use client"

import type { ReactNode } from "react"
import { ChatFace } from "@/components/message/chatFace"
import { RestrictedMark } from "@/components/task/BlockedBadge"
import TaskTypeGlyph from "@/components/task/TaskTypeGlyph"
import { TaskStatusCell } from "@/components/task/taskStatusCell"
import { SubtaskMark } from "./SubtaskMark"
import { MoreHorizontal } from "@/lib/icons"
import { displayNameOf } from "@/lib/personName"
import { isClosedStatus, statusOptionOf } from "@/lib/taskStatus"
import { cn } from "@/lib/utils/helpers/cn"
import { hoursText, type BacklogTask } from "@/lib/work/backlog"
import { pointsLabel, pointsText, type EstimateScale } from "@/lib/work/points"
import type { useProjectStatuses } from "@/hooks/useProjectStatuses"

/**
 * A backlog row, as a list row reads (STEP4 #8, spec F): the status, the
 * type's glyph and the key, the title, a ring of its sub-tasks when it has
 * any ("2/5"), its points when the project estimates in them, its estimate
 * in hours and its assignee. Opening it opens the task; on a
 * phone, ⋯ opens the row's sheet ("Move to…"). lead goes first: on a
 * computer, its box in the selection.
 */
export function BacklogRow({
  task: t,
  options,
  onOpen,
  onMove,
  lead,
  scale,
}: {
  task: BacklogTask
  options: ReturnType<typeof useProjectStatuses>["options"]
  /** The project's scale, when it estimates in points (linear-05). */
  scale?: EstimateScale | null
  onOpen: () => void
  onMove?: () => void
  lead?: ReactNode
}) {
  const status = statusOptionOf(t, options)
  const done = isClosedStatus(t.task_status)
  const subs = t.task_sub_task_count ?? 0
  const subsDone = t.task_sub_task_done ?? 0
  return (
    <div className="group flex min-h-9 items-center gap-2 rounded-lg px-2 transition-colors hover:bg-hover pointer-coarse:min-h-11" data-backlog-row="">
      {lead}
      {status ? <TaskStatusCell status={status} label="tip" /> : <span className="size-4 shrink-0" />}
      {t.task_key && (
        <span data-task-key="" className="flex shrink-0 items-center gap-1 text-meta font-[510] tabular-nums text-ink-3">
          {t.task_work_type && <TaskTypeGlyph type={t.task_work_type} className="size-3" />}
          {t.task_key}
        </span>
      )}
      <button
        type="button"
        onClick={onOpen}
        className={cn("min-w-0 flex-1 truncate text-left text-sm font-[450]", done ? "text-ink-3 line-through decoration-ink-4" : "text-foreground")}
      >
        {t.task_name}
      </button>
      <RestrictedMark restricted={t.task_restricted} />
      <SubtaskMark done={subsDone} total={subs} />
      {/* On a phone the title has the room: the points and the estimate are in the header's total. */}
      {scale && t.task_estimate_points !== undefined ? (
        <span className="shrink-0 rounded-sm bg-sunken px-1.5 text-meta font-[510] tabular-nums text-ink-2 max-sm:hidden" data-task-points="">
          <span className="sr-only">{scale.kind === "tshirt" ? `Size ${pointsLabel(scale, t.task_estimate_points)}` : pointsText(t.task_estimate_points)}</span>
          <span aria-hidden>{pointsLabel(scale, t.task_estimate_points)}</span>
        </span>
      ) : null}
      {t.task_estimate_minutes ? <span className="shrink-0 text-meta tabular-nums text-ink-2 max-sm:hidden">{hoursText(t.task_estimate_minutes)}</span> : null}
      {t.task_assignee?.user_uuid ? (
        <ChatFace name={displayNameOf(t.task_assignee)} profileKey={t.task_assignee.user_profile_object_key} userUUID={t.task_assignee.user_uuid} size={20} />
      ) : null}
      {onMove && (
        <button
          type="button"
          onClick={onMove}
          aria-label={`Move ${t.task_name}`}
          className="-mr-1 inline-flex size-11 shrink-0 items-center justify-center rounded-md text-ink-3 hover:bg-hover"
        >
          <MoreHorizontal className="size-4" aria-hidden="true" />
        </button>
      )}
    </div>
  )
}
