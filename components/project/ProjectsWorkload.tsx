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
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { useMedia } from "@/context/MediaQueryContext"
import { useStoredState } from "@/hooks/useStoredState"
import { useWorkload } from "@/hooks/useWorkload"
import { AlertTriangle, ArrowRight, UserPlus, Users } from "@/lib/icons"
import type { ProjectOverview } from "@/lib/projectsOverview"
import { formatDuration } from "@/lib/tasks/time"
import { statusOptions } from "@/lib/taskStatus"
import { dotColor, spanLabel, spanOf } from "@/lib/timeline"
import { cn } from "@/lib/utils/helpers/cn"
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

const STATUSES = statusOptions(null)
const isMeasure = (v: unknown): v is Measure => v === "tasks" || v === "hours"

/**
 * A week's cell, by how full the week is: room and full are two neutral steps
 * (full the stronger ink), and only over uses a colour, the danger token. Full
 * was the accent, which is for the one selection and primary action on a page,
 * not for a week that is merely busy.
 */
const TONE: Record<Load, string> = {
  free: "",
  room: "bg-muted text-foreground hover:bg-muted/70",
  full: "bg-foreground/10 font-medium text-foreground hover:bg-foreground/15",
  over: "bg-destructive/15 font-semibold text-danger-ink hover:bg-destructive/25",
}
const METER: Record<Load, string> = {
  free: "",
  room: "bg-muted-foreground/40",
  full: "bg-foreground/70",
  over: "bg-destructive",
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
export function ProjectsWorkload({ projects, compact = false }: { projects: ProjectOverview[]; compact?: boolean }) {
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

  if (isError && !data) return <ErrorState subject="the workload" onRetry={() => void mutate()} />
  if (!grid) {
    return (
      <div className="grid gap-2 py-2" aria-busy={isLoading}>
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-10" />
        ))}
      </div>
    )
  }

  const unassignedHasWork = grid.unassigned.overdue.length + grid.unassigned.undated + grid.unassigned.weeks.reduce((n, w) => n + w.length, 0) > 0
  const rows = unassignedHasWork ? [...grid.people, grid.unassigned] : grid.people
  const over = grid.people.filter((r) => loadOf(r.loads[0], r.capacities[0]) === "over").length
  const unestimated = measure === "hours" ? rows.reduce((n, r) => n + r.unestimated, 0) : 0
  const anything = rows.some((r) => r.overdue.length > 0 || r.weeks.some((w) => w.length > 0))
  // The weeks with tasks, by id; the first takes Tab until arrows move it,
  // and again when the one that had it empties.
  const filled = rows.flatMap((row) => [row.overdue, ...row.weeks].flatMap((tasks, c) => (tasks.length ? [`${row.key}:${c}`] : [])))
  const tabStop = active && filled.includes(active) ? active : (filled[0] ?? null)

  if (rows.length === 0) {
    return <p className="py-10 text-center text-sm text-muted-foreground">No one is in these projects yet.</p>
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-xs text-muted-foreground">
        <p>
          {over > 0 ? (
            <span className="font-medium text-danger-ink">
              {over} {over === 1 ? "person has" : "people have"} more than they take on this week.
            </span>
          ) : (
            "Everyone has room this week."
          )}{" "}
          {measure === "hours"
            ? "A task's estimate is spread over the working days it runs."
            : "A task counts in each week it runs, from its start to its due date."}
          {data?.truncated && " Only the latest-due 5,000 tasks are counted."}
          {unestimated > 0 &&
            ` ${unestimated} ${unestimated === 1 ? "task has" : "tasks have"} no estimate yet, so ${unestimated === 1 ? "it isn't" : "they aren't"} counted.`}
        </p>
        <ToggleGroup
          type="single"
          size="sm"
          value={measure}
          onValueChange={(v) => isMeasure(v) && setMeasure(v)}
          aria-label="Count"
          className="rounded-md border p-0.5"
        >
          <ToggleGroupItem value="tasks" className="h-7 px-2.5 text-xs">
            Tasks
          </ToggleGroupItem>
          <ToggleGroupItem value="hours" className="h-7 px-2.5 text-xs">
            Hours
          </ToggleGroupItem>
        </ToggleGroup>
        <div className="flex items-center gap-3" aria-hidden>
          {(["room", "full", "over"] as const).map((l) => (
            <span key={l} className="flex items-center gap-1.5">
              <span className={cn("h-2.5 w-2.5 rounded-sm", METER[l])} />
              {l === "room" ? "Room" : l === "full" ? "Full" : "Over"}
            </span>
          ))}
        </div>
      </div>
      {!anything && (
        <p className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
          Nothing here has dates in the next {weeks.length} weeks. Give a task a start or due date and it shows in the weeks it runs.
        </p>
      )}
      <div className="relative min-h-[16rem] flex-1 overflow-hidden rounded-lg border bg-background">
        <div role="region" aria-label="Workload by person and week" className="h-full overflow-auto overscroll-x-contain">
          <table ref={tableRef} onKeyDown={onKeyDown} className="border-separate border-spacing-0 text-sm">
            <thead>
              <tr>
                <th
                  scope="col"
                  className="sticky left-0 top-0 z-30 border-b border-r bg-background px-3 py-2 text-left text-xs font-medium text-muted-foreground"
                  style={{ width: nameWidth, minWidth: nameWidth }}
                >
                  Person
                </th>
                <th scope="col" className="sticky top-0 z-20 min-w-[4.5rem] border-b bg-background px-1 py-2 text-xs font-medium text-muted-foreground">
                  Overdue
                </th>
                {weeks.map((w, i) => (
                  <th
                    key={w.getTime()}
                    scope="col"
                    className={cn(
                      "sticky top-0 z-20 min-w-[4.5rem] whitespace-nowrap border-b bg-background px-1 py-2 text-xs font-medium",
                      i === 0 ? "text-foreground" : "text-muted-foreground",
                    )}
                  >
                    {weekLabel(w, i, today)}
                  </th>
                ))}
                <th
                  scope="col"
                  className="sticky top-0 z-20 min-w-[4.5rem] whitespace-nowrap border-b bg-background px-2 py-2 text-xs font-medium text-muted-foreground"
                  title="Open tasks with no dates, which no week can show"
                >
                  No dates
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, r) => (
                <tr key={row.key} data-row={r} className="group">
                  <th
                    scope="row"
                    className="sticky left-0 z-10 border-b border-r bg-background px-3 py-1.5 text-left font-normal group-hover:bg-muted/40"
                    style={{
                      width: nameWidth,
                      minWidth: nameWidth,
                      maxWidth: nameWidth,
                    }}
                  >
                    <RowName
                      row={row}
                      compact={compact}
                      measure={measure}
                      defaults={{ tasks: data?.default_capacity ?? 5, hours: data?.default_hours ?? 40 }}
                      onSave={(m, n) => row.person && void setCapacity(row.person, m, n)}
                    />
                  </th>
                  <td className="border-b px-1 py-1 text-center">
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
                    />
                  </td>
                  {row.weeks.map((tasks, i) => (
                    <td key={i} className={cn("border-b px-1 py-1 text-center", i === 0 && "bg-muted/40")}>
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
                      />
                    </td>
                  ))}
                  <td className="border-b px-2 py-1 text-center text-xs tabular-nums text-muted-foreground">
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
  compact,
  measure,
  defaults,
  onSave,
}: {
  row: WorkloadRow
  compact: boolean
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
    <span className={cn("flex min-w-0 gap-x-2", compact ? "flex-col items-start" : "items-center justify-between")}>
      <span className="min-w-0 max-w-full" title={p.user_job_title ? `${displayNameOf(p)}, ${p.user_job_title}` : displayNameOf(p)}>
        <TaskAssigneeCell
          userInfo={{
            user_uuid: p.user_uuid,
            user_name: displayNameOf(p),
            user_profile_object_key: p.user_profile_object_key ?? "",
          }}
        />
      </span>
      <span className={cn(compact && "pl-8")}>
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
  const label = hours ? `${current}h/wk` : `${current}/wk`
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
      className={TONE[load]}
      meter={capacity === null ? null : { load, share: Math.min(1, value / Math.max(1, capacity)) }}
    >
      {load === "over" && <AlertTriangle aria-hidden className="h-3 w-3" />}
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
      className="bg-destructive/10 font-medium text-danger-ink hover:bg-destructive/20"
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
  className,
  meter,
  cell,
  id,
  tabStop,
  measure,
  people,
  today,
  actions,
  onFocus,
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
  className: string
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
          className={cn(
            "relative mx-auto flex h-8 w-14 items-center justify-center gap-0.5 rounded-md text-xs tabular-nums outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
            className,
          )}
        >
          {children}
          {meter && (
            <span aria-hidden className="absolute inset-x-2 bottom-1 h-0.5 overflow-hidden rounded-full">
              <span className={cn("block h-full rounded-full", METER[meter.load])} style={{ width: `${meter.share * 100}%` }} />
            </span>
          )}
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
        <p className="truncate text-xs text-muted-foreground">
          {t.project_name}
          {t.parent_name && ` · in ${t.parent_name}`}
          {span && ` · ${spanLabel(span, today)}`}
          {!!t.task_estimate_minutes && ` · ${formatDuration(t.task_estimate_minutes * 60)}`}
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
