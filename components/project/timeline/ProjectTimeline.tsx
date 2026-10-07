"use client"

import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type DragEvent, type KeyboardEvent, type PointerEvent } from "react"
import { useVirtualizer } from "@tanstack/react-virtual"
import { startOfDay } from "date-fns"
import { MixerHorizontalIcon } from "@radix-ui/react-icons"
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
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { useProjectStatuses } from "@/hooks/useProjectStatuses"
import { useProjectTimeline } from "@/hooks/useProjectTimeline"
import { useStoredState } from "@/hooks/useStoredState"
import { CalendarOff, ChartGantt, ChevronDown, ChevronRight, CirclePlus } from "@/lib/icons"
import {
  DAY_WIDTH,
  GROUPINGS,
  ZOOMS,
  applyEdit,
  barBox,
  barColor,
  dotColor,
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
  type ViewAnchor,
  type Zoom,
  firstView,
  spanOf,
} from "@/lib/timeline"
import { cn } from "@/lib/utils/helpers/cn"
import { HEADER_HEIGHT, TimelineHeader } from "./TimelineHeader"
import { TimelineBar } from "./TimelineBar"
import { UNSCHEDULED_DRAG, UnscheduledPanel } from "./UnscheduledPanel"

const ROW_HEIGHT = 36
/** How close to an edge a drag starts scrolling the timeline, and how fast. */
const EDGE = 48
const EDGE_STEP = 14

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
const isBool = (v: unknown): v is boolean => typeof v === "boolean"

interface Drag {
  task: TimelineTask
  kind: EditKind
  x0: number
  scroll0: number
  pointerX: number
  days: number
  moved: boolean
  frame: number
}

/**
 * A project's timeline: its tasks as bars across the days they run, grouped
 * by status or by who has them, with today marked. The project's admins drag
 * a bar to move it, drag an end to change when it starts or is due, and drag
 * a task with no dates onto a day; arrows do the same from the keyboard. On a
 * phone (compact) it shows the plan, and a task opens to change its dates.
 */
