"use client"

import { displayNameOf } from "@/lib/personName"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useId, useMemo, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react"
import { useDispatch } from "react-redux"
import { TaskAssigneeCell } from "@/components/task/taskAssigneeCell"
import { Button } from "@/components/ui/button"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { ErrorState } from "@/components/ui/error-state"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Skeleton } from "@/components/ui/skeleton"
import { useMedia } from "@/context/MediaQueryContext"
import { useStoredState } from "@/hooks/useStoredState"
import { useWorkload } from "@/hooks/useWorkload"
import { ArrowRight, Info, UserPlus, Users } from "@/lib/icons"
import { useGrow, type Grow } from "@/hooks/useGrow"
import { WorkSegmented } from "@/components/task/WorkTabs"
import type { ProjectOverview } from "@/lib/projectsOverview"
import { formatDuration } from "@/lib/tasks/time"
import { statusOptions } from "@/lib/taskStatus"
import { dotColor, spanLabel, spanOf } from "@/lib/timeline"
import { cn } from "@/lib/utils/helpers/cn"
import { WorkState, workToolbar } from "@/components/task/workFrame"
import { EmptyState } from "@/components/ui/empty-state"
import { SpotWelcome } from "@/components/ui/graphics/spots"
import {
  UNASSIGNED,
  cellLabel,
  formatLoad,
  loadOf,
  loadText,
  weekLabel,
  weeksToNextWeek,
  workloadRows,
  workloadWeeks,
  type Load,
  type Measure,
  type WorkloadPerson,
  type WorkloadRow,
  type WorkloadTask,
} from "@/lib/workload"
import { openRightPanel } from "@/store/slice/desktopRightPanelSlice"
import { app_task_path } from "@/types/paths"
import { ProjectTile } from "@/components/ui/graphics/ProjectTile"

const STATUSES = statusOptions(null)
const isMeasure = (v: unknown): v is Measure => v === "tasks" || v === "hours"

/**
 * A week's capacity column (design v3, work.md W41): a 32 x 36 r6 column on
 * --press (what they take on) fills from the bottom with the load. Room and
 * full are two neutral steps of ink-2 (35 % and 70 %); only over uses colour,
 * danger at 85 %, with a 4 px danger cap above the column for the excess.
 * Full was the accent once, which is for the one primary action on a page.
 */
export const FILL: Record<Load, string> = {
  free: "transparent",
  room: "color-mix(in oklab, var(--ink-2) 35%, transparent)",
  full: "color-mix(in oklab, var(--ink-2) 70%, transparent)",
  over: "color-mix(in oklab, var(--destructive) 85%, transparent)",
}

/** Counting hours, a week whose tasks have no estimates: how many tasks, smaller, in the cell's own colour. */
const Unestimated = ({ tasks }: { tasks: number }) => (
  <span className="text-2xs font-normal" title={`${tasks} ${tasks === 1 ? "task" : "tasks"}, none estimated yet`}>
    {loadText(0, "hours", tasks)}
  </span>
)

/** A cell with nothing in it: blank to the eye, said to a screen reader. */
const Empty = ({ title }: { title?: string }) => (
  <span title={title}>
    <span className="sr-only">None</span>
  </span>
)

type Actions = {
  openTask: (taskUUID: string) => void
  moveLater: (t: WorkloadTask, weeks?: number) => void
  giveTo: (t: WorkloadTask, person: WorkloadPerson | null) => void
}

/**
 * Who has how much to do each week, across the projects shown: a row a
 * person, a column a week from this one, each week's tasks against how many
 * they take on. Busiest first. A week opens on its tasks, to move one a week
 * later or give it to someone with room. Asana keeps this for its Advanced
 * plan, monday for Pro.
 */
