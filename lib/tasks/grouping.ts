/**
 * The grouped task list's groups (design v3, work.md W14, W18). Pure, for its
 * test: tasks in, groups out, in the order a person reads them.
 *
 *   status    In progress, In review, To do, Backlog, Done; each built-in
 *             followed by the project's own statuses that count as it.
 *             Cancelled is left out.
 *   when      Overdue (only when there is one), Today, This week, Later, No
 *             date, Done (finished in the last 7 days). My Tasks' default.
 *   priority  Urgent, High, Medium, Low, No priority.
 *   project   by project, in the order they first appear.
 *   assignee  by person, then Unassigned.
 *   none      one group.
 */
import { isClosedStatus, statusOptionOf, statusOptions, type StatusOption } from "@/lib/taskStatus"
import type { TaskInfoInterface } from "@/types/task"
import { displayNameOf } from "@/lib/personName"

export type Grouping = "status" | "when" | "priority" | "project" | "assignee" | "none"

export const GROUPINGS: { value: Grouping; label: string }[] = [
  { value: "status", label: "Status" },
  { value: "when", label: "Due" },
  { value: "priority", label: "Priority" },
  { value: "assignee", label: "Assignee" },
  { value: "project", label: "Project" },
  { value: "none", label: "None" },
]

export interface TaskGroup {
  key: string
  label: string
  tasks: TaskInfoInterface[]
  /** A status group's status, for its glyph and for tasks added in it. */
  status?: StatusOption
  /** A when group: the due date a task added in it takes ("today", "week"); a project group: its uuid. */
  when?: "overdue" | "today" | "week" | "later" | "none" | "done"
  projectId?: string
  /** Finished work: shown capped, and collapsible to its header. */
  closed?: boolean
  /** Shown in danger ink (Overdue). */
  danger?: boolean
}

const STATUS_ORDER = ["inProgress", "inReview", "todo", "backlog", "done"] as const

const DAY = 86_400_000
const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()

function dueOf(t: TaskInfoInterface): Date | null {
  const v = t.task_due_date
  if (!v || v.startsWith("0001-01-01") || v.startsWith("1970-01-01")) return null
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d
}

/** Which "when" a task falls in, today being `now`. The week runs to Sunday. */
export function whenOf(t: TaskInfoInterface, now: Date = new Date()): NonNullable<TaskGroup["when"]> {
  if (isClosedStatus(t.task_status)) return "done"
  const d = dueOf(t)
  if (!d) return "none"
  const days = Math.round((dayStart(d) - dayStart(now)) / DAY)
  if (days < 0) return "overdue"
  if (days === 0) return "today"
  const toSunday = (7 - now.getDay()) % 7
  return days <= toSunday ? "week" : "later"
}

const WHEN_LABEL: Record<NonNullable<TaskGroup["when"]>, string> = {
  overdue: "Overdue",
  today: "Today",
  week: "This week",
  later: "Later",
  none: "No date",
  done: "Done",
}

const PRIORITY_GROUPS = [
  { key: "urgent", label: "Urgent" },
  { key: "high", label: "High" },
  { key: "medium", label: "Medium" },
  { key: "low", label: "Low" },
  { key: "", label: "No priority" },
]

/**
 * The groups for tasks. `pinned` holds tasks in the group they were in for a
 * moment (a finished row waits in its group for the undo window before it
 * settles into Done).
 */
export function groupTasks(
  tasks: TaskInfoInterface[],
  by: Grouping,
  options: StatusOption[] = statusOptions(),
  { now = new Date(), pinned }: { now?: Date; pinned?: Map<string, string> } = {},
): TaskGroup[] {
  const pin = (t: TaskInfoInterface) => pinned?.get(t.task_uuid)
  if (by === "status") {
    const groups: TaskGroup[] = []
    for (const category of STATUS_ORDER) {
      for (const o of options.filter((x) => x.category === category)) {
        groups.push({ key: o.value, label: o.label, status: o, tasks: [], closed: category === "done" })
      }
    }
    const byKey = new Map(groups.map((g) => [g.key, g]))
    for (const t of tasks) {
      const key = pin(t) ?? statusOptionOf(t, options)?.value ?? t.task_status
      const g = byKey.get(key) ?? (t.task_status === "canceled" ? undefined : byKey.get(t.task_status))
      g?.tasks.push(t)
    }
    // Groups with nothing in them step aside; a list with nothing at all
    // keeps To do, so there is somewhere to add the first task.
    const some = groups.filter((g) => g.tasks.length > 0)
    return some.length > 0 ? some : groups.filter((g) => g.key === "todo")
  }
  if (by === "when") {
    const order: NonNullable<TaskGroup["when"]>[] = ["overdue", "today", "week", "later", "none", "done"]
    const groups = new Map(order.map((w) => [w, { key: w, label: WHEN_LABEL[w], when: w, tasks: [] as TaskInfoInterface[], closed: w === "done", danger: w === "overdue" } as TaskGroup]))
    for (const t of tasks) {
      if (t.task_status === "canceled" && !pin(t)) continue
      const w = (pin(t) as TaskGroup["when"]) ?? whenOf(t, now)
      groups.get(w)?.tasks.push(t)
    }
    // Overdue only when there is one; Today always (its empty state is the
    // all-clear); the rest when they hold something.
    return order.map((w) => groups.get(w)!).filter((g) => g.tasks.length > 0 || g.when === "today")
  }
  if (by === "priority") {
    const groups = PRIORITY_GROUPS.map((p) => ({ key: `priority:${p.key}`, label: p.label, tasks: [] as TaskInfoInterface[] }))
    for (const t of tasks) {
      if (t.task_status === "canceled") continue
      const i = PRIORITY_GROUPS.findIndex((p) => p.key === (t.task_priority || ""))
      groups[i < 0 ? groups.length - 1 : i].tasks.push(t)
    }
    return groups.filter((g) => g.tasks.length > 0)
  }
  if (by === "project" || by === "assignee") {
    const groups = new Map<string, TaskGroup>()
    for (const t of tasks) {
      if (t.task_status === "canceled") continue
      const id = by === "project" ? t.task_project?.project_uuid ?? "" : t.task_assignee?.user_uuid ?? ""
      const label = by === "project" ? t.task_project?.project_name || "No project" : displayNameOf(t.task_assignee) || "Unassigned"
      if (!groups.has(id)) groups.set(id, { key: `${by}:${id}`, label: id ? label : by === "project" ? "No project" : "Unassigned", tasks: [], projectId: by === "project" ? id : undefined })
      groups.get(id)!.tasks.push(t)
    }
    const out = [...groups.values()]
    // Nobody's tasks last.
    return [...out.filter((g) => !g.key.endsWith(":")), ...out.filter((g) => g.key.endsWith(":"))]
  }
  return [{ key: "all", label: "Tasks", tasks: tasks.filter((t) => t.task_status !== "canceled") }]
}

/** How many of a finished group a list shows before "Show N more". */
export const CLOSED_SHOWN = 5
/** How many rows of an open group show before "Show N more", so no group draws hundreds of rows at once. */
export const OPEN_SHOWN = 60
