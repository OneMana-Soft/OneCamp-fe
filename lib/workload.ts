// The workload: who has how much to do each week, across every project the
// person is in. A task counts for whoever has it in each week it runs, from
// its start to its due date; a person's capacity is how many tasks a week
// they take on. The server reads the tasks (business/Project/workload.go);
// this places them in the reader's own weeks.

import { addDays, differenceInCalendarDays, format, isSameYear, startOfWeek } from "date-fns"
import { isClosedStatus } from "@/lib/taskStatus"
import { spanOf, taskDate } from "@/lib/timeline"
import { awayWorkingDays, capacityAfterTimeOff, type AwaySpan } from "@/lib/timeOff"
import { GetEndpointUrl } from "@/services/endPoints"

export interface WorkloadPerson {
  user_uuid: string
  user_name: string
  user_full_name?: string
  user_profile_object_key?: string
  user_job_title?: string
  /** Tasks a week they take on; the default when capacity_set is false. */
  capacity: number
  capacity_set: boolean
  can_edit_capacity: boolean
  /** The projects they're in (a member or an admin): where a task can be handed to them. */
  project_uuids: string[]
}

export interface WorkloadTask {
  task_uuid: string
  task_name: string
  task_status: string
  task_custom_status?: string
  task_custom_status_name?: string
  task_start_date?: string
  task_due_date?: string
  /** Who has it; none for nobody (or an account since deleted). */
  assignee_uuid?: string
  project_uuid: string
  project_name: string
  parent_name?: string
  /** The reader may move it or give it to someone else. */
  can_edit: boolean
}

export interface WorkloadData {
  people: WorkloadPerson[]
  tasks: WorkloadTask[]
  /** Open tasks with no dates, by project and person (none for nobody's). */
  undated: { project_uuid: string; user_uuid?: string; count: number }[]
  default_capacity: number
  /** Time off marked on people's calendars (Away events), as dates only. */
  away?: { user_uuid: string; start: string; end: string }[]
  /** More tasks than one view sends: the latest due are shown. */
  truncated: boolean
}

/** How many weeks the workload shows, from this one. */
const WORKLOAD_WEEKS = 12

/** The workload's address in the cache, for the reader's zone. */
export function workloadKey(tz: string, weeks = WORKLOAD_WEEKS): string {
  return `${GetEndpointUrl.ProjectWorkload}?tz=${encodeURIComponent(tz)}&weeks=${weeks}`
}

export function isWorkloadKey(key: string): boolean {
  return new URL(key, "http://localhost").pathname === GetEndpointUrl.ProjectWorkload
}

/** The Monday of this week and of each week after it, n in all. */
export function workloadWeeks(today: Date, n = WORKLOAD_WEEKS): Date[] {
  const first = startOfWeek(today, { weekStartsOn: 1 })
  return Array.from({ length: n }, (_, i) => addDays(first, 7 * i))
}

/** "This week", "Next week", then the week's Monday: "26 Oct" (with the year when it isn't this one). */
export function weekLabel(week: Date, index: number, today: Date): string {
  if (index === 0) return "This week"
  if (index === 1) return "Next week"
  return format(week, isSameYear(week, today) ? "d MMM" : "d MMM yyyy")
}

/** A row of the workload: a person, or the tasks nobody has. */
export interface WorkloadRow {
  key: string
  person: WorkloadPerson | null
  /** Tasks a week they take on; none for nobody's tasks. */
  capacity: number | null
  /** Working days they're away in each week shown. */
  awayDays: number[]
  /** What they take on in each week shown: their capacity, less the days away. */
  capacities: (number | null)[]
  /** Open tasks that were due before this week. */
  overdue: WorkloadTask[]
  /** The tasks running in each week shown. */
  weeks: WorkloadTask[][]
  /** Open tasks without dates, which no week can show. */
  undated: number
  /** Their fullest week shown, as a share of their capacity. */
  peak: number
}

export const UNASSIGNED = "unassigned"

const emptyRow = (key: string, person: WorkloadPerson | null, weeks: number): WorkloadRow => ({
  key,
  person,
  capacity: person ? person.capacity : null,
  awayDays: Array.from({ length: weeks }, () => 0),
  capacities: Array.from({ length: weeks }, () => (person ? person.capacity : null)),
  overdue: [],
  weeks: Array.from({ length: weeks }, () => []),
  undated: 0,
  peak: 0,
})

/**
 * The workload's rows for the weeks shown: everyone in the projects shown (all
 * of the reader's when none are named) or with a task in one, busiest first,
 * and a last row for the tasks nobody has. A finished task has no place (a
 * change made here may have just finished one).
 */
