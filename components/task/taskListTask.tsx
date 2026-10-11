import Link from "next/link"
import { useRouter } from "next/navigation"
import React, { useCallback, useRef, useState } from "react"

import { TaskInfoInterface } from "@/types/task"
import { app_task_path } from "@/types/paths"
import { statusOptionOf } from "@/lib/taskStatus"
import { splitTags } from "@/lib/tags"
import { hueFor } from "@/lib/campHue"
import { cn } from "@/lib/utils/helpers/cn"
import { prefersReducedMotion } from "@/lib/celebrate"
import { feedback } from "@/lib/ui/feedback"
import { CalendarDays, Check, GitBranch, MessageSquare, MoreHorizontal } from "@/lib/icons"
import { HUE_CLASS } from "@/components/ui/graphics/hues"
import { ProjectTile } from "@/components/ui/graphics/ProjectTile"
import { TaskCheck, TaskTitle } from "@/components/task/TaskCheck"
import { TaskPriorityCell } from "@/components/task/taskPriorityCell"
import { DueLabel } from "@/components/task/DueLabel"
import { BlockedBadge } from "@/components/task/BlockedBadge"
import { GitHubBadgeGroup } from "@/components/task/PRStatusBadge"
import { TaskAvatar } from "@/components/task/taskRowParts"

/** How far a row must travel to act (work.md W53). */
export const SWIPE_THRESHOLD = 72
const ACTIONS_W = 144

/**
 * The phone's task row (design v3, work.md W53): 56 px, two lines. The check
 * (the status glyph, 20 px in a 44 px target) runs the finish sequence; line
 * one is the title and the due date, line two the priority glyph, labels as
 * dots, the project on My Tasks, badges and the assignee.
 *
 * Swipe right past 72 px completes: a moss band opens under the row with a
 * white check that grows as it arms. Swipe left shows Due and More. A swipe
 * that falls short springs back. Under reduced motion the swipes still work;
 * the check doesn't grow and nothing springs.
 */
