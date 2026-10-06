/**
 * A board grouped by who has each task, as Linear's board can be: one column
 * per person on the project, after a "No assignee" column. Pure, so it is
 * tested without rendering.
 */
import type { StatusOption } from "@/lib/taskStatus"
import type { TaskInfoInterface } from "@/types/task"

export type BoardGrouping = "status" | "assignee"

/** The column a task with nobody on it sits in. */
export const NO_ASSIGNEE = "none"

interface Member {
  user_uuid: string
  user_name?: string
  user_full_name?: string
}

const nameOf = (m: Member) => m.user_full_name || m.user_name || "Someone"

export function groupByAssignee(
  byStatus: Record<string, TaskInfoInterface[]>,
  members: Member[] = [],
): { columns: Record<string, TaskInfoInterface[]>; options: StatusOption[] } {
  const people = new Map<string, Member>()
  for (const m of members) if (m?.user_uuid) people.set(m.user_uuid, m)
  const columns: Record<string, TaskInfoInterface[]> = { [NO_ASSIGNEE]: [] }
  for (const tasks of Object.values(byStatus)) {
    for (const t of tasks) {
      const who = t.task_assignee?.user_uuid
      const key = who || NO_ASSIGNEE
      // Someone who has tasks but has left the project still gets a column:
      // their work has not gone anywhere.
      if (who && !people.has(who)) people.set(who, t.task_assignee as Member)
      ;(columns[key] ??= []).push(t)
    }
  }
  const ordered = [...people.values()].sort((a, b) => nameOf(a).localeCompare(nameOf(b)))
  const option = (value: string, label: string): StatusOption => ({ value, label, category: "todo", custom: false, color: "" })
  return {
    columns: Object.fromEntries([[NO_ASSIGNEE, columns[NO_ASSIGNEE]], ...ordered.map((m) => [m.user_uuid, columns[m.user_uuid] ?? []])]),
    options: [option(NO_ASSIGNEE, "No assignee"), ...ordered.map((m) => option(m.user_uuid, nameOf(m)))],
  }
}
