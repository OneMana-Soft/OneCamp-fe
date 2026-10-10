/**
 * A project's timeline: which days each task covers, where its bar sits, what
 * a drag does to its dates, and the rows it's drawn in. Pure, so all of it is
 * tested without a browser; components/project/timeline draws it.
 *
 * Days are the viewer's own. A task due at 17:00 on the 8th is on the 8th
 * where they are, as everywhere else in the app (projectGlance), and moving it
 * a day keeps its time of day, so a move never drifts it across midnight.
 */

import {
  addDays,
  addMonths,
  addYears,
  differenceInCalendarDays,
  format,
  isSameYear,
  startOfDay,
  startOfMonth,
  startOfWeek,
  startOfYear,
} from "date-fns"
import { NO_ASSIGNEE, groupByAssignee } from "@/lib/board/groupBy"
import { colorDot, isClosedStatus, statusOptionOf, type StatusCategory, type StatusOption, type TaskStatusFields } from "@/lib/taskStatus"
import { endsOf, wayKept, wayOf, type DependencyFacets } from "@/lib/tasks/dependency"

/** A task as GET /project/{id}/timeline sends it. */
export interface TimelineTask extends TaskStatusFields {
  task_uuid: string
  task_name: string
  task_status: string
  task_priority?: string
  task_start_date?: string
  task_due_date?: string
  task_created_at?: string
  task_assignee?: { user_uuid: string; user_name?: string; user_full_name?: string; user_profile_object_key?: string } | null
  task_sub_task_count?: number
  /** The tasks it waits on, and how: most often it can start once they are done. */
  task_blocked_by?: ({ task_uuid: string } & DependencyFacets)[]
  /** How many of those are still open. */
  task_blocked_open?: number
}

/** GET /project/{id}/timeline */
export interface TimelineData {
  tasks: TimelineTask[]
  /** How many tasks the project has; more than tasks.length when the timeline holds only the newest. */
  total: number
  /** Whether the reader may move tasks: the project's admins, as for every task edit. */
  can_edit: boolean
}

/** A task made a moment ago, which the server hasn't named yet (taskCreateForm). */
export const isPending = (t: Pick<TimelineTask, "task_uuid">) => t.task_uuid.startsWith("temp-")

// ---- Dates ------------------------------------------------------------------

/** A date the server sent, or null when it's unset: empty, the zero time, or unreadable. */
export function taskDate(s?: string | null): Date | null {
  if (!s) return null
  const d = new Date(s)
  return Number.isNaN(d.getTime()) || d.getFullYear() < 1971 ? null : d
}

/** The days a task covers, both ends included, as local midnights. */
interface Span {
  start: Date
  end: Date
}

/**
 * The days a task covers, or null when it has no dates. A task with only a
 * due date (or only a start) covers that one day. A start after the due date,
 * which older versions allowed, is read as starting on the due day.
 */
export function spanOf(t: Pick<TimelineTask, "task_start_date" | "task_due_date">): Span | null {
  const start = taskDate(t.task_start_date)
  const due = taskDate(t.task_due_date)
  if (!start && !due) return null
  const end = startOfDay(due ?? start!)
  const from = start ? startOfDay(start) : end
  return { start: from > end ? end : from, end }
}

export type EditKind = "move" | "start" | "end"

/** What a drag or a key does to a bar: move it, or pull one of its ends, by whole days. */
interface Edit {
  kind: EditKind
  days: number
}

/** A span after an edit. An end never passes the other, so a task is always at least a day. */
export function applyEdit(span: Span, edit: Edit): Span {
  const n = edit.days
  if (edit.kind === "move") return { start: addDays(span.start, n), end: addDays(span.end, n) }
  if (edit.kind === "start") {
    const start = addDays(span.start, n)
    return { start: start > span.end ? span.end : start, end: span.end }
  }
  const end = addDays(span.end, n)
  return { start: span.start, end: end < span.start ? span.start : end }
}

/** The dates the server takes for a task (POST /task/updateTaskDates); "" leaves one unset. */
export interface TaskDates {
  task_start_date: string
  task_due_date: string
}

/** A task the server moved because a task it waits on moved (shift_dependents). */
export interface ShiftedTask {
  task_uuid: string
  task_start_date?: string
  task_due_date?: string
}

/** The moved-along tasks as patches for the lists that show them, each with only the dates it has. */
export function shiftedPatches(shifted: ShiftedTask[] = []): ({ task_uuid: string } & Partial<TaskDates>)[] {
  return shifted.map((s) => ({
    task_uuid: s.task_uuid,
    ...(s.task_start_date ? { task_start_date: s.task_start_date } : {}),
    ...(s.task_due_date ? { task_due_date: s.task_due_date } : {}),
  }))
}