export function workloadRows(data: WorkloadData, weeks: Date[], projects?: ReadonlySet<string>): { people: WorkloadRow[]; unassigned: WorkloadRow } {
  const shown = (project: string) => !projects || projects.has(project)
  const everyone = new Map(data.people.map((p) => [p.user_uuid, p]))
  const rows = new Map<string, WorkloadRow>()
  for (const p of data.people) {
    if (p.project_uuids.some(shown)) rows.set(p.user_uuid, emptyRow(p.user_uuid, p, weeks.length))
  }
  const unassigned = emptyRow(UNASSIGNED, null, weeks.length)
  // Someone taken off a project keeps its tasks, and their row.
  const rowOf = (who?: string) => {
    if (!who) return unassigned
    let row = rows.get(who)
    const p = everyone.get(who)
    if (!row && p) rows.set(who, (row = emptyRow(who, p, weeks.length)))
    return row ?? unassigned
  }
  const first = weeks[0]
  for (const t of data.tasks) {
    if (!shown(t.project_uuid) || isClosedStatus(t.task_status)) continue
    const span = spanOf(t)
    if (!span) continue
    const row = rowOf(t.assignee_uuid)
    if (span.end < first) {
      row.overdue.push(t)
      continue
    }
    const from = Math.max(0, Math.floor(differenceInCalendarDays(span.start, first) / 7))
    const to = Math.min(weeks.length - 1, Math.floor(differenceInCalendarDays(span.end, first) / 7))
    for (let i = from; i <= to; i++) row.weeks[i].push(t)
  }
  for (const u of data.undated) {
    if (!shown(u.project_uuid)) continue
    rowOf(u.user_uuid).undated += u.count
  }
  const people = [...rows.values()]
  // Time off takes its working days out of each week's capacity.
  const away = new Map<string, AwaySpan[]>()
  for (const a of data.away ?? []) {
    const spans = away.get(a.user_uuid) ?? []
    spans.push({ start: new Date(a.start), end: new Date(a.end) })
    away.set(a.user_uuid, spans)
  }
  for (const r of people) {
    const spans = away.get(r.key)
    if (spans && r.capacity !== null) {
      r.awayDays = weeks.map((w) => awayWorkingDays(spans, w))
      r.capacities = r.awayDays.map((d) => capacityAfterTimeOff(r.capacity!, d))
    }
    // A week with no capacity left and work in it is fuller than any other.
    r.peak = Math.max(0, ...r.weeks.map((w, i) => w.length / Math.max(0.5, r.capacities[i] ?? 1)))
  }
  const busy = (r: WorkloadRow) => r.weeks.reduce((n, w) => n + w.length, 0) + r.overdue.length
  people.sort((a, b) => b.peak - a.peak || busy(b) - busy(a) || a.person!.user_name.localeCompare(b.person!.user_name))
  return { people, unassigned }
}

/** How full a week is: nothing in it, room left, exactly full, or over capacity. */
export type Load = "free" | "room" | "full" | "over"

export function loadOf(count: number, capacity: number | null): Load {
  if (count === 0) return "free"
  if (capacity === null || count < capacity) return "room"
  return count === capacity ? "full" : "over"
}

/** A task's dates n weeks later, each on the same weekday at the same time of day; none it didn't have. */
export function weeksLater(t: Pick<WorkloadTask, "task_start_date" | "task_due_date">, n: number): { task_start_date: string; task_due_date: string } {
  const later = (s?: string) => {
    const d = taskDate(s)
    return d ? addDays(d, 7 * n).toISOString() : ""
  }
  return {
    task_start_date: later(t.task_start_date),
    task_due_date: later(t.task_due_date),
  }
}

/** How many weeks a task that's overdue moves so that it's due next week. */
export function weeksToNextWeek(t: Pick<WorkloadTask, "task_start_date" | "task_due_date">, weeks: Date[]): number {
  const span = spanOf(t)
  if (!span) return 1
  return Math.max(1, Math.floor(differenceInCalendarDays(weeks[1] ?? addDays(weeks[0], 7), startOfWeek(span.end, { weekStartsOn: 1 })) / 7))
}

/** What a row's week says to a screen reader: whose week, how many tasks, and how that sits with what they take on that week. */
export function cellLabel(row: WorkloadRow, week: number, when: string, count: number): string {
  const who = row.person ? row.person.user_name : "Nobody"
  const tasks = `${count} ${count === 1 ? "task" : "tasks"}`
  const capacity = row.capacities[week] ?? null
  if (capacity === null) return `${who}, ${when}: ${tasks}`
  const days = row.awayDays[week] ?? 0
  const off = days >= 5 ? ", away all week" : days > 0 ? `, away ${days} ${days === 1 ? "day" : "days"}` : ""
  const load = loadOf(count, capacity)
  const against = load === "over" ? `${count - capacity} over their ${capacity}` : load === "full" ? "full" : `room for ${capacity - count} more`
  return `${who}, ${when}: ${tasks}${off}, ${against}`
}