export function ProjectTimeline({
  projectId,
  tasks: given,
  viewKey,
  onOpenTask,
  onCreateTask,
  compact = false,
  className,
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
}) {
  const fetched = useProjectTimeline(given ? "" : projectId)
  const { isLoading, isError, mutate, reschedule } = fetched
  const data: TimelineData | undefined = given ? { tasks: given, total: given.length, can_edit: false } : fetched.data
  const tasks = given ?? fetched.tasks
  const { options: statuses } = useProjectStatuses(given ? undefined : projectId)
  const key = viewKey ?? projectId
  const [zoom, setZoom, zoomReady] = useStoredState<Zoom>(`oc_timeline_zoom:${key}`, "week", isZoom)
  const [grouping, setGrouping] = useStoredState<Grouping>(`oc_timeline_grouping:${key}`, "status", isGrouping)
  const [showDone, setShowDone] = useStoredState<boolean>(`oc_timeline_done:${key}`, true, isBool)
  const [sideOpen, setSideOpen] = useStoredState<boolean>(compact ? undefined : "oc_timeline_unscheduled", !compact, isBool)
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set())
  const [today] = useState(() => startOfDay(new Date()))
  const [preview, setPreview] = useState<{ id: string; kind: EditKind; days: number } | null>(null)
  const [dropDay, setDropDay] = useState<Date | null>(null)
  const helpId = useId()

  const canEdit = !!data?.can_edit && !compact
  const dayWidth = DAY_WIDTH[zoom]
  const nameWidth = compact ? 128 : 240

  const { rows, unscheduled, spans } = useMemo(
    () => timelineRows(tasks, { grouping, statuses, showDone, collapsed }),
    [tasks, grouping, statuses, showDone, collapsed],
  )
  const range = useMemo(() => timelineRange(spans, today, zoom), [spans, today, zoom])
  const gridWidth = range.days * dayWidth

  const scrollRef = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
    scrollMargin: HEADER_HEIGHT,
  })

  // ---- Keeping the same days in view -----------------------------------------
  // The day in the middle of the view, kept there when the zoom changes, the
  // timeline narrows or the grid grows to the left (a task moved earlier than
  // it reached). First, where lib/timeline firstView says.
  const anchor = useRef<ViewAnchor | null>(null)
  const visibleGrid = () => Math.max((scrollRef.current?.clientWidth ?? 0) - nameWidth, 0)
  const anchorNow = () => (anchor.current ??= firstView(spans, today, visibleGrid() / dayWidth))
  // Every scroll moves it, a drag's own included, so what's in view stays put
  // when a panel opens after the drop.
  const onScroll = () => {
    const el = scrollRef.current
    if (!el) return
    anchor.current = { day: dayAt(el.scrollLeft + visibleGrid() / 2, range, dayWidth), at: 0.5 }
  }
  const rangeFrom = range.from.getTime()
  const ready = !!data && zoomReady
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el || !ready) return
    const { day, at } = anchorNow()
    el.scrollLeft = Math.max(0, offsetOf(day, range, dayWidth) + dayWidth / 2 - visibleGrid() * at)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the grid's first day or scale changes
  }, [rangeFrom, dayWidth, ready])

  // A panel opening beside the timeline narrows it; the same days stay in the middle.
  useEffect(() => {
    const el = scrollRef.current
    if (!el || typeof ResizeObserver === "undefined") return
    let width = el.clientWidth
    const watch = new ResizeObserver(() => {
      if (el.clientWidth === width || drag.current) return
      width = el.clientWidth
      const { day, at } = anchorNow()
      el.scrollLeft = Math.max(0, offsetOf(day, range, dayWidth) + dayWidth / 2 - visibleGrid() * at)
    })
    watch.observe(el)
    return () => watch.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-made when the grid changes, as the anchor's effect is
  }, [rangeFrom, dayWidth, ready])

  const goToday = () => {
    const el = scrollRef.current
    if (!el) return
    anchor.current = { day: today, at: 1 / 3 }
    const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    el.scrollTo({ left: Math.max(0, offsetOf(today, range, dayWidth) + dayWidth / 2 - visibleGrid() / 3), behavior: reduce ? "auto" : "smooth" })
  }

  // ---- Focus follows a task that moved ------------------------------------------
  // Rows are in date order, so a moved task can change places; its bar is
  // found again and kept in view (clear of the names and the header: the
  // scroll container's scroll padding).
  const follow = useRef<string | null>(null)
  useLayoutEffect(() => {
    const id = follow.current
    if (!id) return
    const bar = scrollRef.current?.querySelector<HTMLElement>(`[data-bar="${CSS.escape(id)}"]`)
    if (bar) {
      if (document.activeElement !== bar) bar.focus({ preventScroll: true })
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

  const onBarPointerDown = useCallback(
    (e: PointerEvent, task: TimelineTask, kind: EditKind) => {
      // A finger scrolls the timeline; on touch screens a tap opens the task.
      if (!canEdit || e.button !== 0 || e.pointerType === "touch" || isPending(task)) return
      e.preventDefault()
      e.stopPropagation()
      const el = scrollRef.current
      if (!el) return
      const d: Drag = { task, kind, x0: e.clientX, scroll0: el.scrollLeft, pointerX: e.clientX, days: 0, moved: false, frame: 0 }
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
      // Held near an edge, the timeline scrolls on under the pointer.
      const edgeScroll = () => {
        if (drag.current !== d) return
        const box = el.getBoundingClientRect()
        const step = d.pointerX > box.right - EDGE ? EDGE_STEP : d.pointerX < box.left + nameWidth + EDGE ? -EDGE_STEP : 0
        if (step) {
          el.scrollLeft += step
          measure()
        }
        d.frame = requestAnimationFrame(edgeScroll)
      }
      const move = (ev: globalThis.PointerEvent) => {
        d.pointerX = ev.clientX
        measure()
      }
      const finish = (save: boolean) => {
        window.removeEventListener("pointermove", move)
        window.removeEventListener("pointerup", up)
        window.removeEventListener("pointercancel", cancel)
        window.removeEventListener("keydown", escape, true)
        cancelAnimationFrame(d.frame)
        drag.current = null
        setPreview(null)
        // The click that ends a drag, or a drag called off with Esc, isn't a
        // click on the task. Swallowed when it comes, however late the button
        // is let go; the next press ends the wait if it never does.
        if (d.moved || !save) swallowNextClick()
        const next = save && d.moved ? datesAfter(d.task, { kind: d.kind, days: d.days }) : null
        if (next) {
          follow.current = d.task.task_uuid
          void reschedule(d.task, next)
        }
      }
      const up = () => finish(true)
      const cancel = () => finish(false)
      const escape = (ev: globalThis.KeyboardEvent) => {
        if (ev.key !== "Escape") return
        ev.preventDefault()
        ev.stopPropagation()
        finish(false)
      }
      window.addEventListener("pointermove", move)
      window.addEventListener("pointerup", up)
      window.addEventListener("pointercancel", cancel)
      window.addEventListener("keydown", escape, true)
      d.frame = requestAnimationFrame(edgeScroll)
    },
    [canEdit, dayWidth, nameWidth, reschedule],
  )

  const onBarClick = useCallback(
    (task: TimelineTask) => {
      if (!isPending(task)) onOpenTask(task.task_uuid)
    },
    [onOpenTask],
  )

  const onBarKeyDown = useCallback(
    (e: KeyboardEvent, task: TimelineTask) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault()
        if (!isPending(task)) onOpenTask(task.task_uuid)
        return
      }
      if (!canEdit || isPending(task) || (e.key !== "ArrowLeft" && e.key !== "ArrowRight")) return
      // Alt+← and ⌘+← are Back; Ctrl+arrows move between words. None of them is a nudge.
      if (e.altKey || e.ctrlKey || e.metaKey) return
      e.preventDefault()
      const next = datesAfter(task, { kind: e.shiftKey ? "end" : "move", days: e.key === "ArrowLeft" ? -1 : 1 })
      if (!next) return
      follow.current = task.task_uuid
      void reschedule(task, next, true)
    },
    [canEdit, onOpenTask, reschedule],
  )

  // ---- Dropping a task with no dates on a day ------------------------------------
  // The day under the pointer, or none over the names, which hide the days behind them.
  const dayUnder = (e: DragEvent) => {
    const view = scrollRef.current?.getBoundingClientRect()
    const body = bodyRef.current?.getBoundingClientRect()
    if (!view || !body || e.clientX < view.left + nameWidth) return null
    return dayAt(e.clientX - body.left - nameWidth, range, dayWidth)
  }
  const onDragOver = (e: DragEvent) => {
    if (!canEdit || !e.dataTransfer.types.includes(UNSCHEDULED_DRAG)) return
    const day = dayUnder(e)
    if (!day) return setDropDay(null)
    e.preventDefault()
    e.dataTransfer.dropEffect = "move"
    if (day.getTime() !== dropDay?.getTime()) setDropDay(day)
  }
  const onDrop = (e: DragEvent) => {
    const id = e.dataTransfer.getData(UNSCHEDULED_DRAG)
    const day = dayUnder(e)
    setDropDay(null)
    const task = unscheduled.find((t) => t.task_uuid === id)
    if (!canEdit || !task || !day) return
    e.preventDefault()
    follow.current = task.task_uuid
    void reschedule(task, datesForDrop(day))
  }

  const toggleGroup = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (!next.delete(id)) next.add(id)
      return next
    })

  // ---- Drawing --------------------------------------------------------------------
  if (isError && !data) {
    return <ErrorState subject="the timeline" onRetry={() => void mutate()} />
  }
  if ((isLoading && !data) || !zoomReady) {
    return (
      <div className={cn("grid gap-2 p-1", className)} aria-busy>
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="h-7" style={{ marginLeft: `${(i * 7) % 40}%`, width: `${30 + ((i * 13) % 35)}%` }} />
        ))}
      </div>
    )
  }
  if (data && data.tasks.length === 0) {
    return (
      <EmptyState
        className={className}
        icon={ChartGantt}
        title="Nothing on the timeline yet"
        description={
          given
            ? "The project's tasks show here as bars across the days they run, once they have dates."
            : "A project's tasks show here as bars across the days they run. Add a task with a due date, or start the project from a template."
        }
        action={
          onCreateTask && (
            <Button size="sm" className="gap-1.5" onClick={onCreateTask}>
              <CirclePlus className="h-4 w-4" />
              New task
            </Button>
          )
        }
      />
    )
  }

  const todayLeft = offsetOf(today, range, dayWidth)
  const sideShown = sideOpen && unscheduled.length > 0
  const dropBox = dropDay ? { left: offsetOf(dropDay, range, dayWidth), width: dayWidth } : null
  const truncated = data && data.total > data.tasks.length
  const nothingDated = rows.length === 0
  const weekShade = zoom !== "month"
  const gridLines =
    zoom === "day"
      ? Array.from({ length: Math.ceil(range.days / 7) }, (_, i) => i * 7 * dayWidth)
      : null

  return (
    <div className={cn("flex h-full min-h-0 flex-col gap-3", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" className="h-8" onClick={goToday}>
            Today
          </Button>
          <ToggleGroup
            type="single"
            size="sm"
            value={zoom}
            onValueChange={(v) => isZoom(v) && setZoom(v)}
            aria-label="Zoom"
            className="rounded-md border p-0.5"
          >
            {ZOOMS.map((z) => (
              <ToggleGroupItem key={z.value} value={z.value} className="h-7 px-2.5 text-xs">
                {z.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          {truncated && (
            <span className="text-xs text-muted-foreground">
              The newest {data.tasks.length.toLocaleString()} of {data.total.toLocaleString()} tasks
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 gap-1.5">
                <MixerHorizontalIcon className="h-4 w-4" />
                View
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
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
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            variant={sideShown ? "secondary" : "outline"}
            size="sm"
            className="h-8 gap-1.5"
            aria-pressed={sideShown}
            disabled={unscheduled.length === 0}
            title={unscheduled.length === 0 ? "Every open task has a date" : undefined}
            onClick={() => setSideOpen(!sideShown)}
          >
            <CalendarOff className="h-4 w-4" />
            Unscheduled
            <span className="tabular-nums text-muted-foreground">{unscheduled.length}</span>
          </Button>
        </div>
      </div>

      <div className="relative flex min-h-0 flex-1 overflow-hidden rounded-lg border bg-background">
        <div
          ref={scrollRef}
          role="region"
          aria-label="Timeline"
          className="relative min-w-0 flex-1 select-none overflow-auto overscroll-x-contain"
          style={{ scrollPaddingLeft: nameWidth, scrollPaddingTop: HEADER_HEIGHT }}
          onScroll={onScroll}
        >
          <TimelineHeader range={range} zoom={zoom} dayWidth={dayWidth} today={today} nameWidth={nameWidth} />
          <div
            ref={bodyRef}
            className="relative"
            style={{ height: Math.max(virtualizer.getTotalSize(), nothingDated ? 160 : 0), width: nameWidth + gridWidth }}
            onDragOver={onDragOver}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropDay(null)
            }}
            onDrop={onDrop}
          >
            {/* Weekends, week lines, today and where a dragged task would land. */}
            <div aria-hidden className="pointer-events-none absolute inset-y-0" style={{ left: nameWidth, width: gridWidth }}>
              {weekShade && (
                <div
                  className="absolute inset-0 opacity-70"
                  style={{ backgroundImage: `repeating-linear-gradient(to right, transparent 0 ${5 * dayWidth}px, var(--muted) ${5 * dayWidth}px ${7 * dayWidth}px)` }}
                />
              )}
              {gridLines?.map((left) => <div key={left} className="absolute inset-y-0 w-px bg-border/60" style={{ left }} />)}
              {dropBox && <div className="absolute inset-y-0 border-x border-dashed border-primary bg-primary/10" style={dropBox} />}
              {todayLeft >= 0 && todayLeft < gridWidth && (
                <div className="absolute inset-y-0 w-0.5 -translate-x-1/2 bg-primary/70" style={{ left: todayLeft + dayWidth / 2 }} />
              )}
            </div>

            {virtualizer.getVirtualItems().map((item) => {
              const row = rows[item.index]
              const top = item.start - HEADER_HEIGHT
              if (row.kind === "group") {
                return (
                  <div key={row.key} className="absolute left-0 flex border-b bg-muted/40" style={{ top, height: ROW_HEIGHT, width: nameWidth + gridWidth }}>
                    <button
                      type="button"
                      aria-expanded={!row.collapsed}
                      onClick={() => toggleGroup(row.id)}
                      className="sticky left-0 z-10 flex shrink-0 items-center gap-2 border-r bg-muted px-2 text-left text-xs font-semibold outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                      style={{ width: nameWidth }}
                    >
                      {row.collapsed ? <ChevronRight className="h-3.5 w-3.5 shrink-0" /> : <ChevronDown className="h-3.5 w-3.5 shrink-0" />}
                      {row.dot && <span aria-hidden className={cn("h-2 w-2 shrink-0 rounded-full", row.dot)} />}
                      <span className="truncate">{row.label}</span>
                      <span className="ml-auto font-normal tabular-nums text-muted-foreground">{row.count}</span>
                    </button>
                  </div>
                )
              }
              const { task } = row
              const moving = preview?.id === task.task_uuid ? preview : null
              const span = moving ? applyEdit(row.span, moving) : row.span
              const box = barBox(span, range, dayWidth)
              const done = task.task_status === "done"
              return (
                <div key={row.key} className="group absolute left-0 flex border-b border-border/50" style={{ top, height: ROW_HEIGHT, width: nameWidth + gridWidth }}>
                  <div
                    className="sticky left-0 z-10 flex shrink-0 items-center gap-2 border-r bg-background px-3 group-hover:bg-muted"
                    style={{ width: nameWidth }}
                  >
                    <span aria-hidden className={cn("h-2 w-2 shrink-0 rounded-full", dotColor(task, statuses))} />
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={() => !isPending(task) && onOpenTask(task.task_uuid)}
                      className={cn("truncate text-left text-sm hover:underline", done && "text-muted-foreground line-through")}
                      title={task.task_name}
                    >
                      {task.task_name}
                    </button>
                  </div>
                  <div className="relative" style={{ width: gridWidth }}>
                    <TimelineBar
                      task={task}
                      left={box.left}
                      width={box.width}
                      color={barColor(task, statuses)}
                      label={spanLabel(span, today)}
                      dragLabel={moving ? spanLabel(span, today) : undefined}
                      late={!moving && isLate(task, today)}
                      done={done}
                      canEdit={canEdit && !isPending(task)}
                      stickAt={nameWidth + 4}
                      helpId={helpId}
                      onPointerDown={onBarPointerDown}
                      onKeyDown={onBarKeyDown}
                      onClick={onBarClick}
                    />
                  </div>
                </div>
              )
            })}

            {nothingDated && (
              <div className="pointer-events-none absolute inset-x-0 top-10 flex justify-center px-4" style={{ paddingLeft: nameWidth }}>
                <p className="max-w-sm text-center text-sm text-muted-foreground">
                  {!showDone && tasks.some((t) => t.task_status === "done" && spanOf(t))
                    ? "Every dated task is done. Show done tasks from View."
                    : canEdit
                      ? "No task has a date yet. Drag one from Unscheduled onto a day."
                      : "No task has a date yet."}
                </p>
              </div>
            )}
          </div>
        </div>

        {sideShown && (
          <UnscheduledPanel tasks={unscheduled} canEdit={canEdit} overlay={compact} onOpenTask={onOpenTask} onClose={() => setSideOpen(false)} />
        )}
      </div>

      <p id={helpId} className="sr-only">
        Left and right arrows move the task a day. Shift with an arrow changes when it&apos;s due. Enter opens it.
      </p>
    </div>
  )
}