/** The hours a date a task didn't have is given: the project templates' working day. */
const START_HOUR = 9
const DUE_HOUR = 17

/** day, at the time of day of the date it replaces, or at hour when there was none. */
function at(day: Date, was: Date | null, hour: number): Date {
  const d = new Date(day)
  if (was) d.setHours(was.getHours(), was.getMinutes(), was.getSeconds(), was.getMilliseconds())
  else d.setHours(hour, 0, 0, 0)
  return d
}

/**
 * A task's dates after an edit, or null when it changes nothing. A date the
 * task had keeps its time of day. A task with one date keeps just that one
 * while its bar is a single day, and gains the other when it's stretched.
 */
export function datesAfter(t: Pick<TimelineTask, "task_start_date" | "task_due_date">, edit: Edit): TaskDates | null {
  const span = spanOf(t)
  if (!span || edit.days === 0) return null
  const next = applyEdit(span, edit)
  if (next.start.getTime() === span.start.getTime() && next.end.getTime() === span.end.getTime()) return null
  const hadStart = taskDate(t.task_start_date)
  const hadDue = taskDate(t.task_due_date)
  const oneDay = next.start.getTime() === next.end.getTime()
  const due = hadDue || !oneDay ? at(next.end, hadDue, DUE_HOUR) : null
  let start = hadStart || !oneDay ? at(next.start, hadStart, START_HOUR) : null
  // Same day, a start hour after the due hour: start when it's due.
  if (start && due && start > due) start = due
  return { task_start_date: start?.toISOString() ?? "", task_due_date: due?.toISOString() ?? "" }
}

/** A task with no dates, dropped on a day: due that day, at the end of the working day. */
export function datesForDrop(day: Date): TaskDates {
  return { task_start_date: "", task_due_date: at(startOfDay(day), null, DUE_HOUR).toISOString() }
}

/** Open, and due before today. A task with only a start date is never late: it isn't due. */
export function isLate(t: Pick<TimelineTask, "task_status" | "task_due_date">, today: Date): boolean {
  const due = taskDate(t.task_due_date)
  return !!due && !isClosedStatus(t.task_status) && startOfDay(due) < startOfDay(today)
}

/** "8 Oct", "8 Oct to 12 Oct", with the year when it isn't this one. */
export function spanLabel(span: Span, today: Date): string {
  const f = (d: Date) => format(d, isSameYear(d, today) ? "d MMM" : "d MMM yyyy")
  return span.start.getTime() === span.end.getTime() ? f(span.end) : `${f(span.start)} to ${f(span.end)}`
}

// ---- The grid ----------------------------------------------------------------

export type Zoom = "day" | "week" | "month"
export const ZOOMS: { value: Zoom; label: string }[] = [
  { value: "day", label: "Days" },
  { value: "week", label: "Weeks" },
  { value: "month", label: "Months" },
]

/** How wide a day is at each zoom, in pixels. */
export const DAY_WIDTH: Record<Zoom, number> = { day: 36, week: 16, month: 4 }

/** Room before the first task and after the last, in days, so there's somewhere to drag to. */
const PAD: Record<Zoom, [number, number]> = { day: [7, 21], week: [14, 56], month: [31, 120] }
/** Enough days to fill a wide screen at each zoom. */
const MIN_DAYS: Record<Zoom, number> = { day: 56, week: 126, month: 400 }
/** How far from today the grid reaches at most, so a date typed as 2096 can't make it endless. */
const REACH_YEARS = 3

/** The days the grid shows: from its first day, for so many days. */
export interface Range {
  from: Date
  days: number
}

/**
 * The grid's days: today and every task, with room either side, starting on a
 * Monday (or a month's first day, by month). Never more than a few years from
 * today; a bar beyond that is drawn at the edge.
 */
export function timelineRange(spans: Span[], now: Date, zoom: Zoom): Range {
  const today = startOfDay(now)
  const floor = addYears(today, -REACH_YEARS)
  const ceil = addYears(today, REACH_YEARS)
  let lo = today
  let hi = today
  for (const s of spans) {
    if (s.start < lo) lo = s.start
    if (s.end > hi) hi = s.end
  }
  if (lo < floor) lo = floor
  if (hi > ceil) hi = ceil
  const before = addDays(lo, -PAD[zoom][0])
  const from = zoom === "month" ? startOfMonth(before) : startOfWeek(before, { weekStartsOn: 1 })
  const days = Math.max(differenceInCalendarDays(addDays(hi, PAD[zoom][1]), from) + 1, MIN_DAYS[zoom])
  return { from, days }
}