export function ProjectsWorkload({ projects, compact = false, tools }: { projects: ProjectOverview[]; compact?: boolean; tools?: ReactNode }) {
  const { data, isLoading, isError, mutate, moveLater, giveTo, setCapacity } = useWorkload()
  const { isDesktop } = useMedia()
  const router = useRouter()
  const dispatch = useDispatch()
  const [today, setToday] = useState(() => new Date())
  // A page left open overnight moves on to the new day when it's looked at
  // again: "This week" and Overdue follow the calendar.
  useEffect(() => {
    const check = () => {
      if (document.visibilityState !== "visible") return
      const now = new Date()
      if (now.toDateString() !== today.toDateString()) {
        setToday(now)
        void mutate()
      }
    }
    document.addEventListener("visibilitychange", check)
    window.addEventListener("focus", check)
    return () => {
      document.removeEventListener("visibilitychange", check)
      window.removeEventListener("focus", check)
    }
  }, [today, mutate])
  const weeks = useMemo(() => workloadWeeks(today), [today])
  const shown = useMemo(() => new Set(projects.map((p) => p.project_uuid)), [projects])
  const [measure, setMeasure] = useStoredState<Measure>("oc_workload_measure", "tasks", isMeasure)
  const grid = useMemo(() => (data ? workloadRows(data, weeks, shown, measure) : null), [data, weeks, shown, measure])
  // The columns grow from the bottom on first reveal (12 ms apart, 240 ms at most).
  const grow = useGrow("overview:workload", !!grid, 12)
  const nameWidth = compact ? 148 : 232
  const tableRef = useRef<HTMLTableElement>(null)
  // The week that takes Tab, by person and column ("<row key>:<column>"), so a
  // re-sort after a change can't hand it to someone else's week.
  const [active, setActive] = useState<string | null>(null)
  // After a move or a hand-off empties a week, focus goes back to the grid.
  const restoreTo = useRef<string | null>(null)

  const openTask = useCallback(
    (id: string) => (isDesktop ? dispatch(openRightPanel({ taskUUID: id })) : router.push(`${app_task_path}/${id}`)),
    [isDesktop, dispatch, router],
  )
  const actions: Actions = {
    openTask,
    moveLater: (t, n) => {
      restoreTo.current = t.assignee_uuid || UNASSIGNED
      void moveLater(t, n)
    },
    giveTo: (t, p) => {
      restoreTo.current = t.assignee_uuid || UNASSIGNED
      void giveTo(t, p)
    },
  }
  // A week whose last task moved away takes its popover with it, and focus
  // would fall to the page: give it to that person's next week with tasks,
  // or to the grid's own stop.
  useEffect(() => {
    const row = restoreTo.current
    const table = tableRef.current
    if (!row || !table) return
    restoreTo.current = null
    // The week still has tasks: focus is still in its popover.
    if (document.activeElement && document.activeElement !== document.body) return
    const next = table.querySelector<HTMLElement>(`[data-id^="${CSS.escape(row)}:"]`) ?? table.querySelector<HTMLElement>("[data-id][tabindex='0']")
    next?.focus()
  })

  // Arrows move between the weeks that have tasks; Tab leaves the grid.
  const onKeyDown = (e: KeyboardEvent<HTMLTableElement>) => {
    const at = (e.target as HTMLElement).dataset.cell?.split(":").map(Number)
    const step = {
      ArrowRight: [0, 1],
      ArrowLeft: [0, -1],
      ArrowDown: [1, 0],
      ArrowUp: [-1, 0],
    }[e.key]
    if (!at || !step || !tableRef.current) return
    e.preventDefault()
    for (let r = at[0] + step[0], c = at[1] + step[1]; r >= 0 && c >= 0 && r < 1000 && c < weeks.length + 1; r += step[0], c += step[1]) {
      const next = tableRef.current.querySelector<HTMLElement>(`[data-cell="${r}:${c}"]`)
      if (next) {
        next.focus()
        return
      }
      if (!tableRef.current.querySelector(`[data-row="${r}"]`)) return
    }
  }

  // The overview's frame (components/task/workFrame): the tools band stays
  // through loading and failing, flush under the tabs as on Projects, and the
  // state sits where every view's does, in from the sheet's edge.
  const frame = cn("flex min-h-0 flex-1 flex-col gap-4", !compact && "[&>*:not([data-work-toolbar])]:mx-6")
  const toolsRow = (extra?: ReactNode) => (
    <div data-work-toolbar="" className={cn(workToolbar, compact && "-mx-4")}>
      {tools}
      {extra}
    </div>
  )
  if (isError && !data)
    return (
      <div className={frame}>
        {toolsRow()}
        <WorkState>
          <ErrorState subject="the workload" onRetry={() => void mutate()} />
        </WorkState>
      </div>
    )
  if (!grid) {
    return (
      <div className={frame}>
        {toolsRow()}
        <div className="grid gap-2" aria-busy={isLoading}>
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-10" />
          ))}
        </div>
      </div>
    )
  }

  const unassignedHasWork = grid.unassigned.overdue.length + grid.unassigned.undated + grid.unassigned.weeks.reduce((n, w) => n + w.length, 0) > 0
  const rows = unassignedHasWork ? [...grid.people, grid.unassigned] : grid.people
  const unestimated = measure === "hours" ? rows.reduce((n, r) => n + r.unestimated, 0) : 0
  const anything = rows.some((r) => r.overdue.length > 0 || r.weeks.some((w) => w.length > 0))
  // The weeks with tasks, by id; the first takes Tab until arrows move it,
  // and again when the one that had it empties.
  const filled = rows.flatMap((row) => [row.overdue, ...row.weeks].flatMap((tasks, c) => (tasks.length ? [`${row.key}:${c}`] : [])))
  const tabStop = active && filled.includes(active) ? active : (filled[0] ?? null)

  const explainer = [
    measure === "hours" ? "A task's estimate is spread over the working days it runs." : "A task counts in each week it runs, from its start to its due date.",
    data?.truncated ? "Only the latest-due 5,000 tasks are counted." : "",
    unestimated > 0 ? `${unestimated} ${unestimated === 1 ? "task has" : "tasks have"} no estimate yet, so ${unestimated === 1 ? "it isn't" : "they aren't"} counted.` : "",
  ]
    .filter(Boolean)
    .join(" ")
  // The first person over capacity this week or next, by name, and how many more are.
  const overs = grid.people.flatMap((r) => [0, 1].flatMap((w) => (loadOf(r.loads[w] ?? 0, r.capacities[w] ?? null) === "over" ? [{ r, w }] : [])).slice(0, 1))
  const overLine = overs.length
    ? {
        key: overs[0].r.key,
        name: displayNameOf(overs[0].r.person) || "Someone",
        when: overs[0].w === 0 ? "this week" : "next week",
        value: formatLoad(overs[0].r.loads[overs[0].w] ?? 0, measure),
        capacity: formatLoad(overs[0].r.capacities[overs[0].w] ?? 0, measure),
        more: overs.length - 1,
      }
    : null

  if (rows.length === 0) {
    return (
      <div className={frame}>
        {toolsRow()}
        <WorkState>
          <EmptyState illustration={<SpotWelcome hue="sky" />} title="No one is in these projects yet" description="Add people to a project and their weeks show here." />
        </WorkState>
      </div>
    )
  }

  return (
    <div className={frame}>
      {/* One row, where Table's and Timeline's are: the overview's tools, what
          the weeks say, the count and the key. */}
      {toolsRow(
        <>
          <WorkSegmented
            label="Count"
            value={measure}
            onChange={setMeasure}
            options={[
              { value: "tasks", label: "Tasks" },
              { value: "hours", label: "Hours" },
            ]}
          />
          <div className="flex items-center gap-3 text-xs text-ink-2" aria-hidden>
            {(["room", "full", "over"] as const).map((l) => (
              <span key={l} className="flex items-center gap-1.5">
                <span className="size-2 rounded-[2px]" style={{ background: FILL[l] }} />
                {l === "room" ? "Room" : l === "full" ? "Full" : "Over"}
              </span>
            ))}
          </div>
          <span
            role="img"
            tabIndex={0}
            data-tip={explainer}
            aria-label={explainer}
            className="work-tip inline-flex size-7 items-center justify-center rounded-md text-ink-3 outline-none hover:bg-hover hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring [&::after]:w-[280px] [&::after]:whitespace-normal [&::after]:text-left"
          >
            <Info className="size-3.5" />
          </span>
        </>,
      )}
      {/* What the weeks say, in words, above the grid (W41). */}
      <p data-workload-summary={overLine ? "over" : "room"} className="flex items-center gap-2 text-xs text-ink-2">
        <span aria-hidden="true" className={cn("size-2 shrink-0 rounded-full", overLine ? "bg-camp-sun" : "bg-camp-moss")} />
        {overLine ? (
          <span>
            {overLine.name} {overLine.more > 0 ? `and ${overLine.more} more are` : "is"} over capacity {overLine.when} ({overLine.value} of {overLine.capacity}).{" "}
            <button
              type="button"
              className="font-[510] text-brand-text hover:underline"
              onClick={() => document.querySelector(`[data-row-key="${CSS.escape(overLine.key)}"]`)?.scrollIntoView({ block: "center", behavior: "smooth" })}
            >
              Show
            </button>
          </span>
        ) : (
          <span>Everyone has room this week.</span>
        )}
      </p>
      {!anything && (
        <p className="rounded-md bg-sunken px-3 py-2 text-xs text-ink-2">
          Nothing here has dates in the next {weeks.length} weeks. Give a task a start or due date and it shows in the weeks it runs.
        </p>
      )}
      <div className="relative min-h-[16rem] flex-1 overflow-hidden">
        <div role="region" aria-label="Workload by person and week" className="h-full overflow-auto overscroll-x-contain">
          <table ref={tableRef} onKeyDown={onKeyDown} className="border-separate border-spacing-0 text-sm">
            <thead>
              <tr>
                <th
                  scope="col"
                  className="sticky left-0 top-0 z-30 h-8 border-b border-line bg-sheet px-3 text-left text-xs font-[510] text-ink-3"
                  style={{ width: nameWidth, minWidth: nameWidth }}
                >
                  Person
                </th>
                <th scope="col" className="sticky top-0 z-20 h-8 w-14 min-w-14 border-b border-line bg-sheet px-1 text-xs font-[510] text-ink-3">
                  Overdue
                </th>
                {weeks.map((w, i) => (
                  <th
                    key={w.getTime()}
                    scope="col"
                    data-this-week={i === 0 || undefined}
                    className={cn("sticky top-0 z-20 h-8 w-[72px] min-w-[72px] whitespace-nowrap border-b border-line bg-sheet px-1 text-xs font-[510]", i === 0 ? "text-foreground" : "text-ink-3")}
                  >
                    {/* This week: ink, over a 2 px ink underline. */}
                    <span className={cn("relative inline-flex h-8 items-center", i === 0 && "after:absolute after:inset-x-0 after:bottom-[-1px] after:h-0.5 after:rounded-[2px] after:bg-foreground")}>
                      {weekLabel(w, i, today)}
                    </span>
                  </th>
                ))}
                <th
                  scope="col"
                  className="sticky top-0 z-20 h-8 min-w-[4.5rem] whitespace-nowrap border-b border-line bg-sheet px-2 text-xs font-[510] text-ink-3"
                  title="Open tasks with no dates, which no week can show"
                >
                  No dates
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, r) => (
                <tr key={row.key} data-row={r} data-row-key={row.key} className="group">
                  <th
                    scope="row"
                    className="sticky left-0 z-10 h-[52px] border-b border-line bg-sheet px-3 py-1.5 text-left font-normal"
                    style={{
                      width: nameWidth,
                      minWidth: nameWidth,
                      maxWidth: nameWidth,
                    }}
                  >
                    <RowName
                      row={row}
                      measure={measure}
                      defaults={{ tasks: data?.default_capacity ?? 5, hours: data?.default_hours ?? 40 }}
                      onSave={(m, n) => row.person && void setCapacity(row.person, m, n)}
                    />
                  </th>
                  <td className="border-b border-line px-1 py-1 text-center">
                    <OverdueCell
                      row={row}
                      cell={`${r}:0`}
                      id={`${row.key}:0`}
                      tabStop={tabStop}
                      measure={measure}
                      people={grid.people}
                      weeks={weeks}
                      today={today}
                      actions={actions}
                      onFocus={setActive}
                      grow={grow}
                      growIndex={0}
                    />
                  </td>
                  {row.weeks.map((tasks, i) => (
                    <td key={i} className="border-b border-line px-1 py-1 text-center">
                      <WeekCell
                        row={row}
                        tasks={tasks}
                        week={i}
                        when={i < 2 ? weekLabel(weeks[i], i, today).toLowerCase() : `the week of ${weekLabel(weeks[i], i, today)}`}
                        cell={`${r}:${i + 1}`}
                        id={`${row.key}:${i + 1}`}
                        tabStop={tabStop}
                        measure={measure}
                        people={grid.people}
                        today={today}
                        actions={actions}
                        onFocus={setActive}
                        grow={grow}
                        growIndex={r * weeks.length + i}
                      />
                    </td>
                  ))}
                  <td className="border-b border-line px-2 py-1 text-center text-xs tabular-nums text-ink-3">
                    {row.undated > 0 ? row.undated : <Empty />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function RowName({
  row,
  measure,
  defaults,
  onSave,
}: {
  row: WorkloadRow
  measure: Measure
  defaults: { tasks: number; hours: number }
  onSave: (measure: Measure, value: number | null) => void
}) {
  const p = row.person
  if (!p) {
    return (
      <span className="flex items-center gap-2 text-sm text-muted-foreground">
        <Users className="h-4 w-4 shrink-0" />
        Nobody
      </span>
    )
  }
  // On a phone the capacity goes under the name, which needs the width.
  return (
    <span className="flex min-w-0 flex-col items-start gap-0.5">
      <span className="min-w-0 max-w-full" title={p.user_job_title ? `${displayNameOf(p)}, ${p.user_job_title}` : displayNameOf(p)}>
        <TaskAssigneeCell
          userInfo={{
            user_uuid: p.user_uuid,
            user_name: displayNameOf(p),
            user_profile_object_key: p.user_profile_object_key ?? "",
          }}
        />
      </span>
      <span className="pl-8">
        <Capacity person={p} measure={measure} defaults={defaults} onSave={onSave} />
      </span>
    </span>
  )
}

/** What someone takes on a week, in the measure shown (tasks, or hours), changed by them or a workspace admin. */
function Capacity({
  person,
  measure,
  defaults,
  onSave,
}: {
  person: WorkloadPerson
  measure: Measure
  defaults: { tasks: number; hours: number }
  onSave: (measure: Measure, value: number | null) => void
}) {
  const hours = measure === "hours"
  const current = hours ? person.hours : person.capacity
  const isSet = hours ? person.hours_set : person.capacity_set
  const max = hours ? 168 : 100
  const unit = hours ? "hours" : "tasks"
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState(String(current))
  const id = useId()
  const label = hours ? `${current}h / wk` : `${current} / wk`
  const sentence = hours ? `${displayNameOf(person)} works ${current} hours a week` : `${displayNameOf(person)} takes on ${current} tasks a week`
  if (!person.can_edit_capacity) {
    return (
      <span className="shrink-0 text-xs tabular-nums text-muted-foreground" title={`${sentence}. They or a workspace admin can change it.`}>
        {label}
      </span>
    )
  }
  const n = Number(value)
  const valid = Number.isInteger(n) && n >= 1 && n <= max
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!valid) return
    setOpen(false)
    onSave(measure, n)
  }
  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (o) setValue(String(current))
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          className="shrink-0 rounded px-1 text-xs tabular-nums text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`${sentence}. Change it`}
        >
          {label}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64">
        <form onSubmit={submit} className="grid gap-2">
          <Label htmlFor={id}>{hours ? "Hours a week" : "Tasks a week"}</Label>
          <p className="text-xs text-muted-foreground">
            {hours
              ? `How many hours ${displayNameOf(person)} works in a week. Weeks with more estimated show as over.`
              : `How many tasks ${displayNameOf(person)} takes on in a week. Weeks with more show as over.`}
          </p>
          <div className="flex gap-2">
            <Input
              id={id}
              type="number"
              inputMode="numeric"
              min={1}
              max={max}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="h-8"
              aria-invalid={!valid}
              aria-label={`${unit} a week`}
            />
            <Button type="submit" size="sm" className="h-8" disabled={!valid}>
              Save
            </Button>
          </div>
          {isSet && (
            <button
              type="button"
              className="w-fit text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
              onClick={() => {
                setOpen(false)
                onSave(measure, null)
              }}
            >
              Use the default ({hours ? defaults.hours : defaults.tasks})
            </button>
          )}
        </form>
      </PopoverContent>
    </Popover>
  )
}