export const TaskListTask = ({
  taskInfo,
  onToggleStatus,
  isAdmin,
  selectionMode,
  isSelected,
  onToggleSelect,
  showProject = true,
  showAssignee = true,
}: {
  taskInfo: TaskInfoInterface
  onToggleStatus: (task_uuid: string, projectId: string, newStatus: "done" | "todo") => void
  isAdmin: boolean
  isAnimating: boolean
  selectionMode?: boolean
  isSelected?: boolean
  onToggleSelect?: (taskUUID: string) => void
  /** The project chip on line two: on My Tasks, not inside the project itself. */
  showProject?: boolean
  /** The assignee on line two: not on My Tasks, where every task is yours. */
  showAssignee?: boolean
}) => {
  const router = useRouter()
  const taskHref = `${app_task_path}/${taskInfo.task_uuid}`
  const isCompleted = taskInfo.task_status === "done"
  const [justDone, setJustDone] = useState(false)
  const status = statusOptionOf(taskInfo)
  const tags = splitTags(taskInfo.task_label)
  const project = taskInfo.task_project

  const toggle = useCallback(
    (done: boolean) => {
      if (done) setJustDone(true)
      onToggleStatus(taskInfo.task_uuid, project?.project_uuid, done ? "done" : "todo")
    },
    [onToggleStatus, taskInfo.task_uuid, project?.project_uuid],
  )

  // The swipe: the row's x, followed by transform while the finger is down.
  const row = useRef<HTMLDivElement>(null)
  const start = useRef<{ x: number; y: number; dx: number; lock: "x" | "y" | null } | null>(null)
  const [dx, setDx] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [open, setOpen] = useState(false)
  const armed = dx >= SWIPE_THRESHOLD
  const armedRef = useRef(false)

  const down = (e: React.PointerEvent) => {
    if (e.pointerType === "mouse" || selectionMode || !isAdmin) return
    start.current = { x: e.clientX, y: e.clientY, dx: open ? -ACTIONS_W : 0, lock: null }
  }
  const move = (e: React.PointerEvent) => {
    const s = start.current
    if (!s) return
    const mx = e.clientX - s.x
    const my = e.clientY - s.y
    if (!s.lock) {
      if (Math.abs(mx) < 8 && Math.abs(my) < 8) return
      s.lock = Math.abs(mx) > Math.abs(my) ? "x" : "y"
    }
    if (s.lock !== "x") return
    setDragging(true)
    const next = Math.max(-ACTIONS_W, Math.min(140, s.dx + mx))
    const isArmed = next >= SWIPE_THRESHOLD
    if (isArmed !== armedRef.current) {
      armedRef.current = isArmed
      // The swipe crossing its full-swipe threshold (mobile F3: medium).
      if (isArmed) feedback("medium")
    }
    setDx(next)
  }
  const dxRef = useRef(0)
  dxRef.current = dx
  const up = () => {
    const dx = dxRef.current
    const s = start.current
    start.current = null
    setDragging(false)
    if (!s || s.lock !== "x") return
    armedRef.current = false
    if (dx >= SWIPE_THRESHOLD && !isCompleted) {
      setDx(0)
      setOpen(false)
      // The finish runs from the check, which bursts from where it was revealed.
      row.current?.querySelector<HTMLButtonElement>("[data-task-check]")?.click()
      return
    }
    if (dx <= -ACTIONS_W / 2) {
      setDx(-ACTIONS_W)
      setOpen(true)
    } else {
      setDx(0)
      setOpen(false)
    }
  }

  const reduced = prefersReducedMotion()
  const settle = dragging || reduced ? "none" : "transform 220ms var(--ease-spring)"

  return (
    <div className="relative overflow-hidden" data-phone-task-row="">
      {/* Under the row: the moss band (complete) on the left, Due and More on the right. */}
      <div aria-hidden="true" data-swipe-complete="" className="absolute inset-y-0 left-0 flex items-center bg-camp-moss pl-5 text-white" style={{ width: Math.max(0, dx) }}>
        <Check className="size-5 transition-transform duration-[140ms]" style={{ transform: reduced ? undefined : `scale(${armed ? 1 : 0.6})` }} />
      </div>
      <div className="absolute inset-y-0 right-0 flex" style={{ width: ACTIONS_W }} data-swipe-actions="" aria-hidden={!open}>
        <button type="button" tabIndex={open ? 0 : -1} onClick={() => router.push(taskHref)} className="hue-sun flex w-[72px] flex-col items-center justify-center gap-1 bg-hue-tint text-micro text-hue-ink">
          <CalendarDays className="size-5" aria-hidden="true" />
          Due
        </button>
        <button type="button" tabIndex={open ? 0 : -1} onClick={() => router.push(taskHref)} className="flex w-[72px] flex-col items-center justify-center gap-1 bg-press text-micro text-ink-2">
          <MoreHorizontal className="size-5" aria-hidden="true" />
          More
        </button>
      </div>
      <div
        ref={row}
        data-swipe-row=""
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        className={cn("relative flex h-14 items-center bg-sheet pr-4 active:bg-press", isSelected && "bg-sel")}
        style={{ transform: `translateX(${dx}px)`, transition: settle, touchAction: "pan-y" }}
      >
        {selectionMode ? (
          <label className="flex size-11 shrink-0 items-center justify-center" onClick={(e) => e.stopPropagation()}>
            <input type="checkbox" checked={isSelected} onChange={() => onToggleSelect?.(taskInfo.task_uuid)} className="size-5 cursor-pointer accent-primary" aria-label={`Select ${taskInfo.task_name}`} />
          </label>
        ) : (
          <span className="ml-1 flex size-11 shrink-0 items-center justify-center">
            {status && <TaskCheck done={isCompleted} status={status} taskName={taskInfo.task_name} disabled={!isAdmin} onToggle={(d) => toggle(d)} size={20} hit={44} />}
          </span>
        )}
        <Link
          href={taskHref}
          className="flex min-w-0 flex-1 flex-col justify-center gap-1 self-stretch border-b border-line"
          onClick={(e) => {
            if (selectionMode || open) e.preventDefault()
          }}
        >
          <span className="flex min-w-0 items-baseline gap-2">
            <span className="flex min-w-0 flex-1">
              <TaskTitle done={isCompleted} justDone={justDone} className="text-body leading-5 font-[450]">
                {taskInfo.task_name}
              </TaskTitle>
            </span>
            <DueLabel date={taskInfo.task_due_date} done={isCompleted} className="text-xs" />
          </span>
          <span className="flex min-w-0 items-center gap-2 text-2xs text-ink-3">
            <TaskPriorityCell priority={taskInfo.task_priority} label="tip" size={14} />
            {tags.slice(0, 3).map((t) => (
              <span key={t} aria-label={t} role="img" className={cn(HUE_CLASS[hueFor(t)], "size-1.5 shrink-0 rounded-full bg-hue")} />
            ))}
            {showProject && project?.project_uuid && project.project_name && (
              <span className="inline-flex min-w-0 items-center gap-1.5">
                <ProjectTile id={project.project_uuid} size={16} />
                <span className="max-w-[120px] truncate">{project.project_name}</span>
              </span>
            )}
            <BlockedBadge count={taskInfo.task_blocked_open} />
            {taskInfo.task_comment_count > 0 && (
              <span className="inline-flex items-center gap-0.5 tabular-nums">
                <MessageSquare className="size-3" aria-hidden="true" />
                {taskInfo.task_comment_count}
              </span>
            )}
            {taskInfo.task_sub_task_count > 0 && (
              <span className="inline-flex items-center gap-0.5 tabular-nums">
                <GitBranch className="size-3" aria-hidden="true" />
                {taskInfo.task_sub_task_count}
              </span>
            )}
            <GitHubBadgeGroup task={taskInfo} size="sm" />
            <span className="flex-1" />
            {showAssignee && taskInfo.task_assignee?.user_uuid && <TaskAvatar user={taskInfo.task_assignee} size={20} />}
          </span>
        </Link>
      </div>
    </div>
  )
}