/** A day to keep at a point across the view: at 0 its left edge, at 1 its right. */
export interface ViewAnchor {
  day: Date
  at: number
}

/**
 * Where the timeline opens, so the first thing a person sees is the plan
 * rather than empty weeks: the whole plan and today, when they fit; else
 * today a third of the way in (as Asana and Linear open), when any task is
 * near it; else the task nearest today (a project that starts next month, or
 * one long finished).
 */
export function firstView(spans: Span[], now: Date, visibleDays: number): ViewAnchor {
  const today = startOfDay(now)
  if (spans.length === 0) return { day: today, at: 1 / 3 }
  let lo = today
  let hi = today
  for (const s of spans) {
    if (s.start < lo) lo = s.start
    if (s.end > hi) hi = s.end
  }
  const length = differenceInCalendarDays(hi, lo) + 1
  if (length <= visibleDays * 0.9) return { day: addDays(lo, Math.floor(length / 2)), at: 0.5 }
  const from = addDays(today, -Math.floor(visibleDays / 3))
  const to = addDays(from, Math.max(Math.floor(visibleDays) - 1, 0))
  if (spans.some((s) => s.start <= to && s.end >= from)) return { day: today, at: 1 / 3 }
  let nearest = spans[0]
  let gap = Infinity
  for (const s of spans) {
    const g = s.start > to ? differenceInCalendarDays(s.start, today) : differenceInCalendarDays(today, s.end)
    if (g < gap) {
      gap = g
      nearest = s
    }
  }
  return nearest.start > to ? { day: nearest.start, at: 0.1 } : { day: nearest.end, at: 0.9 }
}

/** The day under x pixels from the grid's left edge. */
export function dayAt(x: number, range: Range, dayWidth: number): Date {
  const i = Math.min(Math.max(Math.floor(x / dayWidth), 0), range.days - 1)
  return addDays(range.from, i)
}

/** Pixels from the grid's left edge to the start of day. */
export function offsetOf(day: Date, range: Range, dayWidth: number): number {
  return differenceInCalendarDays(day, range.from) * dayWidth
}

/** Where a bar sits, kept inside the grid: a bar beyond it shows as a sliver at the edge. */
export function barBox(span: Span, range: Range, dayWidth: number): { left: number; width: number } {
  const total = range.days * dayWidth
  const sliver = Math.min(6, dayWidth)
  let left = offsetOf(span.start, range, dayWidth)
  let right = offsetOf(span.end, range, dayWidth) + dayWidth
  if (right <= 0) return { left: 0, width: sliver }
  if (left >= total) return { left: total - sliver, width: sliver }
  left = Math.max(left, 0)
  right = Math.min(right, total)
  return { left, width: right - left }
}

/** One label in the grid's header. */
interface Tick {
  key: string
  left: number
  width: number
  label: string
  /** A day's weekday letter, at the day zoom. */
  sub?: string
}

function unitTicks(range: Range, dayWidth: number, first: Date, next: (d: Date) => Date, label: (d: Date) => string, sub?: (d: Date) => string): Tick[] {
  const out: Tick[] = []
  for (let d = first; differenceInCalendarDays(d, range.from) < range.days; d = next(d)) {
    const left = Math.max(offsetOf(d, range, dayWidth), 0)
    const right = Math.min(offsetOf(next(d), range, dayWidth), range.days * dayWidth)
    if (right <= left) continue
    out.push({ key: d.toISOString(), left, width: right - left, label: label(d), sub: sub?.(d) })
  }
  return out
}

/**
 * The header's two rows: months over days, months over weeks, or years over
 * months. A label too wide for its cell is left out by the component.
 */
export function headerTicks(range: Range, zoom: Zoom, dayWidth: number): { top: Tick[]; bottom: Tick[] } {
  const { from } = range
  if (zoom === "month") {
    return {
      top: unitTicks(range, dayWidth, startOfYear(from), (d) => addYears(d, 1), (d) => format(d, "yyyy")),
      bottom: unitTicks(range, dayWidth, startOfMonth(from), (d) => addMonths(d, 1), (d) => format(d, "MMM")),
    }
  }
  const top = unitTicks(range, dayWidth, startOfMonth(from), (d) => addMonths(d, 1), (d) => format(d, "MMMM yyyy"))
  if (zoom === "week") {
    return { top, bottom: unitTicks(range, dayWidth, startOfWeek(from, { weekStartsOn: 1 }), (d) => addDays(d, 7), (d) => format(d, "d MMM")) }
  }
  return { top, bottom: unitTicks(range, dayWidth, from, (d) => addDays(d, 1), (d) => format(d, "d"), (d) => format(d, "EEEEE")) }
}