type CellProps = {
  row: WorkloadRow
  measure: Measure
  cell: string
  /** The week's id: its row's key and its column. */
  id: string
  tabStop: string | null
  people: WorkloadRow[]
  today: Date
  actions: Actions
  onFocus: (cell: string) => void
  grow: Grow
  growIndex: number
}

function WeekCell({ row, tasks, week, when, ...rest }: CellProps & { tasks: WorkloadTask[]; week: number; when: string }) {
  const { measure } = rest
  const capacity = row.capacities[week] ?? null
  const away = row.awayDays[week] ?? 0
  const value = row.loads[week] ?? 0
  const load = loadOf(value, capacity)
  const count = `${tasks.length} ${tasks.length === 1 ? "task" : "tasks"}`
  const amount = measure === "hours" ? `${formatLoad(value, measure)} estimated across ${count}` : count
  if (tasks.length === 0) {
    // A week off says so; otherwise there's nothing to show.
    return away >= 5 ? (
      <span className="text-2xs text-muted-foreground" title={`${displayNameOf(row.person) || "They"} are away all week`}>
        Away
      </span>
    ) : (
      <Empty title={away ? `Away ${away} ${away === 1 ? "day" : "days"}` : undefined} />
    )
  }
  return (
    <TasksPopover
      {...rest}
      row={row}
      tasks={tasks}
      week={week}
      title={when}
      label={cellLabel(row, week, when, measure)}
      summary={
        capacity === null ? (
          `${amount} nobody has`
        ) : (
          <>
            {amount}, against the {measure === "hours" ? `${capacity} hours they work` : `${capacity} they take on`}{" "}
            {away > 0 ? `this week, away ${away >= 5 ? "all week" : `${away} ${away === 1 ? "day" : "days"}`}` : "a week"}
            {load === "over" && (
              <span className="font-medium text-danger-ink">: {formatLoad(Math.round((value - capacity) * 10) / 10, measure)} too many</span>
            )}
          </>
        )
      }
      hint={load === "over" ? "Move one to a later week, or give it to someone with room." : undefined}
      kind="week"
      meter={capacity === null ? null : { load, share: Math.min(1, value / Math.max(1, capacity)) }}
    >
      {/* Tasks with no estimate aren't no work: their count, not "0h". */}
      {measure === "hours" && value === 0 ? <Unestimated tasks={tasks.length} /> : formatLoad(value, measure)}
      {away > 0 && (
        <span aria-hidden className="absolute right-0.5 top-0 text-2xs font-normal text-muted-foreground">
          {away >= 5 ? "off" : `−${away}d`}
        </span>
      )}
    </TasksPopover>
  )
}

