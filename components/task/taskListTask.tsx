import Link from "next/link"
import { useAppRouter } from "@/lib/navigation/appRouter"
import React, { useCallback, useContext, useRef, useState, Suspense } from "react"

import type { TaskInfoInterface } from "@/types/task"
import { app_task_path } from "@/types/paths"
import { statusOptionOf } from "@/lib/taskStatus"
import { splitTags } from "@/lib/tags"
import { hueFor } from "@/lib/campHue"
import { cn } from "@/lib/utils/helpers/cn"
import { prefersReducedMotion } from "@/lib/reducedMotion"
import { feedback } from "@/lib/ui/feedback"
import { isDragging } from "@/lib/ui/scrollState"
import { CalendarDays, Check, GitBranch, MessageSquare, MoreHorizontal } from "@/lib/icons"
import { HUE_CLASS } from "@/components/ui/graphics/hues"
import { ProjectTile } from "@/components/ui/graphics/ProjectTile"
import { TaskCheck, TaskTitle } from "@/components/task/TaskCheck"
import { TaskPriorityCell } from "@/components/task/taskPriorityCell"
import { DueLabel } from "@/components/task/DueLabel"
import { BlockedBadge, RestrictedMark } from "@/components/task/BlockedBadge"
import { GitHubBadgeGroup } from "@/components/task/PRStatusBadge"
import { TaskAvatar } from "@/components/task/taskRowParts"
import { ReorderHold } from "@/components/task/reorderSlot"
import { lazyPiece } from "@/lib/lazy/lazyPiece"

const TaskTypeGlyph = lazyPiece(() => import("@/components/task/TaskTypeGlyph"))

/** How far a row must travel to act (work.md W53). */
export const SWIPE_THRESHOLD = 72
/** A row's height (h-14), which a list passes to its virtualiser (fluid-17). */
export const PHONE_ROW_PX = 56
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
 *
 * In a project's manual order (L-1) the row itself, held still for 250 ms,
 * lifts to be moved (components/task/listReorder): no standing grip. The
 * check keeps its own long press (the status picker), and the swipe keeps
 * out of a held row's drag.
 */
// Memoised (fluid-17): the phone list draws every row's element again when a
// page arrives; a row whose task and state are the same keeps its render.
export const TaskListTask = React.memo(function TaskListTask({
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
}) {
  const router = useAppRouter()
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
  // The layer under the row (the moss band, Due and More) is 21 of a row's
  // 53 elements, and no one sees it until a finger moves the row: it comes
  // with the swipe's first sideways move and stays for the row's life, so a
  // row springing back keeps it under (fluid-17).
  const [swiped, setSwiped] = useState(false)
  const armed = dx >= SWIPE_THRESHOLD
  const armedRef = useRef(false)

  const down = (e: React.PointerEvent) => {
    if (e.pointerType === "mouse" || selectionMode || !isAdmin) return
    start.current = { x: e.clientX, y: e.clientY, dx: open ? -ACTIONS_W : 0, lock: null }
  }
  const move = (e: React.PointerEvent) => {
    const s = start.current
    if (!s) return
    // A hold lifted the row: the finger is carrying it now, not swiping.
    if (isDragging()) {
      start.current = null
      return
    }
    const mx = e.clientX - s.x
    const my = e.clientY - s.y
    if (!s.lock) {
      if (Math.abs(mx) < 8 && Math.abs(my) < 8) return
      s.lock = Math.abs(mx) > Math.abs(my) ? "x" : "y"
    }
    if (s.lock !== "x") return
    setSwiped(true)
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
  // In a project's manual order, a hold on the row lifts it (components/task/listReorder).
  const hold = useContext(ReorderHold)
  const holds = !!hold && isAdmin && !selectionMode

  return (
    <div className="relative overflow-hidden" data-phone-task-row="" data-task-id={taskInfo.task_uuid} data-flip-id={taskInfo.task_uuid}>
      {/* Under the row: the moss band (complete) on the left, Due and More on the right. */}
      {swiped && (
        <>
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
        </>
      )}
      <div
        ref={row}
        data-swipe-row=""
        // The check's own long press opens the status picker: it never lifts the row.
        onTouchStart={holds && hold ? (e) => !(e.target as Element).closest("[data-task-check]") && hold(taskInfo, e) : undefined}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        // The press is an overlay on the sheet, never a see-through fill: a
        // translucent --press let the swipe's actions show through the row
        // being dragged ("Tomo••ow" under More).
        className={cn("relative flex h-14 items-center bg-sheet pr-4 active:shadow-[inset_0_0_0_100vmax_var(--press)]", isSelected && "shadow-[inset_0_0_0_100vmax_var(--sel)]")}
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
        <RowLink
          href={taskHref}
          // A held row lifts: no callout or text selection on its link.
          className={cn("flex min-w-0 flex-1 flex-col justify-center gap-1 self-stretch border-b border-line", holds && "select-none [-webkit-touch-callout:none]")}
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
            {/* Only a restricted task mounts its mark: a row is held to the components it mounts (fluid-17). */}
            {taskInfo.task_restricted && <RestrictedMark restricted className="self-center" />}
            <DueLabel date={taskInfo.task_due_date} done={isCompleted} className="text-xs" />
          </span>
          <span className="flex min-w-0 items-center gap-2 text-2xs text-ink-3">
            <TaskPriorityCell priority={taskInfo.task_priority} label="tip" size={14} />
            {taskInfo.task_key && (
              <span data-task-key="" className="inline-flex shrink-0 items-center gap-1 font-[510] tabular-nums">
                {taskInfo.task_work_type && (
                  <Suspense fallback={<span className="size-3" />}>
                    <TaskTypeGlyph type={taskInfo.task_work_type} className="size-3" />
                  </Suspense>
                )}
                {taskInfo.task_key}
              </span>
            )}
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
        </RowLink>
      </div>
    </div>
  )
})

/**
 * The row's link. It fetches its task's route only (Next's auto, not the
 * page's code, which brought the editor's Yjs into a scroll), and only once a
 * finger lands on the row, not as the row scrolls into view: each row of a
 * scroll fetched its own (160 requests and 852 KB a scroll on a phone), and a
 * touch starts a scroll as often as a tap (fluid-17). No IntentLink: a task is
 * never a doc, and its doc prefetch was 4.4 KB on My Tasks' first load.
 */
function RowLink(props: React.ComponentProps<typeof Link>) {
  const [intent, setIntent] = useState(false)
  const want = () => setIntent(true)
  return <Link {...props} prefetch={intent && "auto"} data-prefetch={intent ? "intent" : "off"} onTouchStart={want} onPointerEnter={want} onFocus={want} />
}