// ---- Dependencies ------------------------------------------------------------

/**
 * A dependency as the timeline draws it: an arrow from the end of the task
 * waited on to the start of the task waiting, or from and to whichever ends
 * its kind ties.
 */
interface DependencyLink {
  key: string
  /** The task waited on. */
  from: string
  /** The task waiting. */
  to: string
  /** An SVG path in the grid's own pixels. */
  path: string
  /** The waiting task starts (or ends) too early for it, so the plan can't be kept as it stands. Finished work breaks nothing. */
  broken: boolean
}

/** How far an arrow runs out of a bar before it turns. */
const STUB = 8

/**
 * The arrows for every dependency whose two tasks both have a row (a task in
 * a folded group, hidden as done or without dates has none). Rows are all
 * rowHeight tall; spans gives a bar's days where they aren't its row's own,
 * as while it's being dragged.
 */
export function dependencyLinks(
  rows: TimelineRow[],
  range: Range,
  dayWidth: number,
  rowHeight: number,
  spans: ReadonlyMap<string, Span> = new Map(),
): DependencyLink[] {
  const at = new Map<string, { row: number; span: Span; task: TimelineTask }>()
  rows.forEach((r, i) => {
    if (r.kind === "task") at.set(r.task.task_uuid, { row: i, span: spans.get(r.task.task_uuid) ?? r.span, task: r.task })
  })
  const out: DependencyLink[] = []
  for (const [to, waiting] of at) {
    const task = waiting.task
    for (const b of task.task_blocked_by ?? []) {
      const blocker = at.get(b.task_uuid)
      if (!blocker) continue
      const way = wayOf(b)
      const ends = endsOf(way.kind)
      const a = barBox(blocker.span, range, dayWidth)
      const z = barBox(waiting.span, range, dayWidth)
      // It leaves a bar's end rightwards and its start leftwards, and comes
      // into a start from the left and an end from the right.
      const out1 = ends.from === "end" ? 1 : -1
      const in2 = ends.to === "start" ? -1 : 1
      const x1 = ends.from === "end" ? a.left + a.width : a.left
      const y1 = blocker.row * rowHeight + rowHeight / 2
      const x2 = ends.to === "start" ? z.left : z.left + z.width
      const y2 = waiting.row * rowHeight + rowHeight / 2
      const turn1 = x1 + out1 * STUB
      const turn2 = x2 + in2 * STUB
      // One turn between the bars, when there's a place for it on the way
      // both out and in: out, down (or up), across. Otherwise the arrow goes
      // round, along the edge between the rows.
      const across = out1 === in2 ? (out1 > 0 ? Math.max(turn1, turn2) : Math.min(turn1, turn2)) : (out1 > 0 ? turn1 <= turn2 : turn1 >= turn2) ? turn1 : null
      const path =
        across !== null
          ? `M${x1} ${y1}H${across}V${y2}H${x2}`
          : `M${x1} ${y1}H${turn1}V${y2 - Math.sign(y2 - y1) * (rowHeight / 2)}H${turn2}V${y2}H${x2}`
      const open = !isClosedStatus(blocker.task.task_status) && !isClosedStatus(task.task_status)
      out.push({ key: `${b.task_uuid}>${to}`, from: b.task_uuid, to, path, broken: open && !wayKept(way, blocker.span, waiting.span) })
    }
  }
  return out
}

// ---- Rows --------------------------------------------------------------------

export type Grouping = "status" | "assignee" | "none"
export const GROUPINGS: { value: Grouping; label: string }[] = [
  { value: "status", label: "Status" },
  { value: "assignee", label: "Assignee" },
  { value: "none", label: "None" },
]

type TimelineRow =
  | { kind: "group"; key: string; id: string; label: string; count: number; collapsed: boolean; dot?: string }
  | { kind: "task"; key: string; task: TimelineTask; span: Span }

/**
 * A bar's fill: the project's own colour (its camp hue, set once on the
 * timeline as hue-*), the same for every status, so the project reads as
 * itself and twenty tasks are not twenty blocks in five hues. Open work is the
 * hue's tint, its ink name (5.9:1 or more) and a hairline of the strong cut;
 * the status is the dot beside the name and the mark at the bar's start.
 * Finished work steps back to a faint neutral fill and a muted name.
 */
