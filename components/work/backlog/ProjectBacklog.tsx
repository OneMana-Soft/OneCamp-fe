"use client"

// The backlog tab (projects B3, STEP4_PLAN §4 #9 with STEP5 spec F; the bar
// is Jira's backlog): the project's open cycles as containers, the current
// first, each with its tasks, totals and capacity, then the backlog: open
// tasks in no cycle. Drag a task into a cycle or back (lib/ui/dnd: Space
// lifts, the arrows move between containers, Space drops, Escape puts it
// back, every step said); on a phone, "Move to…" in the row's sheet. On a
// computer the keys work it as a list (KeyboardList): J and K move, X picks,
// Shift+C moves what is picked into a cycle. Start the next cycle, complete
// the current one, or set what it's planned against, from its header. Work
// is counted in hours, or in points when the project estimates in them
// (linear-05: lib/work/estimates), which its admins choose under Estimates.

import * as React from "react"
import { useCallback, useMemo, useState } from "react"
import { CalendarPlus, Repeat } from "lucide-react"
import { DndContext, DragOverlay, useDraggable, useDroppable, type DragEndEvent, type UniqueIdentifier } from "@dnd-kit/core"
import { useDispatch } from "react-redux"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/empty-state"
import { Field } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { OverlayBody, OverlayFooter } from "@/components/ui/overlay"
import { useSheetMode } from "@/components/ui/overlayMode"
import { SHEET_FOOTER_ROW } from "@/components/ui/sheetFrame"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Orbit } from "@/components/ui/graphics/motifs"
import { ProgressRing } from "@/components/ui/graphics/ProgressRing"
import { LoadFailureState } from "@/components/ui/load-failure-state"
import { KeyboardList, TaskRowCheck } from "@/components/task/KeyboardList"
import { TabLoading } from "@/components/task/TabLoading"
import { useMedia } from "@/context/MediaQueryContext"
import { useFetch } from "@/hooks/useFetch"
import { useRowState } from "@/hooks/useListSelection"
import { useProjectStatuses } from "@/hooks/useProjectStatuses"
import { useToast } from "@/hooks/use-toast"
import { lazyDialog } from "@/lib/lazy/lazyDialog"
import { cycleDates, cycleLabel, nextStart, percentDone } from "@/lib/tasks/cycles"
import { busyWith } from "@/lib/ui/busyWith"
import { DRAG_OVERLAY, useDndSetup, useDragState, type DragWords } from "@/lib/ui/dnd"
import { apiErrorMessage } from "@/lib/utils/apiError"
import { cn } from "@/lib/utils/helpers/cn"
import {
  BACKLOG,
  backlogPath,
  capacityMinutes,
  capacityOf,
  capacityPoints,
  completeCycle,
  createCycle,
  loadOf,
  measureOf,
  moveTask,
  saveSchedule,
  scheduleLine,
  setCycleCapacity,
  setTaskCycle,
  startCycle,
  stopSchedule,
  totalsLine,
  type BacklogAnswer,
  type BacklogTask,
  type CycleChoice,
  type Measure,
  type PlanCycle,
} from "@/lib/work/backlog"
import type { EstimateScale } from "@/lib/work/points"
import { openRightPanel } from "@/store/slice/desktopRightPanelSlice"
import { BacklogRow } from "./BacklogRow"
import { CompleteCycleDialog } from "./CompleteCycleDialog"
import { MoveSheet } from "./MoveSheet"
import { ScheduleDialog } from "./ScheduleDialog"

// The cycles' calendar link and the project's estimates: chunks of their own, loaded when opened.
const CycleFeedDialog = lazyDialog(() => import("./CycleFeedDialog").then((m) => m.default), "the calendar link")
const EstimatesDialog = lazyDialog(() => import("./EstimatesDialog").then((m) => m.default), "the estimates")

// Status colours, not area hues (moss and sun are Projects' and Calendar's since v3.1).
const LOAD_TONE = { under: "bg-success", at: "bg-warning", over: "bg-destructive" } as const
const LOAD_WORDS = { under: "under capacity", at: "at capacity", over: "over capacity" } as const