function OverdueCell({ row, weeks, ...rest }: CellProps & { weeks: Date[] }) {
  const tasks = row.overdue
  if (tasks.length === 0) return <Empty />
  const who = row.person ? row.person.user_name : "Nobody"
  const count = `${tasks.length} ${tasks.length === 1 ? "task" : "tasks"}`
  const hours = rest.measure === "hours" ? ` (${formatLoad(row.overdueLoad, "hours")} estimated)` : ""
  return (
    <TasksPopover
      {...rest}
      row={row}
      tasks={tasks}
      week={0}
      weeks={weeks}
      title="overdue"
      label={`${who}: ${count} overdue${hours}`}
      summary={`${count} open, due before this week${hours}`}
      hint="Bring one to next week, or give it to someone with room."
      kind="overdue"
      meter={null}
    >
      {rest.measure === "hours" && row.overdueLoad === 0 ? <Unestimated tasks={tasks.length} /> : formatLoad(row.overdueLoad, rest.measure)}
    </TasksPopover>
  )
}

function TasksPopover({
  row,
  tasks,
  week,
  weeks,
  title,
  label,
  summary,
  hint,
  kind,
  meter,
  cell,
  id,
  tabStop,
  measure,
  people,
  today,
  actions,
  onFocus,
  grow,
  growIndex,
  children,
}: CellProps & {
  tasks: WorkloadTask[]
  week: number
  /** Set for overdue tasks, which move to next week rather than a week on. */
  weeks?: Date[]
  title: string
  label: string
  summary: ReactNode
  hint?: string
  kind: "week" | "overdue"
  meter: { load: Load; share: number } | null
  children: ReactNode
}) {
  const who = row.person ? row.person.user_name : "Nobody"
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-cell={cell}
          data-id={id}
          tabIndex={id === tabStop ? 0 : -1}
          onFocus={() => onFocus(id)}
          aria-label={label}
          data-load={meter?.load ?? kind}
          className={cn(
            "relative mx-auto flex flex-col items-center justify-center gap-1 rounded-md text-xs font-[510] tabular-nums outline-none transition-colors hover:bg-hover focus-visible:ring-2 focus-visible:ring-ring",
            kind === "overdue" ? "h-11 w-12 text-danger-ink" : "h-[52px] w-16 text-foreground",
          )}
        >
          {meter && (
            // The capacity column, filled from the bottom with the load.
            <span aria-hidden="true" data-capacity-column="" className="relative block h-9 w-8 rounded-[6px] bg-press">
              <span className="absolute inset-0 overflow-hidden rounded-[6px]">
                <span className="block h-full w-full" {...grow.bar(growIndex, "y")}>
                  <span
                    data-capacity-fill=""
                    className="block h-full w-full origin-bottom transition-transform duration-[320ms] ease-out"
                    style={{ transform: `scaleY(${meter.share})`, background: FILL[meter.load] }}
                  />
                </span>
              </span>
              {meter.load === "over" && <span data-over-cap="" className="absolute -top-1.5 left-0 right-0 h-1 rounded-[2px] bg-destructive" />}
            </span>
          )}
          <span className="relative leading-4">{children}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[22rem] max-w-[calc(100vw-2rem)] p-0">
        <div className="border-b px-3 py-2">
          <p className="text-sm font-medium">
            {who}, {title}
          </p>
          <p className="text-xs text-muted-foreground">{summary}</p>
        </div>
        <ul className="max-h-80 overflow-y-auto py-1">
          {tasks.map((t) => (
            <TaskLine key={t.task_uuid} t={t} week={week} weeks={weeks} people={people} measure={measure} today={today} actions={actions} />
          ))}
        </ul>
        {hint && <p className="border-t px-3 py-2 text-xs text-muted-foreground">{hint}</p>}
      </PopoverContent>
    </Popover>
  )
}

