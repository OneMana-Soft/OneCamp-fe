"use client"

import type * as React from "react"
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react"
import { useSelector } from "react-redux"
import { useVirtualizer } from "@tanstack/react-virtual"
import { DndContext, DragOverlay, useDroppable, type CollisionDetection, type DragEndEvent, type DragMoveEvent, type DragStartEvent, type KeyboardCoordinateGetter } from "@dnd-kit/core"
import { addDays, format, startOfDay } from "date-fns"
import { announce } from "@/lib/ui/announce"
import { onEscape } from "@/lib/keys/onEscape"
import { DRAG_OVERLAY, collisionDetection, eventPoint, useDndSetup, useDragState, type DragWords } from "@/lib/ui/dnd"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { EmptyState } from "@/components/ui/empty-state"
import { ErrorState } from "@/components/ui/error-state"
import { Skeleton } from "@/components/ui/skeleton"
import { useProjectStatuses } from "@/hooks/useProjectStatuses"
import { useMyId } from "@/hooks/useMyId"
import { useProjectTimeline } from "@/hooks/useProjectTimeline"
import { useStableCallback } from "@/hooks/useStableCallback"
import { useTaskDependencies } from "@/hooks/useTaskDependencies"
import { useTimelineView } from "@/hooks/useTimelineView"
import { isBoolean, useStoredState } from "@/hooks/useStoredState"
import { CalendarOff, Plus, SlidersHorizontal } from "@/lib/icons"
import { useGrow } from "@/hooks/useGrow"
import { flipBy } from "@/lib/flip"
import { prefersReducedMotion } from "@/lib/reducedMotion"
import { NO_ACCESS, canEditTask } from "@/lib/work/access"
import { TaskStatusCell } from "@/components/task/taskStatusCell"
import type { RootState } from "@/store/store"
import { StoreProvider } from "@/components/providers/StoreProvider"
import {
  DAY_WIDTH,
  GROUPINGS,
  ZOOMS,
  applyEdit,
  barBox,
  bubbleLabel,
  dependencyLinks,
  datesAfter,
  datesForDrop,
  dayAt,
  isLate,
  isPending,
  offsetOf,
  spanLabel,
  timelineRange,
  timelineRows,
  type EditKind,
  type Grouping,
  type TimelineData,
  type TimelineTask,
  type Zoom,
  spanOf,
  taskDate,
  zoomStep,
} from "@/lib/timeline"
import { statusOptionOf } from "@/lib/taskStatus"
import { cn } from "@/lib/utils/helpers/cn"
import { HUE_CLASS } from "@/components/ui/graphics/hues"
import { HEADER_HEIGHT, TimelineHeader } from "./TimelineHeader"
import { WorkState, workToolbar } from "@/components/task/workFrame"
import { SpotCalendar } from "@/components/ui/graphics/spots"
import { STICK_INSET } from "./TimelineBar"
import { GROUP_HEIGHT, ROW_HEIGHT, TimelineGroupRow, TimelineTaskRow } from "./TimelineRows"
import { TimelineMilestones, datedMilestones, milestonesHeight } from "./TimelineMilestones"
import { useFetch } from "@/hooks/useFetch"
import { OWN_ERRORS } from "@/lib/axiosInstance"
import { milestonesPath, type MilestonesAnswer } from "@/lib/work/milestones"
import { UNSCHEDULED_DRAG, UnscheduledPanel } from "./UnscheduledPanel"
import { ZoomSwitch } from "./ZoomSwitch"
import { useProjectHue } from "@/lib/projectHue"
import type { CampHue } from "@/lib/campHue"
import { edgeScroller } from "@/lib/ui/edgeScroll"

/** The drop target a task from Unscheduled lands on: the grid of days. */
const GRID = "timeline-grid"
/** How long after a move the view watches for bars the move pushed along, to FLIP them. */
const WATCH_MS = 4000

/** Rounds an orthogonal path's corners (M x y H… V…) with arcs of radius r, so an arrow bends rather than kinks. */
export function roundPath(path: string, r = 6): string {
  const pts: { x: number; y: number }[] = []
  const re = /([MHV])\s*(-?[\d.]+)(?:\s+(-?[\d.]+))?/g
  let x = 0
  let y = 0
  for (let m = re.exec(path); m; m = re.exec(path)) {
    if (m[1] === "M") {
      x = Number(m[2])
      y = Number(m[3])
    } else if (m[1] === "H") x = Number(m[2])
    else y = Number(m[2])
    pts.push({ x, y })
  }
  if (pts.length < 3) return path
  let d = `M${pts[0].x} ${pts[0].y}`
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[i - 1]
    const b = pts[i]
    const c = pts[i + 1]
    const inLen = Math.hypot(b.x - a.x, b.y - a.y)
    const outLen = Math.hypot(c.x - b.x, c.y - b.y)
    const k = Math.min(r, inLen / 2, outLen / 2)
    if (k <= 0) continue
    const p1 = { x: b.x - ((b.x - a.x) / inLen) * k, y: b.y - ((b.y - a.y) / inLen) * k }
    const p2 = { x: b.x + ((c.x - b.x) / outLen) * k, y: b.y + ((c.y - b.y) / outLen) * k }
    d += `L${p1.x} ${p1.y}Q${b.x} ${b.y} ${p2.x} ${p2.y}`
  }
  const last = pts[pts.length - 1]
  return `${d}L${last.x} ${last.y}`
}

const isZoom = (v: unknown): v is Zoom => ZOOMS.some((z) => z.value === v)

/**
 * Swallow the click a drag ends with, wherever the button is let go: at the
 * window, before it reaches the bar. The next press ends the wait, for a drag
 * let go outside the window that never clicks.
 */
function swallowNextClick() {
  const stop = (e: MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    done()
  }
  const done = () => {
    window.removeEventListener("click", stop, true)
    window.removeEventListener("pointerdown", done, true)
  }
  window.addEventListener("click", stop, true)
  window.addEventListener("pointerdown", done, true)
}
const isGrouping = (v: unknown): v is Grouping => GROUPINGS.some((g) => g.value === v)

interface Drag {
  task: TimelineTask
  kind: EditKind
  x0: number
  scroll0: number
  pointerX: number
  days: number
  moved: boolean
}