export default function ProjectBacklog({ projectId }: { projectId: string }) {
  const key = backlogPath(projectId)
  const read = useFetch<BacklogAnswer>(key)
  const { options } = useProjectStatuses(projectId)
  const { isMobile } = useMedia()
  const { toast } = useToast()
  const dispatch = useDispatch()
  const [completing, setCompleting] = useState<PlanCycle | null>(null)
  const [moving, setMoving] = useState<BacklogTask | null>(null)
  // The action under way, named, so each button is busy with its own and waits while another runs (busyWith).
  const [underWay, setUnderWay] = useState<string | null>(null)
  const busy = underWay !== null
  const [scheduling, setScheduling] = useState(false)
  const [feeding, setFeeding] = useState(false)
  const [estimating, setEstimating] = useState(false)
  const data = read.data?.data.backlog
  const measure = useMemo(() => (data ? measureOf(data) : undefined), [data])
  const schedule = read.data?.data.schedule
  const canEdit = !!read.data?.data.can_edit
  const canPlan = !!read.data?.data.can_plan

  const failed = useCallback(
    (title: string) => (e: unknown) => toast({ title, description: apiErrorMessage(e, "Nothing changed. Try again."), tone: "error" }),
    [toast],
  )

  // A move paints at once and is undone if the server refuses it.
  const move = useCallback(
    async (taskId: string, to: string) => {
      if (!data) return
      const next = moveTask(data, taskId, to, measure)
      if (!next) return
      const before = read.data!
      await read.mutate({ data: { ...before.data, backlog: next } }, { revalidate: false })
      try {
        await setTaskCycle(taskId, to === BACKLOG ? "" : to)
        void read.mutate()
      } catch (e) {
        await read.mutate(before, { revalidate: false })
        failed("Couldn't move the task")(e)
      }
    },
    [data, read, failed, measure],
  )

  // A capacity paints at once too, in the project's unit, and is put back if the server refuses it.
  const setCapacity = useCallback(
    async (cycleId: string, amount: number | null) => {
      if (!data) return
      const before = read.data!
      const points = !!measure?.points
      const cycles = data.cycles.map((c) => (c.id === cycleId ? { ...c, [points ? "capacity_points" : "capacity_minutes"]: amount ?? undefined } : c))
      await read.mutate({ data: { ...before.data, backlog: { ...data, cycles } } }, { revalidate: false })
      try {
        await setCycleCapacity(projectId, cycleId, amount, points)
        void read.mutate()
      } catch (e) {
        await read.mutate(before, { revalidate: false })
        failed("Couldn't set the capacity")(e)
      }
    },
    [data, read, failed, projectId, measure],
  )

  // Every task on the tab, for the keys and the selection's bar, and the cycles it can move into.
  const shown = useMemo(() => (data ? [...data.cycles.flatMap((c) => c.tasks), ...data.tasks] : []), [data])
  const mayPlan = useCallback(() => canPlan, [canPlan])
  const choices = useMemo<CycleChoice[]>(() => (data?.cycles ?? []).map((c) => ({ id: c.id, label: cycleLabel(c), dates: cycleDates(c) })), [data])

  const act = async (key: string, title: string, run: () => Promise<void>) => {
    setUnderWay(key)
    try {
      await run()
      await read.mutate()
    } catch (e) {
      failed(title)(e)
    } finally {
      setUnderWay(null)
    }
  }

  // Where each task and container is, for the words a drag says.
  const words = useMemo<DragWords>(() => {
    const names = new Map<string, string>()
    const homes = new Map<string, string>()
    for (const c of data?.cycles ?? []) {
      names.set(c.id, cycleLabel(c))
      for (const t of c.tasks) {
        names.set(t.task_uuid, t.task_name)
        homes.set(t.task_uuid, cycleLabel(c))
      }
    }
    for (const t of data?.tasks ?? []) {
      names.set(t.task_uuid, t.task_name)
      homes.set(t.task_uuid, "Backlog")
    }
    names.set(BACKLOG, "Backlog")
    return {
      name: (id) => names.get(String(id)) ?? "the task",
      place: (id) => ({ container: homes.get(String(id)) ?? names.get(String(id)) ?? "Backlog" }),
    }
  }, [data])
  const dnd = useDndSetup(words)
  const homeOf = useCallback((id: UniqueIdentifier) => data?.cycles.find((c) => c.tasks.some((t) => t.task_uuid === id))?.id ?? BACKLOG, [data])
  const drag = useDragState((active, over) => homeOf(active) !== over)
  const onDragEnd = (e: DragEndEvent) => {
    drag.handlers.onDragEnd(e)
    if (e.over) void move(String(e.active.id), String(e.over.id))
  }

  if (read.isError && !data) return <LoadFailureState error={read.isError} noun="backlog" onRetry={() => void read.mutate()} className="m-auto pt-12" />
  if (!data || !measure) return <TabLoading kind="list" />
  // A row names its points as the scale does, once the backlog counts them.
  const rowScale = measure.points ? data.scale ?? undefined : undefined

  // The one orange action on the tab (spec F): complete the current cycle,
  // or, with none running, start the next.
  const current = data.cycles.find((c) => c.state === "current" || c.state === "ended")
  const primary = current?.id ?? data.cycles.find((c) => c.state === "upcoming")?.id
  const open = (id: string) => dispatch(openRightPanel({ taskUUID: id }))
  const draggable = canPlan && !isMobile
  const nextOf = (c: PlanCycle) => data.cycles.find((x) => x.number > c.number)

  return (
    <DndContext {...dnd} {...drag.handlers} onDragEnd={onDragEnd}>
      <div data-backlog="" className="mx-auto grid max-w-[960px] grid-cols-[minmax(0,1fr)] gap-4 px-4 pb-10 pt-4 sm:px-6">
        {/* How the cycles run (B3b): by themselves, on a schedule, or by hand. */}
        {schedule || canEdit || data.cycles.length > 0 ? (
          <div className="flex min-h-9 min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
            {schedule ? (
              <p data-schedule="" className="flex min-w-0 items-center gap-2 text-meta text-ink-2">
                <Repeat aria-hidden className="size-3.5 shrink-0 text-ink-3" />
                <span className="min-w-0">{scheduleLine(schedule)}</span>
              </p>
            ) : null}
            <span className="flex-1" />
            {/* Anyone who sees the project may have its cycles in their calendar (linear-12). */}
            {data.cycles.length > 0 ? (
              <Button size="sm" variant="ghost" onClick={() => setFeeding(true)}>
                <CalendarPlus aria-hidden className="!size-3.5" />
                Add to calendar
              </Button>
            ) : null}
            {canEdit ? (
              <>
                <Button size="sm" variant="ghost" onClick={() => setEstimating(true)}>
                  Estimates
                </Button>
                <Button size="sm" variant="secondary" disabled={busy} onClick={() => setScheduling(true)}>
                  {schedule ? "Change schedule" : "Run cycles automatically"}
                </Button>
              </>
            ) : null}
          </div>
        ) : null}
        <KeyboardList
          tasks={shown}
          canEdit={mayPlan}
          listProjectId={projectId}
          statusOptions={options}
          cycles={choices}
          paused={drag.activeId !== null}
          className="grid grid-cols-[minmax(0,1fr)] gap-4"
        >
          {data.cycles.length === 0 ? (
            <EmptyState
              illustration={<Orbit size={96} />}
              title="Plan in cycles"
              description="A cycle is a week or more of work. Pull tasks into it from the backlog below."
              action={
                canEdit ? (
                  <Button size="sm" {...busyWith(underWay, "make")} onClick={() => void act("make", "Couldn't make a cycle", () => createCycle(projectId, nextStart([])))}>
                    Make a cycle
                  </Button>
                ) : undefined
              }
              className="rounded-xl bg-raised py-8 shadow-e1"
            />
          ) : (
            data.cycles.map((c) => (
              <Container key={c.id} id={c.id} drop={drag.dropState(c.id)} disabled={!draggable}>
                <CycleHeader
                  cycle={c}
                  measure={measure}
                  capacity={capacityOf(c, data, measure)}
                  projectCapacity={measure.project(data)}
                  primary={c.id === primary}
                  canEdit={canEdit}
                  underWay={underWay}
                  onStart={() => void act(`start ${c.id}`, "Couldn't start the cycle", () => startCycle(projectId, c.id))}
                  onComplete={() => setCompleting(c)}
                  onCapacity={(amount) => void setCapacity(c.id, amount)}
                />
                <Rows tasks={c.tasks} empty="Drag tasks here from the backlog." {...{ options, draggable, drag, open, isMobile, canPlan, setMoving, rowScale }} />
              </Container>
            ))
          )}

          <Container id={BACKLOG} drop={drag.dropState(BACKLOG)} disabled={!draggable} plain>
            <header className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1 px-3 pt-2">
              <h2 className="text-ui font-[590] text-foreground">Backlog</h2>
              <span className="text-meta tabular-nums text-ink-3" data-backlog-totals="">
                {totalsLine(data.count, measure.backlog(data), undefined, measure.text)}
              </span>
            </header>
            {data.count === 0 ? (
              <p className="px-3 pb-4 pt-1 text-ui-sm text-ink-3">Everything is planned.</p>
            ) : (
              <>
                <Rows tasks={data.tasks} empty="" {...{ options, draggable, drag, open, isMobile, canPlan, setMoving, rowScale }} />
                {data.count > data.tasks.length && (
                  <p className="px-3 pb-3 text-meta text-ink-3">
                    The oldest {data.tasks.length} of {data.count} are shown. Find the rest in the list.
                  </p>
                )}
              </>
            )}
          </Container>
        </KeyboardList>
      </div>

      {/* The lifted row follows the pointer; its slot stays dashed. */}
      <DragOverlay className={DRAG_OVERLAY} dropAnimation={null}>
        {drag.activeId ? (() => {
          const t = [...data.tasks, ...data.cycles.flatMap((c) => c.tasks)].find((x) => x.task_uuid === drag.activeId)
          return t ? (
            <div data-drag-state="lifted" className="rounded-lg bg-raised shadow-e3">
              <BacklogRow task={t} options={options} scale={rowScale} onOpen={() => {}} />
            </div>
          ) : null
        })() : null}
      </DragOverlay>

      {completing && (
        <CompleteCycleDialog
          cycle={completing}
          next={nextOf(completing)}
          onClose={() => setCompleting(null)}
          onComplete={(carry) => {
            const c = completing
            setCompleting(null)
            void act(`complete ${c.id}`, "Couldn't complete the cycle", () => completeCycle(projectId, c.id, carry))
          }}
        />
      )}
      {feeding && <CycleFeedDialog projectId={projectId} onClose={() => setFeeding(false)} />}
      {estimating && <EstimatesDialog projectId={projectId} onClose={() => setEstimating(false)} onSaved={() => void read.mutate()} />}
      {scheduling && (
        <ScheduleDialog
          schedule={schedule}
          firstDay={nextStart(data.cycles)}
          onClose={() => setScheduling(false)}
          onSave={(next) => {
            setScheduling(false)
            void act("schedule", "Couldn't save the schedule", () => saveSchedule(projectId, next))
          }}
          onStop={() => {
            setScheduling(false)
            void act("schedule", "Couldn't stop the schedule", () => stopSchedule(projectId))
          }}
        />
      )}
      <MoveSheet
        task={moving}
        cycles={data.cycles}
        current={moving ? homeOf(moving.task_uuid) : BACKLOG}
        onOpenChange={(o) => !o && setMoving(null)}
        onOpenTask={(t) => open(t.task_uuid)}
        onMove={(t, to) => void move(t.task_uuid, to)}
      />
    </DndContext>
  )
}