function TaskLine({
  t,
  week,
  weeks,
  people,
  measure,
  today,
  actions,
}: {
  t: WorkloadTask
  week: number
  weeks?: Date[]
  people: WorkloadRow[]
  measure: Measure
  today: Date
  actions: Actions
}) {
  const span = spanOf(t)
  const by = weeks ? weeksToNextWeek(t, weeks) : 1
  const move = weeks ? "Bring it to next week" : "A week later"
  return (
    <li className="flex items-start gap-2 px-3 py-1.5 hover:bg-muted/50">
      <span aria-hidden className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", dotColor(t, STATUSES))} />
      <div className="min-w-0 flex-1">
        <button
          type="button"
          onClick={() => actions.openTask(t.task_uuid)}
          className="block w-full truncate text-left text-sm outline-none hover:underline focus-visible:underline"
        >
          {t.task_name}
        </button>
        <p className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
          {/* The project in its own colour, as everywhere it shows. */}
          <ProjectTile id={t.project_uuid} size={14} />
          <span className="truncate">
            {t.project_name}
            {t.parent_name && ` · in ${t.parent_name}`}
            {span && ` · ${spanLabel(span, today)}`}
            {!!t.task_estimate_minutes && ` · ${formatDuration(t.task_estimate_minutes * 60)}`}
          </span>
        </p>
      </div>
      {t.can_edit && (
        <div className="flex shrink-0 items-center">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            title={move}
            aria-label={`${move}: ${t.task_name}`}
            onClick={() => actions.moveLater(t, by)}
          >
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
          <GiveTo t={t} week={week} people={people} measure={measure} onGive={actions.giveTo} />
        </div>
      )}
    </li>
  )
}