const BAR_OPEN = "bg-hue-tint text-hue-ink ring-1 ring-inset ring-hue/40"
const BAR_DONE = "bg-muted-foreground/10 text-muted-foreground"

/** A built-in status's dot: the status tokens the task list's dots use (types/table). */
const DOT: Record<StatusCategory, string> = {
  backlog: "bg-faint-foreground",
  todo: "bg-muted-foreground",
  inProgress: "bg-info",
  inReview: "bg-warning",
  done: "bg-success",
  canceled: "bg-faint-foreground",
}

/** A status's colour on the timeline: a bar's fill and text. */
function statusColor(o: StatusOption | undefined): string {
  const category = o?.category ?? "todo"
  return category === "done" || category === "canceled" ? BAR_DONE : BAR_OPEN
}

/** A status's dot: a project's own status in the colour its admins chose. */
function statusDot(o: StatusOption | undefined): string {
  if (o?.custom) return colorDot(o.swatch ?? "slate")
  return DOT[o?.category ?? "todo"] ?? DOT.todo
}

/** A bar's fill and text: neutral, quieter once done. */
export const barColor = (t: TaskStatusFields, options: StatusOption[]) => statusColor(statusOptionOf(t, options))

/** The dot beside a task's name: its status's. */
export const dotColor = (t: TaskStatusFields, options: StatusOption[]) => statusDot(statusOptionOf(t, options))

const byDates = (a: { task: TimelineTask; span: Span }, b: { task: TimelineTask; span: Span }) =>
  a.span.start.getTime() - b.span.start.getTime() ||
  a.span.end.getTime() - b.span.end.getTime() ||
  a.task.task_name.localeCompare(b.task.task_name)

interface RowsInput {
  grouping: Grouping
  /** The project's statuses, in board order (useProjectStatuses). */
  statuses: StatusOption[]
  showDone: boolean
  collapsed: ReadonlySet<string>
}

/**
 * The timeline's rows, earliest first within each group, and the open tasks
 * that have no dates yet. Cancelled tasks aren't drawn, and done ones only
 * when asked for. spans are every drawn task's, for timelineRange.
 */
export function timelineRows(tasks: TimelineTask[], o: RowsInput): { rows: TimelineRow[]; unscheduled: TimelineTask[]; spans: Span[] } {
  const scheduled: { task: TimelineTask; span: Span }[] = []
  const unscheduled: TimelineTask[] = []
  for (const task of tasks) {
    const done = task.task_status === "done"
    if (task.task_status === "canceled" || (done && !o.showDone)) continue
    const span = spanOf(task)
    if (span) scheduled.push({ task, span })
    else if (!done) unscheduled.push(task)
  }
  scheduled.sort(byDates)
  const spans = scheduled.map((s) => s.span)
  const taskRow = (s: { task: TimelineTask; span: Span }): TimelineRow => ({ kind: "task", key: s.task.task_uuid, task: s.task, span: s.span })

  if (o.grouping === "none") return { rows: scheduled.map(taskRow), unscheduled, spans }

  const groups: { key: string; label: string; dot?: string; items: { task: TimelineTask; span: Span }[] }[] = []
  if (o.grouping === "status") {
    const at = new Map<string, number>()
    const add = (opt: StatusOption) => {
      at.set(opt.value, groups.length)
      groups.push({ key: opt.value, label: opt.label, dot: statusDot(opt), items: [] })
    }
    o.statuses.forEach(add)
    for (const s of scheduled) {
      const opt = statusOptionOf(s.task, o.statuses)
      if (!opt) continue
      if (!at.has(opt.value)) add(opt)
      groups[at.get(opt.value)!].items.push(s)
    }
  } else {
    const bySpan = new Map(scheduled.map((s) => [s.task.task_uuid, s]))
    const { columns, options } = groupByAssignee({ all: scheduled.map((s) => s.task) }, [], true)
    for (const opt of options) {
      groups.push({ key: opt.value, label: opt.value === NO_ASSIGNEE ? "No assignee" : opt.label, items: (columns[opt.value] ?? []).map((t) => bySpan.get(t.task_uuid)!) })
    }
  }

  const rows: TimelineRow[] = []
  for (const g of groups) {
    if (g.items.length === 0) continue
    const collapsed = o.collapsed.has(g.key)
    rows.push({ kind: "group", key: `group:${g.key}`, id: g.key, label: g.label, count: g.items.length, collapsed, dot: g.dot })
    if (!collapsed) rows.push(...g.items.map(taskRow))
  }
  return { rows, unscheduled, spans }
}