/**
 * A project's timeline: its tasks as bars across the days they run, grouped
 * by status or by who has them, with today marked. The project's admins drag
 * a bar to move it, drag an end to change when it starts or is due, and drag
 * a task with no dates onto a day; arrows do the same from the keyboard. On a
 * phone (compact) it shows the plan, and a task opens to change its dates.
 *
 * It reads the app's store (the task open in the panel), which a client's view
 * of a shared project (guest/p) doesn't have: the timeline brings it (StoreProvider).
 */
export function ProjectTimeline(props: React.ComponentProps<typeof Timeline>) {
  return (
    <StoreProvider>
      <Timeline {...props} />
    </StoreProvider>
  )
}

function Timeline({
  projectId,
  tasks: given,
  viewKey,
  onOpenTask,
  onCreateTask,
  compact = false,
  className,
  leading,
  hue,
}: {
  projectId: string
  /** Draw these instead of fetching the project's, read-only: a client's view of a project shared with them. */
  tasks?: TimelineTask[]
  /** Where the view's choices are remembered: the project's id unless given. */
  viewKey?: string
  onOpenTask: (taskUUID: string) => void
  onCreateTask?: () => void
  compact?: boolean
  className?: string
  /** First in the tool row: a page's own switch (the client view's Board and Timeline). */
  leading?: React.ReactNode
  /** The project's colour where it has no id to read it by: a client's view (T-1). */
  hue?: CampHue
}) {
  const fetched = useProjectTimeline(given ? "" : projectId)
  const { isLoading, isError, mutate, reschedule } = fetched
  const data: TimelineData | undefined = given ? { tasks: given, total: given.length, can_edit: false, project_access: NO_ACCESS } : fetched.data
  const tasks = given ?? fetched.tasks
  // The project's milestones, read beside its tasks (linear-16): a row each above them, for those with a day.
  // A client's view of a shared project has none. Its failure is said in its own heading.
  const milestoneRead = useFetch<MilestonesAnswer>(given ? "" : milestonesPath(projectId), undefined, { revalidateOnFocus: false }, OWN_ERRORS)
  const shownMilestones = useMemo(() => datedMilestones(milestoneRead.data?.data.milestones ?? undefined), [milestoneRead.data])
  const milestonesFailed = !!milestoneRead.isError && !milestoneRead.data
  const milestonesTall = milestonesHeight(shownMilestones.length, milestonesFailed)
  const { options: statuses } = useProjectStatuses(given ? undefined : projectId)
  const key = viewKey ?? projectId
  const [zoom, setZoom, zoomReady] = useStoredState<Zoom>(`oc_timeline_zoom:${key}`, "week", isZoom)
  const [grouping, setGrouping] = useStoredState<Grouping>(`oc_timeline_grouping:${key}`, "status", isGrouping)
  const [showDone, setShowDone] = useStoredState<boolean>(`oc_timeline_done:${key}`, true, isBoolean)
  // Moving a task later moves the tasks waiting on it along (monday's "flexible").
  const [shiftAlong, setShiftAlong] = useStoredState<boolean>(`oc_timeline_shift:${key}`, true, isBoolean)
  const setDependency = useTaskDependencies(given ? "" : projectId)
  const [sideOpen, setSideOpen] = useStoredState<boolean>(compact ? undefined : "oc_timeline_unscheduled", !compact, isBoolean)
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set())
  const [today] = useState(() => startOfDay(new Date()))
  const [preview, setPreview] = useState<{ id: string; kind: EditKind; days: number } | null>(null)
  const [dropDay, setDropDay] = useState<Date | null>(null)
  // A dependency being drawn: from a bar's end handle to the pointer, and the bar it would end on.
  const [linking, setLinking] = useState<{ from: string; x1: number; y1: number; x2: number; y2: number; target: string | null } | null>(null)
  // The bar the pointer is on: its arrows go ink-2.
  const [hovered, setHovered] = useState<string | null>(null)
  const [showDeps, setShowDeps] = useStoredState<boolean>(`oc_timeline_deps:${key}`, true, isBoolean)
  const [showWeekends, setShowWeekends] = useStoredState<boolean>(`oc_timeline_weekends:${key}`, true, isBoolean)
  // Bars that just landed (a drop or a nudge): the brand-muted flash.
  const [landed, setLanded] = useState<ReadonlySet<string>>(() => new Set())
  const [dropRow, setDropRow] = useState<number | null>(null)
  // The task open in the panel, outlined in brand.
  const opened = useSelector((s: RootState) => (s.rightPanel?.rightPanelState?.isOpen ? s.rightPanel.rightPanelState.data.taskUUID : ""))
  const helpId = useId()
  const markerId = `dep${helpId.replace(/[^A-Za-z0-9]/g, "")}`

  const canEdit = !!data?.can_edit && !compact
  // Each task by its own right, as the list and the board decide it
  // (lib/work/access): where members change only their own tasks, the others'
  // bars, handles and Unscheduled rows don't move. can_edit is any task's.
  const me = useMyId(!given)
  const projectAccess = data?.project_access
  const canMove = useCallback((t: TimelineTask) => canEdit && canEditTask(t, me, { project_access: projectAccess }), [canEdit, me, projectAccess])
  const dayWidth = DAY_WIDTH[zoom]
  const nameWidth = compact ? 140 : 260
  const ownHue = useProjectHue(projectId)
  const projectHue = hue ?? ownHue

  const { rows, unscheduled, spans } = useMemo(
    () => timelineRows(tasks, { grouping, statuses, showDone, collapsed }),
    [tasks, grouping, statuses, showDone, collapsed],
  )
  // The grid reaches every task and every milestone's days.
  const range = useMemo(
    () => timelineRange(shownMilestones.length > 0 ? [...spans, ...shownMilestones.map((d) => d.days)] : spans, today, zoom),
    [spans, shownMilestones, today, zoom],
  )
  const gridWidth = range.days * dayWidth

  const scrollRef = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  // Each row's top: a group's row is 32px, a task's 36.
  const tops = useMemo(() => {
    const out: number[] = []
    let y = 0
    for (const r of rows) {
      out.push(y)
      y += r.kind === "group" ? GROUP_HEIGHT : ROW_HEIGHT
    }
    return out
  }, [rows])
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (i) => (rows[i]?.kind === "group" ? GROUP_HEIGHT : ROW_HEIGHT),
    overscan: 12,
    // The tasks' body starts below the dates and the milestones.
    scrollMargin: HEADER_HEIGHT + milestonesTall,
  })

  // Every dependency between two drawn bars, a bar being dragged where it's going.
  const links = useMemo(() => {
    let moving: Map<string, ReturnType<typeof applyEdit>> | undefined
    if (preview) {
      const row = rows.find((r) => r.kind === "task" && r.task.task_uuid === preview.id)
      if (row?.kind === "task") moving = new Map([[preview.id, applyEdit(row.span, preview)]])
    }
    return dependencyLinks(rows, range, dayWidth, ROW_HEIGHT, moving, tops)
  }, [rows, range, dayWidth, preview, tops])

  // ---- Keeping the same days in view -----------------------------------------
  const { onScroll, goToday, scrollerRef } = useTimelineView({
    scrollRef,
    range,
    dayWidth,
    nameWidth,
    spans,
    today,
    ready: !!data && zoomReady,
    paused: () => !!drag.current,
  })

  // ---- Focus follows a task that moved ------------------------------------------
  // Rows are in date order, so a moved task can change places; its bar is
  // found again and kept in view (clear of the names and the header: the
  // scroll container's scroll padding).
  // The keyboard's moves take focus along; a mouse's only keep the bar in view.
  const follow = useRef<{ id: string; focus: boolean } | null>(null)
  useLayoutEffect(() => {
    const wanted = follow.current
    if (!wanted) return
    const id = wanted.id
    const bar = scrollRef.current?.querySelector<HTMLElement>(`[data-bar="${CSS.escape(id)}"]`)
    if (bar) {
      if (wanted.focus && document.activeElement !== bar) bar.focus({ preventScroll: true })
      bar.scrollIntoView({ block: "nearest", inline: "nearest" })
      follow.current = null
      return
    }
    const index = rows.findIndex((r) => r.kind === "task" && r.task.task_uuid === id)
    if (index >= 0) virtualizer.scrollToIndex(index, { align: "center" })
    else follow.current = null
  })

  // ---- Dragging a bar ------------------------------------------------------------
  const drag = useRef<Drag | null>(null)

  // ---- Landing, and the bars a move pushes along ---------------------------------
  // After a drop or a nudge the view watches for a while: bars whose dates the
  // server moved along ("shift along") travel to their new places by FLIP,
  // 30ms apart, so the chain visibly follows. Where each bar was is known
  // from the data, so nothing is measured. The bar the person moved is
  // already where they put it, and lands with the brand-muted flash.
  const watch = useRef<{ until: number; skip: string | null }>({ until: 0, skip: null })
  const placed = useRef(new Map<string, { x: number; y: number }>())
  const landTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const land = useCallback((id: string) => {
    if (landTimer.current) clearTimeout(landTimer.current)
    setLanded(new Set([id]))
    landTimer.current = setTimeout(() => setLanded(new Set()), 720)
  }, [])
  useEffect(() => () => {
    if (landTimer.current) clearTimeout(landTimer.current)
  }, [])

  const onBarPointerDown = useStableCallback(
    (e: PointerEvent, task: TimelineTask, kind: EditKind) => {
      // A finger scrolls the timeline; on touch screens a tap opens the task.
      if (!canMove(task) || e.button !== 0 || e.pointerType === "touch" || isPending(task)) return
      e.preventDefault()
      e.stopPropagation()
      const el = scrollRef.current
      if (!el) return
      const d: Drag = { task, kind, x0: e.clientX, scroll0: el.scrollLeft, pointerX: e.clientX, days: 0, moved: false }
      drag.current = d
      const measure = () => {
        const dx = d.pointerX - d.x0 + (el.scrollLeft - d.scroll0)
        if (Math.abs(dx) > 3) d.moved = true
        const days = Math.round(dx / dayWidth)
        if (days !== d.days) {
          d.days = days
          setPreview({ id: task.task_uuid, kind, days })
        }
      }
      // Held near an edge, the timeline scrolls on under the pointer: the one
      // edge scroll every drag uses (lib/ui/edgeScroll), sideways only, its
      // left zone starting past the names drawn over that edge.
      const scroller = edgeScroller(el, measure, undefined, { inset: { left: nameWidth }, axis: "x" })
      const move = (ev: globalThis.PointerEvent) => {
        d.pointerX = ev.clientX
        measure()
        scroller.follow(ev.clientX, ev.clientY)
      }
      const finish = (save: boolean) => {
        window.removeEventListener("pointermove", move)
        window.removeEventListener("pointerup", up)
        window.removeEventListener("pointercancel", cancel)
        stopEscape()
        scroller.stop()
        drag.current = null
        setPreview(null)
        // The click that ends a drag, or a drag called off with Esc, isn't a
        // click on the task. Swallowed when it comes, however late the button
        // is let go; the next press ends the wait if it never does.
        if (d.moved || !save) swallowNextClick()
        const next = save && d.moved ? datesAfter(d.task, { kind: d.kind, days: d.days }) : null
        if (next) {
          follow.current = { id: d.task.task_uuid, focus: false }
          watch.current = { until: Date.now() + WATCH_MS, skip: d.task.task_uuid }
          land(d.task.task_uuid)
          void reschedule(d.task, next, { shift: shiftAlong })
        }
      }
      const up = () => finish(true)
      const cancel = () => finish(false)
      // Esc calls the move off: the drag layer of the one Escape (lib/keys/escape).
      const stopEscape = onEscape("drag", () => finish(false))
      window.addEventListener("pointermove", move)
      window.addEventListener("pointerup", up)
      window.addEventListener("pointercancel", cancel)
    },
  )

  // ---- Drawing a dependency --------------------------------------------------------
  const waitsOn = useStableCallback((waiting: string, on: string) =>
    tasks.some((t) => t.task_uuid === waiting && t.task_blocked_by?.some((b) => b.task_uuid === on)),
  )
  // From the handle at a bar's end to the bar of the task that waits on it,
  // as Linear and ClickUp draw them. The keyboard's way is the task's panel.
  const onLinkStart = useStableCallback(
    (e: PointerEvent, task: TimelineTask) => {
      if (!canMove(task) || e.button !== 0 || e.pointerType === "touch" || isPending(task)) return
      e.preventDefault()
      e.stopPropagation()
      const body = bodyRef.current
      const bar = (e.currentTarget as HTMLElement).closest<HTMLElement>("[data-bar]")
      if (!body || !bar) return
      const local = (x: number, y: number) => {
        const box = body.getBoundingClientRect()
        return { x: x - box.left - nameWidth, y: y - box.top }
      }
      const b = bar.getBoundingClientRect()
      const start = local(b.right, b.top + b.height / 2)
      // The task that would wait is the one changed: one the person may change.
      const targetAt = (x: number, y: number) => {
        const id = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-bar]")?.dataset.bar ?? null
        const target = id && id !== task.task_uuid ? tasks.find((t) => t.task_uuid === id) : undefined
        return target && !isPending(target) && canMove(target) ? target.task_uuid : null
      }
      setLinking({ from: task.task_uuid, x1: start.x, y1: start.y, x2: start.x, y2: start.y, target: null })
      const move = (ev: globalThis.PointerEvent) => {
        const p = local(ev.clientX, ev.clientY)
        const target = targetAt(ev.clientX, ev.clientY)
        setLinking((l) => (l ? { ...l, x2: p.x, y2: p.y, target } : l))
      }
      const finish = (ev: globalThis.PointerEvent | null) => {
        window.removeEventListener("pointermove", move)
        window.removeEventListener("pointerup", up)
        window.removeEventListener("pointercancel", cancel)
        stopEscape()
        setLinking(null)
        swallowNextClick()
        const target = ev ? targetAt(ev.clientX, ev.clientY) : null
        if (target && !waitsOn(target, task.task_uuid)) void setDependency(target, task.task_uuid)
      }
      const up = (ev: globalThis.PointerEvent) => finish(ev)
      const cancel = () => finish(null)
      // Esc drops the line drawn: the drag layer of the one Escape (lib/keys/escape).
      const stopEscape = onEscape("drag", () => finish(null))
      window.addEventListener("pointermove", move)
      window.addEventListener("pointerup", up)
      window.addEventListener("pointercancel", cancel)
    },
  )

  const onBarClick = useStableCallback(
    (task: TimelineTask) => {
      if (!isPending(task)) onOpenTask(task.task_uuid)
    },
  )

  const onBarKeyDown = useStableCallback(
    (e: KeyboardEvent, task: TimelineTask) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault()
        if (!isPending(task)) onOpenTask(task.task_uuid)
        return
      }
      if (!canMove(task) || isPending(task) || (e.key !== "ArrowLeft" && e.key !== "ArrowRight")) return
      // Alt+← and ⌘+← are Back; Ctrl+arrows move between words. None of them is a nudge.
      if (e.altKey || e.ctrlKey || e.metaKey) return
      e.preventDefault()
      const next = datesAfter(task, { kind: e.shiftKey ? "end" : "move", days: e.key === "ArrowLeft" ? -1 : 1 })
      if (!next) return
      follow.current = { id: task.task_uuid, focus: true }
      watch.current = { until: Date.now() + WATCH_MS, skip: null }
      void reschedule(task, next, { later: true, shift: shiftAlong })
    },
  )

  // ---- Dropping a task with no dates on a day ------------------------------------
  // The shared drag (lib/ui/dnd, INTERACTION_SPEC §5): a mouse, a finger held a
  // beat, or the keyboard lifts a row of Unscheduled; the grid takes it, and
  // a one-day ghost bar with its date shows where it lands.
  const aimed = useRef<{ day: Date | null; row: number | null }>({ day: null, row: null })
  const [lifted, setLifted] = useState<{ id: string; keys: boolean } | null>(null)
  const unscheduledNow = useRef(unscheduled)
  unscheduledNow.current = unscheduled
  const aim = (day: Date | null, row: number | null) => {
    const was = aimed.current
    aimed.current = { day, row }
    if (day?.getTime() !== was.day?.getTime()) setDropDay(day)
    if (row !== was.row) setDropRow(row)
  }
  // The day at a point on screen: none over the names, which hide the days
  // behind them, nor under the Unscheduled panel.
  const dayAtPoint = (x: number, y: number) => {
    const view = scrollRef.current?.getBoundingClientRect()
    const body = bodyRef.current?.getBoundingClientRect()
    if (!view || !body || x < view.left + nameWidth || x > view.right) return null
    const panel = scrollRef.current?.parentElement?.querySelector("[data-unscheduled]")?.getBoundingClientRect()
    if (panel && x >= panel.left && x <= panel.right && y >= panel.top && y <= panel.bottom) return null
    return dayAt(x - body.left - nameWidth, range, dayWidth)
  }
  // The row at a height, for the ghost bar.
  const rowAtPoint = (y: number) => {
    const body = bodyRef.current?.getBoundingClientRect()
    if (!body) return null
    let i = 0
    while (i + 1 < tops.length && tops[i + 1] <= y - body.top) i++
    return Math.max(0, i)
  }
  const dayWords = (day: Date) => format(day, "EEEE d MMMM")
  const words = useMemo<DragWords>(
    () => ({
      name: (id) => unscheduledNow.current.find((t) => t.task_uuid === id)?.task_name ?? "the task",
      place: (id) => (id === GRID ? { container: aimed.current.day ? `the timeline, ${format(aimed.current.day, "EEEE d MMMM")}` : "the timeline" } : { container: "Unscheduled" }),
    }),
    [],
  )
  // The keyboard: the first ← or → brings the task onto the grid at today, or
  // the first day in view; then each moves it a day, the grid scrolling to
  // keep it in sight. Space or Enter drops it there, Escape puts it back.
  const keyDays: KeyboardCoordinateGetter = (event) => {
    const by = event.code === "ArrowLeft" ? -1 : event.code === "ArrowRight" ? 1 : 0
    const view = scrollRef.current
    const body = bodyRef.current
    if (!by || !view || !body) return undefined
    event.preventDefault()
    const seen = view.scrollLeft
    // The days the Unscheduled panel covers are out of sight.
    const panel = view.parentElement?.querySelector("[data-unscheduled]")
    const room = view.clientWidth - nameWidth - (panel ? panel.getBoundingClientRect().width + 16 : 0)
    let day = aimed.current.day
    if (day) day = addDays(day, by)
    else {
      const t = offsetOf(today, range, dayWidth)
      day = t >= seen && t + dayWidth <= seen + room ? today : dayAt(seen + 1, range, dayWidth)
    }
    const x = offsetOf(day, range, dayWidth)
    if (x < 0 || x >= gridWidth) return undefined
    if (x < seen) view.scrollLeft = x
    else if (x + dayWidth > seen + room) view.scrollLeft = x + dayWidth - room
    const row = aimed.current.row ?? rowAtPoint(view.getBoundingClientRect().top + HEADER_HEIGHT + 1) ?? 0
    aim(day, row)
    announce(dayWords(day))
    const b = body.getBoundingClientRect()
    return { x: b.left + nameWidth + x, y: b.top + (tops[row] ?? 0) }
  }
  const dnd = useDndSetup(words, keyDays)
  // The grid takes a task only where it would land: the day under the pointer
  // (not the names, nor the Unscheduled panel drawn over the grid), or the day
  // keyDays aimed. Anywhere else the task is over nothing, so letting go puts
  // it back, and the words say so. The day rides on the collision to onCarry,
  // from dnd-kit's own pointer: a move's delta counts the grid's scroll once
  // the grid is under it, so a point made from the delta is off by that scroll.
  const overADay: CollisionDetection = (args) => {
    const p = args.pointerCoordinates
    const day = p ? dayAtPoint(p.x, p.y) : aimed.current.day
    return collisionDetection(args).flatMap((c) => {
      if (c.id !== GRID) return [c]
      if (!day) return []
      return p ? [{ ...c, data: { ...c.data, day, row: rowAtPoint(p.y) } }] : [c]
    })
  }
  const landing = useDragState()
  const onLift = (e: DragStartEvent) => {
    landing.handlers.onDragStart(e)
    aimed.current = { day: null, row: null }
    setLifted({ id: String(e.active.id), keys: e.activatorEvent instanceof globalThis.KeyboardEvent })
  }
  const onCarry = (e: DragMoveEvent) => {
    landing.handlers.onDragMove(e)
    // The keyboard aims through keyDays.
    if (!eventPoint(e.activatorEvent)) return
    const on = e.collisions?.find((c) => c.id === GRID)?.data
    aim(on?.day ?? null, on?.row ?? null)
  }
  const onLand = (e: DragEndEvent) => {
    landing.handlers.onDragEnd(e)
    const keys = lifted?.keys ?? false
    // Over the grid is over a day (overADay), from a pointer or the keys.
    const day = e.over?.id === GRID ? aimed.current.day : null
    const task = unscheduled.find((t) => t.task_uuid === e.active.id)
    // The ghost goes; the aimed day stays till the next lift, as dnd-kit says
    // the drop's words, with that day, after onDragEnd.
    setDropDay(null)
    setDropRow(null)
    setLifted(null)
    if (!task || !canMove(task) || !day || e.active.data.current?.type !== UNSCHEDULED_DRAG) return
    follow.current = { id: task.task_uuid, focus: keys }
    watch.current = { until: Date.now() + WATCH_MS, skip: task.task_uuid }
    land(task.task_uuid)
    void reschedule(task, datesForDrop(day), { shift: shiftAlong })
  }
  const onPutBack = (e: Parameters<typeof landing.handlers.onDragCancel>[0]) => {
    landing.handlers.onDragCancel(e)
    aim(null, null)
    setLifted(null)
  }
  const liftedTask = lifted ? unscheduled.find((t) => t.task_uuid === lifted.id) : undefined
  const liftedStatus = liftedTask ? statusOptionOf(liftedTask, statuses) : undefined

  const toggleGroup = useStableCallback((id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (!next.delete(id)) next.add(id)
      return next
    }),
  )
  const openTask = useStableCallback(onOpenTask)

  // ---- Drawing --------------------------------------------------------------------
  // The tool row and the frame are there from the first paint, as on every tab
  // of a project (components/task/workFrame): loading, failed and empty draw
  // inside the frame. They used to replace both, so the bars dropped about
  // 95px and gained a border when the data landed, and an empty timeline was
  // an icon with no tools.
  const failed = isError && !data
  // The milestones come with the first paint, so they never push the tasks down after it.
  const loadingNow = (isLoading && !data) || !zoomReady || (!!milestoneRead.isLoading && !milestoneRead.data)
  const noTasks = !failed && !loadingNow && !!data && data.tasks.length === 0
  const drawn = !failed && !loadingNow && !noTasks

  const todayLeft = offsetOf(today, range, dayWidth)
  const sideShown = sideOpen && unscheduled.length > 0
  const truncated = data && data.total > data.tasks.length
  const nothingDated = rows.length === 0
  const weekShade = showWeekends && (zoom === "day" || zoom === "week")
  const gridLines =
    zoom === "day"
      ? Array.from({ length: Math.ceil(range.days / 7) }, (_, i) => i * 7 * dayWidth)
      : null
  // Weekends as sunken columns, week lines, and today's line: under the tasks and the milestones alike.
  const backdrop = (
    <div aria-hidden className="pointer-events-none absolute inset-y-0" style={{ left: nameWidth, width: gridWidth }}>
      {weekShade && (
        <div
          data-weekends=""
          className="absolute inset-0"
          style={{ backgroundImage: `repeating-linear-gradient(to right, transparent 0 ${5 * dayWidth}px, var(--sunken) ${5 * dayWidth}px ${7 * dayWidth}px)` }}
        />
      )}
      {gridLines?.map((left) => <div key={left} className="absolute inset-y-0 w-px bg-line" style={{ left }} />)}
      {todayLeft >= 0 && todayLeft < gridWidth && (
        <div data-today-line="" className="absolute inset-y-0 z-[5] w-[1.5px] -translate-x-1/2 bg-brand" style={{ left: todayLeft + dayWidth / 2 }} />
      )}
    </div>
  )

  // The first reveal: bars grow from their starts, 16ms apart by row, then the arrows draw.
  const grow = useGrow(`timeline:${key}`, drawn)
  const growDone = 320 + Math.min(rows.length * 16, 240)

  // Where each drawn bar is, from the data (a dragged bar where it's going).
  const layoutNow = useMemo(() => {
    const out = new Map<string, { x: number; y: number }>()
    rows.forEach((r, i) => {
      if (r.kind !== "task") return
      const span = preview?.id === r.task.task_uuid ? applyEdit(r.span, preview) : r.span
      out.set(r.task.task_uuid, { x: barBox(span, range, dayWidth).left, y: tops[i] })
    })
    return out
  }, [rows, preview, range, dayWidth, tops])

  // Bars a move pushed along travel from where they were; see `watch`.
  useLayoutEffect(() => {
    const before = placed.current
    placed.current = layoutNow
    const w = watch.current
    if (Date.now() > w.until || preview) return
    let n = 0
    for (const [id, now] of layoutNow) {
      const was = before.get(id)
      if (!was || id === w.skip || (was.x === now.x && was.y === now.y)) continue
      const el = bodyRef.current?.querySelector<HTMLElement>(`[data-bar="${CSS.escape(id)}"]`)
      if (flipBy(el, was.x - now.x, was.y - now.y, { duration: 240, delay: n * 30 })) n++
    }
  }, [layoutNow, preview])

  // A conflict the person just resolved: its arrow draws again, solid, and its "!" pops away.
  const brokenBefore = useRef(new Map<string, { x: number; y: number }>())
  const [fixed, setFixed] = useState<ReadonlyMap<string, { x: number; y: number }>>(() => new Map())
  useLayoutEffect(() => {
    const now = new Map(links.filter((l) => l.broken && l.mid).map((l) => [l.key, l.mid!]))
    const resolved = new Map<string, { x: number; y: number }>()
    for (const [k, mid] of brokenBefore.current) if (!now.has(k) && links.some((l) => l.key === k)) resolved.set(k, mid)
    brokenBefore.current = now
    if (resolved.size === 0 || preview || prefersReducedMotion()) return
    setFixed(resolved)
    const t = setTimeout(() => setFixed(new Map()), 320)
    return () => clearTimeout(t)
  }, [links, preview])

  // T goes to today; - and + zoom out and in (work.md W23); C makes a task,
  // as on the List and the Board. Only while the timeline is on screen.
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || !scrollRef.current?.offsetParent) return
      const t = e.target as HTMLElement | null
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return
      if (e.key === "t" || e.key === "T") goToday()
      else if ((e.key === "c" || e.key === "C") && onCreateTask) onCreateTask()
      else if (e.key === "-") setZoom(zoomStep(zoom, 1))
      else if (e.key === "+" || e.key === "=") setZoom(zoomStep(zoom, -1))
      else return
      e.preventDefault()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [goToday, setZoom, zoom, onCreateTask])

  const toolRow = (
    // The band (components/task/workFrame) grows when its controls wrap: at a
    // fixed 44 px the phone's second row of controls slid under the grid.
    <div data-work-toolbar="" className={cn(workToolbar, "justify-between")}>
      <div className="flex flex-wrap items-center gap-1.5">
        {leading}
        <Button variant="ghost" size="sm" className="h-7 gap-1.5 px-2.5 text-ink-2 hover:text-foreground" onClick={goToday} disabled={!drawn} aria-keyshortcuts="T">
          Today
          <kbd className="kbd">T</kbd>
        </Button>
        <ZoomSwitch value={zoom} onChange={setZoom} />
        {truncated && (
          <span className="text-xs text-ink-3">
            The newest {data.tasks.length.toLocaleString()} of {data.total.toLocaleString()} tasks
          </span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 px-2.5 text-ink-2 hover:text-foreground aria-pressed:text-foreground"
          aria-pressed={sideShown}
          disabled={unscheduled.length === 0}
          title={unscheduled.length === 0 ? "Every open task has a date" : undefined}
          onClick={() => setSideOpen(!sideShown)}
        >
          <CalendarOff className="size-3.5" />
          Unscheduled
          <span className="chip h-[18px] px-1.5 tabular-nums">{unscheduled.length}</span>
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 gap-1.5 px-2.5 text-ink-2 hover:text-foreground" aria-label="Display">
              <SlidersHorizontal className="size-3.5" />
              <span className="hidden sm:inline">Display</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>Group by</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={grouping} onValueChange={(v) => isGrouping(v) && setGrouping(v)}>
              {GROUPINGS.map((g) => (
                <DropdownMenuRadioItem key={g.value} value={g.value}>
                  {g.label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
            <DropdownMenuSeparator />
            <DropdownMenuCheckboxItem checked={showDone} onCheckedChange={(v) => setShowDone(Boolean(v))}>
              Show done tasks
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem checked={showDeps} onCheckedChange={(v) => setShowDeps(Boolean(v))}>
              Show dependencies
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem checked={showWeekends} onCheckedChange={(v) => setShowWeekends(Boolean(v))}>
              Show weekends
            </DropdownMenuCheckboxItem>
            {canEdit && (
              <DropdownMenuCheckboxItem checked={shiftAlong} onCheckedChange={(v) => setShiftAlong(Boolean(v))}>
                Move waiting tasks along
              </DropdownMenuCheckboxItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
        {/* The one filled button, where the List and the Board keep it. */}
        {onCreateTask && (
          <Button size="sm" className="h-7 gap-1.5 px-2.5" aria-label="New task" aria-keyshortcuts="C" onClick={onCreateTask}>
            <Plus className="size-3.5" />
            <span className="hidden sm:inline">New task</span>
            {/* The List's and the Board's key, said the same way (PTC-6). */}
            <span className="kbd hidden sm:inline-flex" aria-hidden="true">C</span>
          </Button>
        )}
      </div>
    </div>
  )

  // No box (design v3): the grid sits on the sheet under the band's hairline.
  const frame = "relative flex min-h-0 flex-1 overflow-hidden bg-sheet"

  if (!drawn) {
    return (
      <div data-timeline="" className={cn(HUE_CLASS[projectHue], "flex h-full min-h-0 flex-col", className)}>
        {toolRow}
        <div className={frame}>
          {loadingNow ? (
            <TimelineSkeleton nameWidth={nameWidth} />
          ) : failed ? (
            <WorkState className="flex-1">
              <ErrorState subject="the timeline" onRetry={() => void mutate()} />
            </WorkState>
          ) : !isError && noTasks ? (
            <WorkState className="flex-1">
              <EmptyState
                illustration={<SpotCalendar hue={projectHue} />}
                title="Nothing on the timeline yet"
                description={
                  given
                    ? "The project's tasks show here as bars across the days they run, once they have dates."
                    : "Give tasks a start and due date, and they show here as bars across the days they run."
                }
              />
            </WorkState>
          ) : null}
        </div>
      </div>
    )
  }

  const linkTone = (from: string, to: string) => hovered === from || hovered === to || opened === from || opened === to
  const drawAt = grow.mode === "animate" ? growDone : 0

  return (
    // The project's hue: every bar's fill (TimelineBar), the drop ghost and the empty state.
    <div data-timeline="" className={cn(HUE_CLASS[projectHue], "flex h-full min-h-0 flex-col", className)}>
      {toolRow}

      <div className={frame}>
        <DndContext {...dnd} collisionDetection={overADay} {...landing.handlers} onDragStart={onLift} onDragMove={onCarry} onDragEnd={onLand} onDragCancel={onPutBack}>
        <div
          ref={scrollerRef}
          role="region"
          aria-label="Timeline"
          className="relative min-w-0 flex-1 select-none overflow-auto overscroll-x-contain"
          // A bar brought into view stops beside the names, by a scroll margin on
          // what scrolls under them (globals.css, data-scroll-lead), never a padding
          // here: the names and the group toggles, sticky inside, then move nothing
          // when they take the focus (V-63).
          data-scroll-lead=""
          style={{ "--scroll-lead": `${nameWidth}px`, scrollPaddingTop: HEADER_HEIGHT } as React.CSSProperties}
          onScroll={onScroll}
        >
          <TimelineHeader range={range} zoom={zoom} dayWidth={dayWidth} today={today} nameWidth={nameWidth} />
          <TimelineMilestones
            shown={shownMilestones}
            range={range}
            dayWidth={dayWidth}
            nameWidth={nameWidth}
            gridWidth={gridWidth}
            today={today}
            backdrop={backdrop}
            retry={milestonesFailed ? () => void milestoneRead.mutate() : undefined}
          />
          <GridDrop
            disabled={!canEdit}
            bodyRef={bodyRef}
            className="relative"
            style={{ height: Math.max(virtualizer.getTotalSize(), nothingDated ? 320 : 0), width: nameWidth + gridWidth }}
          >
            {backdrop}

            {/* Dependencies: 1.5px paths with rounded elbows from the end of a task to the start of the one waiting on it; dashed danger where the plan can't be kept. */}
            {showDeps && (links.length > 0 || linking) && (
              <svg aria-hidden data-dependencies="" className="pointer-events-none absolute top-0 z-[6] overflow-visible" style={{ left: nameWidth, width: gridWidth, height: "100%" }}>
                <defs>
                  {(["ok", "near", "broken"] as const).map((tone) => (
                    <marker key={tone} id={`${markerId}-${tone}`} viewBox="0 0 5 5" refX="4.5" refY="2.5" markerWidth="5" markerHeight="5" orient="auto">
                      <path d="M0,0 L5,2.5 L0,5 z" style={{ fill: tone === "broken" ? "var(--destructive)" : tone === "near" ? "var(--ink-2)" : "var(--line-3)" }} />
                    </marker>
                  ))}
                </defs>
                {links.map((l, i) => {
                  const near = !l.broken && linkTone(l.from, l.to)
                  const tone = l.broken ? "broken" : near ? "near" : "ok"
                  const redraw = fixed.has(l.key)
                  const draws = (drawAt > 0 || redraw) && !l.broken
                  return (
                    <path
                      key={redraw ? `${l.key}:fixed` : l.key}
                      data-link={l.key}
                      data-broken={l.broken || undefined}
                      d={roundPath(l.path, 6)}
                      fill="none"
                      strokeWidth={1.5}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      pathLength={l.broken ? undefined : 1}
                      strokeDasharray={l.broken ? "4 3" : draws ? 1 : undefined}
                      style={{
                        stroke: l.broken ? "var(--destructive)" : near ? "var(--ink-2)" : "var(--line-3)",
                        transition: "stroke 140ms var(--ease-out)",
                        animation: draws
                          ? `work-tick-draw 240ms var(--ease-out) ${redraw ? 0 : drawAt + Math.min(i * 16, 160)}ms both`
                          : l.broken && drawAt > 0
                            ? `work-fade-in 240ms var(--ease-out) ${drawAt}ms both`
                            : undefined,
                      }}
                      markerEnd={`url(#${markerId}-${tone})`}
                    />
                  )
                })}
                {linking && (
                  <path d={`M${linking.x1} ${linking.y1}L${linking.x2} ${linking.y2}`} fill="none" strokeWidth={1.5} strokeLinecap="round" style={{ stroke: "var(--brand)" }} />
                )}
              </svg>
            )}
            {/* A conflict's "!" at its elbow, named on hover; a resolved one pops away. */}
            {showDeps &&
              links
                .filter((l) => l.broken && l.mid)
                .map((l) => (
                  <span
                    key={`!${l.key}`}
                    data-conflict={l.key}
                    data-tip={`Starts before ‘${l.fromName ?? "the task it waits on"}’ ends`}
                    className="work-tip absolute z-[7] flex size-4 items-center justify-center rounded-full bg-destructive text-3xs font-[590] leading-none text-white"
                    style={{ left: nameWidth + l.mid!.x - 8, top: l.mid!.y - 8 }}
                  >
                    !
                  </span>
                ))}
            {[...fixed].map(([k, mid]) => (
              <span
                key={`fixed!${k}`}
                aria-hidden
                className="pointer-events-none absolute z-[7] flex size-4 items-center justify-center rounded-full bg-destructive text-3xs font-[590] leading-none text-white"
                style={{ left: nameWidth + mid.x - 8, top: mid.y - 8, animation: "work-glyph-out 160ms var(--ease-out) both" }}
              >
                !
              </span>
            ))}

            {virtualizer.getVirtualItems().map((item) => {
              const row = rows[item.index]
              const top = item.start - HEADER_HEIGHT - milestonesTall
              if (row.kind === "group") {
                return (
                  <TimelineGroupRow
                    key={row.key}
                    id={row.id}
                    top={top}
                    width={nameWidth + gridWidth}
                    nameWidth={nameWidth}
                    first={item.index === 0}
                    label={row.label}
                    count={row.count}
                    collapsed={row.collapsed}
                    status={row.status}
                    onToggle={toggleGroup}
                  />
                )
              }
              const { task } = row
              const moving = preview?.id === task.task_uuid ? preview : null
              const span = moving ? applyEdit(row.span, moving) : row.span
              const origin = barBox(row.span, range, dayWidth)
              const box = barBox(span, range, dayWidth)
              const isMove = moving?.kind === "move"
              const late = !moving && isLate(task, today)
              const pending = isPending(task)
              return (
                <TimelineTaskRow
                  key={row.key}
                  top={top}
                  nameWidth={nameWidth}
                  gridWidth={gridWidth}
                  status={statusOptionOf(task, statuses)}
                  pending={pending}
                  onOpen={openTask}
                  task={task}
                  left={isMove ? origin.left : box.left}
                  width={isMove ? origin.width : box.width}
                  shift={isMove ? box.left - origin.left : 0}
                  ghost={moving ? origin : null}
                  hue={projectHue}
                  label={spanLabel(span, today)}
                  bubble={moving ? bubbleLabel(span) : undefined}
                  late={late}
                  lateTail={late ? todayLeft + dayWidth - (box.left + box.width) : 0}
                  done={task.task_status === "done"}
                  milestone={!taskDate(task.task_start_date) && !!taskDate(task.task_due_date)}
                  canEdit={canMove(task) && !pending}
                  stickAt={nameWidth + STICK_INSET}
                  blocked={task.task_blocked_open ?? 0}
                  onLinkStart={given ? undefined : onLinkStart}
                  linkTarget={linking?.target === task.task_uuid}
                  selected={opened === task.task_uuid}
                  landed={landed.has(task.task_uuid)}
                  grow={grow.bar(item.index)}
                  helpId={helpId}
                  onPointerDown={onBarPointerDown}
                  onKeyDown={onBarKeyDown}
                  onClick={onBarClick}
                  onHover={setHovered}
                />
              )
            })}

            {/* A task from Unscheduled, held over a day: a one-day ghost bar with its date. */}
            {dropDay && dropRow != null && (
              <div
                aria-hidden
                data-drop-ghost=""
                className="pointer-events-none absolute z-[8] h-6 rounded-md bg-hue-tint opacity-80 outline outline-[1.5px] outline-offset-[-1.5px] outline-dashed outline-hue"
                style={{ left: nameWidth + offsetOf(dropDay, range, dayWidth), top: (tops[dropRow] ?? 0) + 6, width: Math.max(dayWidth, 16) }}
              >
                <span className="absolute -top-8 left-0 whitespace-nowrap rounded-md bg-pop px-2 py-1 text-xs font-[510] tabular-nums text-foreground shadow-e3">
                  {bubbleLabel({ start: dropDay, end: dropDay })}
                </span>
              </div>
            )}

            {nothingDated && (
              <div className="absolute inset-x-0 top-6 flex justify-center px-4" style={{ paddingLeft: nameWidth }}>
                {!showDone && tasks.some((t) => t.task_status === "done" && spanOf(t)) ? (
                  <p className="max-w-sm text-center text-sm text-ink-2">Every dated task is done. Show done tasks from Display.</p>
                ) : (
                  <EmptyState
                    illustration={<SpotCalendar hue={projectHue} />}
                    title="Nothing on the timeline yet"
                    description={canEdit ? "Give tasks a start and due date, or drag one in from Unscheduled." : "No task has a date yet."}
                    action={
                      canEdit && unscheduled.length > 0 && !sideShown ? (
                        <Button variant="secondary" size="sm" onClick={() => setSideOpen(true)}>
                          Open Unscheduled
                        </Button>
                      ) : undefined
                    }
                  />
                )}
              </div>
            )}
          </GridDrop>
        </div>

        {sideShown && (
          <UnscheduledPanel tasks={unscheduled} statuses={statuses} canMove={canMove} onOpenTask={onOpenTask} onClose={() => setSideOpen(false)} away={lifted?.id} />
        )}
        {/* The row a mouse or a finger carries (lifted, e3). A keyboard's task
            travels as the ghost bar alone, which says the date it lands on. */}
        <DragOverlay className={DRAG_OVERLAY} dropAnimation={null}>
          {liftedTask && !lifted?.keys ? (
            <div data-drag-state="lifted" className="flex h-9 w-[240px] items-center gap-2.5 rounded-md bg-raised px-2.5 text-sm shadow-e3">
              {liftedStatus && <TaskStatusCell status={liftedStatus} label="tip" />}
              <span className="min-w-0 flex-1 truncate">{liftedTask.task_name}</span>
            </div>
          ) : null}
        </DragOverlay>
        </DndContext>
      </div>

      <p id={helpId} className="sr-only">
        Left and right arrows move the task a day. Shift with an arrow changes when it&apos;s due. Enter opens it, and its
        panel sets what it waits on.
      </p>
    </div>
  )
}

/**
 * The grid as the drop target for a task from Unscheduled. useDroppable reads
 * the DndContext above the component that calls it, so it is called here,
 * inside the timeline's own: called in ProjectTimeline, which draws that
 * context, the grid registered with none, and a task carried by mouse or
 * finger was over nothing and went back to Unscheduled.
 */
function GridDrop({ disabled, bodyRef, ...props }: { disabled: boolean; bodyRef: React.RefObject<HTMLDivElement | null> } & React.ComponentProps<"div">) {
  const { setNodeRef } = useDroppable({ id: GRID, disabled })
  return (
    <div
      {...props}
      ref={(el) => {
        bodyRef.current = el
        setNodeRef(el)
      }}
    />
  )
}

/**
 * The timeline while it loads, inside its frame: the date header's band, then
 * rows the height of a task's row, each a name and a bar, so nothing moves
 * when the tasks land.
 */
function TimelineSkeleton({ nameWidth }: { nameWidth: number }) {
  return (
    <div role="status" aria-label="Loading the timeline" className="flex-1">
      <div className="flex border-b border-line" style={{ height: HEADER_HEIGHT }}>
        <div className="flex shrink-0 items-end border-r border-line px-5 pb-2 text-xs font-[510] text-ink-3" style={{ width: nameWidth }}>
          Task
        </div>
      </div>
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} aria-hidden="true" className="flex items-center" style={{ height: ROW_HEIGHT }}>
          <div className="flex h-full shrink-0 items-center gap-2.5 border-r border-line px-5" style={{ width: nameWidth }}>
            <Skeleton className="size-4 rounded-full" />
            <Skeleton className={cn("h-3.5", i % 2 === 0 ? "w-3/4" : "w-1/2")} />
          </div>
          <div className="relative h-full flex-1">
            <Skeleton className="absolute top-1.5 h-6 rounded-md" style={{ left: `${(i * 7) % 40}%`, width: `${18 + ((i * 13) % 30)}%` }} />
          </div>
        </div>
      ))}
    </div>
  )
}