/** Give a task to someone else in its project, those with the most room that week first. */
function GiveTo({ t, week, people, measure, onGive }: { t: WorkloadTask; week: number; people: WorkloadRow[]; measure: Measure; onGive: Actions["giveTo"] }) {
  const [open, setOpen] = useState(false)
  const candidates = people
    .filter((r) => r.person && r.person.user_uuid !== t.assignee_uuid && r.person.project_uuids.includes(t.project_uuid))
    .map((r) => ({ r, n: r.loads[week] ?? 0 }))
    .sort(
      (a, b) =>
        a.n / Math.max(0.5, a.r.capacities[week] ?? 1) - b.n / Math.max(0.5, b.r.capacities[week] ?? 1) ||
        displayNameOf(a.r.person!).localeCompare(displayNameOf(b.r.person!)),
    )
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="ghost" size="icon" className="h-7 w-7" title="Give it to…" aria-label={`Give ${t.task_name} to someone else`}>
          <UserPlus className="h-3.5 w-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-0">
        <Command>
          <CommandInput placeholder="Give it to…" />
          <CommandList>
            <CommandEmpty>No one in its project by that name.</CommandEmpty>
            <CommandGroup>
              {candidates.map(({ r, n }) => {
                const cap = r.capacities[week] ?? null
                const load = loadOf(n, cap)
                return (
                  <CommandItem
                    key={r.key}
                    value={`${displayNameOf(r.person!)} ${r.key}`}
                    onSelect={() => {
                      setOpen(false)
                      onGive(t, r.person)
                    }}
                  >
                    <span className="truncate">{displayNameOf(r.person!)}</span>
                    <span
                      className={cn(
                        "ml-auto pl-2 text-xs tabular-nums",
                        load === "over" ? "text-danger-ink" : load === "full" ? "text-foreground" : "text-muted-foreground",
                      )}
                    >
                      {(r.awayDays[week] ?? 0) >= 5 ? "away" : `${formatLoad(n, measure)}/${measure === "hours" ? `${cap}h` : cap}`}
                    </span>
                  </CommandItem>
                )
              })}
              {t.assignee_uuid && (
                <CommandItem
                  value="nobody"
                  onSelect={() => {
                    setOpen(false)
                    onGive(t, null)
                  }}
                >
                  <span className="text-muted-foreground">Nobody</span>
                </CommandItem>
              )}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