/** A container: a cycle, or the backlog. A drop target is a dashed tint well (INTERACTION_SPEC §5.2). */
function Container({ id, drop, disabled, plain, children }: { id: string; drop?: "valid" | "invalid"; disabled: boolean; plain?: boolean; children: React.ReactNode }) {
  const { setNodeRef } = useDroppable({ id, disabled })
  return (
    <section
      ref={setNodeRef}
      data-container={id}
      data-drop={drop}
      aria-label={id === BACKLOG ? "Backlog" : undefined}
      className={cn("min-w-0 rounded-xl pb-1 transition-colors", plain ? "bg-sunken/60" : "bg-raised shadow-e1")}
    >
      {children}
    </section>
  )
}

function CycleHeader({
  cycle: c,
  measure: m,
  capacity,
  projectCapacity,
  primary,
  canEdit,
  underWay,
  onStart,
  onComplete,
  onCapacity,
}: {
  cycle: PlanCycle
  /** How its work is counted: hours, or points. */
  measure: Measure
  /** What it's planned against: its own, or the project's (capacityOf). */
  capacity?: number
  /** The project's: what its recent cycles finished. */
  projectCapacity?: number
  primary: boolean
  canEdit: boolean
  underWay: string | null
  onStart: () => void
  onComplete: () => void
  onCapacity: (amount: number | null) => void
}) {
  const name = cycleLabel(c)
  const work = m.cycle(c)
  const load = loadOf(work, capacity)
  const running = c.state === "current" || c.state === "ended"
  const totals = totalsLine(c.tasks.length, work, capacity, m.text)
  return (
    <header className="flex min-h-12 flex-wrap items-center gap-x-3 gap-y-1 px-3 pt-2" data-cycle-header="">
      <ProgressRing value={percentDone(c.progress)} size={16} weight={2} label={`${name}, ${c.progress.done} of ${c.progress.total} done`} />
      <h2 className="text-ui font-[590] text-foreground">{name}</h2>
      <span className="text-meta text-ink-3">{cycleDates(c)}</span>
      {canEdit ? (
        <CapacityPopover name={name} measure={m} own={m.own(c)} project={projectCapacity} onSave={onCapacity}>
          <button
            type="button"
            data-cycle-totals=""
            aria-label={`${totals}. Set ${name}'s capacity`}
            className="-mx-1 rounded-sm px-1 text-meta tabular-nums text-ink-2 underline decoration-line decoration-dotted underline-offset-4 transition-colors hover:bg-hover hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            {totals}
          </button>
        </CapacityPopover>
      ) : (
        <span className="text-meta tabular-nums text-ink-2" data-cycle-totals="">
          {totals}
        </span>
      )}
      {load && capacity ? (
        <span className="relative h-1 w-16 overflow-hidden rounded-sm bg-press" role="img" aria-label={`${name} is ${LOAD_WORDS[load]}`} data-load={load}>
          <span className={cn("absolute inset-y-0 left-0 rounded-sm", LOAD_TONE[load])} style={{ width: `${Math.min(100, (work / capacity) * 100)}%` }} />
        </span>
      ) : null}
      <span className="flex-1" />
      {canEdit &&
        (running ? (
          <Button size="sm" variant={primary ? "default" : "secondary"} {...busyWith(underWay, `complete ${c.id}`)} onClick={onComplete}>
            Complete cycle
          </Button>
        ) : (
          <Button size="sm" variant={primary ? "default" : "secondary"} {...busyWith(underWay, `start ${c.id}`)} onClick={onStart}>
            Start cycle
          </Button>
        ))}
    </header>
  )
}

/**
 * What a cycle is planned against, set by hand (B3b): hours, or points in a
 * project that estimates in them, or the project's again. A popover at its
 * totals; on a phone, a sheet (app/overlay.css).
 */
function CapacityPopover({
  name,
  measure: m,
  own,
  project,
  onSave,
  children,
}: {
  name: string
  measure: Measure
  /** The capacity set for this cycle, if one is. */
  own?: number
  project?: number
  onSave: (amount: number | null) => void
  children: React.ReactElement
}) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState("")
  const [wrong, setWrong] = useState(false)
  // On a phone the actions span the sheet's foot, as every sheet's do.
  const sheet = useSheetMode()
  const save = (e: React.FormEvent) => {
    e.preventDefault()
    const amount = m.points ? capacityPoints(text) : capacityMinutes(text)
    if (amount === null) {
      setWrong(true)
      return
    }
    setOpen(false)
    if (amount !== own) onSave(amount)
  }
  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (!o) return
        setText(own ? String(m.points ? own : Math.round((own / 60) * 100) / 100) : "")
        setWrong(false)
      }}
    >
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-3" data-capacity="">
        <form onSubmit={save} className="flex flex-col">
          <OverlayBody>
            <Field
              label={`Capacity for ${name}`}
              help={`${m.points ? "How many points" : "How many hours"} the team can do in it.${project ? ` Its project's is ${m.text(project)}, from its recent cycles.` : ""}`}
              error={wrong ? (m.points ? "Write it in points, a whole number like 20." : "Write it in hours, like 40, 37.5 or 2h 30m.") : undefined}
            >
              <Input
                autoFocus
                inputMode={m.points ? "numeric" : "decimal"}
                autoComplete="off"
                value={text}
                placeholder={project ? m.text(project) : m.points ? "20 points" : "40 h"}
                onChange={(e) => {
                  setText(e.target.value)
                  setWrong(false)
                }}
              />
            </Field>
          </OverlayBody>
          <OverlayFooter className={cn("pt-3", sheet ? SHEET_FOOTER_ROW : "flex flex-wrap items-center justify-end gap-2")}>
            {own !== undefined && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setOpen(false)
                  onSave(null)
                }}
              >
                {project ? `Use the project's (${m.text(project)})` : "Clear"}
              </Button>
            )}
            <Button type="submit" size="sm">
              Save
            </Button>
          </OverlayFooter>
        </form>
      </PopoverContent>
    </Popover>
  )
}

function Rows({
  tasks,
  empty,
  options,
  draggable,
  drag,
  open,
  isMobile,
  canPlan,
  setMoving,
  rowScale,
}: {
  tasks: BacklogTask[]
  empty: string
  options: ReturnType<typeof useProjectStatuses>["options"]
  draggable: boolean
  drag: ReturnType<typeof useDragState>
  open: (id: string) => void
  isMobile: boolean
  canPlan: boolean
  setMoving: (t: BacklogTask) => void
  /** The project's scale, when its rows show points. */
  rowScale?: EstimateScale | null
}) {
  if (tasks.length === 0) return empty ? <p className="mx-3 mb-2 rounded-lg border border-dashed border-line px-3 py-3 text-ui-sm text-ink-3">{empty}</p> : null
  return (
    <ul className="grid min-w-0 grid-cols-[minmax(0,1fr)] px-1">
      {tasks.map((t) => (
        <DraggableRow
          key={t.task_uuid}
          task={t}
          disabled={!draggable}
          state={drag.dragState(t.task_uuid)}
          selectable={!isMobile}
          options={options}
          scale={rowScale}
          onOpen={() => open(t.task_uuid)}
          onMove={isMobile && canPlan ? () => setMoving(t) : undefined}
        />
      ))}
    </ul>
  )
}

/** A task's row on the tab: dragged by itself (not by its box or its buttons), picked as a list's row is. */
function DraggableRow({
  task,
  disabled,
  state,
  selectable,
  ...row
}: {
  task: BacklogTask
  disabled: boolean
  state?: "placeholder"
  /** On a computer: a box to pick it, as the keys do (KeyboardList). */
  selectable: boolean
  options: ReturnType<typeof useProjectStatuses>["options"]
  scale?: EstimateScale | null
  onOpen: () => void
  onMove?: () => void
}) {
  const { setNodeRef, setActivatorNodeRef, attributes, listeners, isDragging } = useDraggable({ id: task.task_uuid, disabled })
  const { highlighted, selected } = useRowState(task.task_uuid)
  // Space lifts the row itself: on its box, Space picks it.
  const ref = useCallback(
    (el: HTMLLIElement | null) => {
      setNodeRef(el)
      setActivatorNodeRef(el)
    },
    [setNodeRef, setActivatorNodeRef],
  )
  return (
    <li
      ref={ref}
      {...(disabled ? { tabIndex: -1 } : attributes)}
      {...(disabled ? {} : listeners)}
      aria-roledescription={disabled ? undefined : "draggable task"}
      data-drag-state={state ?? (isDragging ? "lifted" : undefined)}
      data-task-id={task.task_uuid}
      data-state={selected ? "selected" : undefined}
      data-highlighted={highlighted || undefined}
      className={cn("group/row rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring", !disabled && "cursor-grab", selected && "bg-sel")}
    >
      <BacklogRow task={task} {...row} lead={selectable ? <TaskRowCheck id={task.task_uuid} selected={selected} /> : undefined} />
    </li>
  )
}

