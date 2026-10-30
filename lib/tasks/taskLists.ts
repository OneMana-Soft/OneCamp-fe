/**
 * A task list's answer as the screens read it (a project's list and board, My
 * Tasks' list and board, the timeline): which list a status goes in, whether
 * a list's filter keeps a task, and a new task at the top of the list a key
 * reads. Pure, so the screens' cache (hooks/useTaskUpdate) and the Offline
 * Store's answers (lib/offline) show a new task the same way.
 */

import { GetEndpointUrl } from "@/services/endPoints"
import type { TaskInfoInterface } from "@/types/task"
import { isTimelineKey } from "@/lib/timelineKey"
import { fieldFilterMatches, fieldIdOfFilter } from "@/lib/tasks/fields"
import { carryCounts } from "@/lib/board/carryCounts"

/** A board answer's list for a status: project_tasks_<this>, user_tasks_<this>. */
export function statusToKey(status: string): string {
  const mapping: Record<string, string> = {
    backlog: "backlog",
    todo: "todo",
    inProgress: "in_progress",
    inReview: "in_review",
    done: "done",
    canceled: "canceled",
  }
  return mapping[status] || status.replace(/ /g, "_")
}

/**
 * Whether a task belongs in a list filtered as the key says, as far as can be
 * told here. A filter only the server can answer (a cycle, an assignee by
 * graph id, overdue) answers `unsure`: an edited task stays in the list
 * (dropping it lost the task after any edit), and a new one stays out until
 * the list is fetched again.
 */
export function matchesFilters(task: TaskInfoInterface, searchParams: URLSearchParams, unsure = true): boolean {
  const searchText = searchParams.get("taskSearchString")?.toLowerCase()
  if (searchText && !task.task_name.toLowerCase().includes(searchText)) {
    return false
  }

  const filtersJson = searchParams.get("filters")
  if (!filtersJson) return true
  let filters: { id: string; value: unknown }[]
  try {
    filters = JSON.parse(filtersJson)
  } catch (e) {
    console.error("Error parsing filters in SWR key", e)
    return true
  }
  for (const filter of Array.isArray(filters) ? filters : []) {
    // Most filters are lists of values; a few (overdue) are one string.
    const values = Array.isArray(filter.value) ? filter.value.map(String) : filter.value ? [String(filter.value)] : []
    if (values.length === 0) continue
    if (filter.id === "task_priority" && !values.includes(task.task_priority)) return false
    // As the server reads it: a built-in status matches a task in no
    // status of the project's own; a project's status matches by id.
    if (filter.id === "task_status") {
      const own = task.task_custom_status
      if (!(own ? values.includes(own) : values.includes(task.task_status))) return false
    }
    if (fieldIdOfFilter(filter.id)) {
      if (!fieldFilterMatches(task.task_fields, filter.id, values)) return false
    } else if (filter.id !== "task_priority" && filter.id !== "task_status" && !unsure) {
      return false
    }
  }
  return true
}

type Answer = { data?: Record<string, unknown> } | undefined | null

/** list with task at its top; the same list when it already has it. */
function atTop(list: unknown, task: TaskInfoInterface): unknown[] | undefined {
  const tasks = Array.isArray(list) ? (list as { task_uuid?: string }[]) : []
  return tasks.some((t) => t?.task_uuid === task.task_uuid) ? undefined : [task, ...tasks]
}

/**
 * The answer a list keyed key holds, with task added at its top when that list
 * shows it: its first page only, past a filter the task matches (one only the
 * server can answer leaves it out until the list is read again), a project's
 * lists only for that project's tasks, and, given member, My Tasks only for a
 * task that is theirs. The same answer when it doesn't show it, or has it.
 */
export function withNewTask<A extends Answer>(key: string, answer: A, task: TaskInfoInterface, opts: { member?: string } = {}): A {
  if (!answer || !answer.data) return answer
  const url = new URL(key, "http://localhost")
  const pathname = url.pathname
  const searchParams = url.searchParams
  if (parseInt(searchParams.get("pageIndex") || "0") !== 0) return answer
  if (!matchesFilters(task, searchParams, false)) return answer
  const project = task.task_project?.project_uuid
  const mine = opts.member === undefined || task.task_assignee?.user_uuid === opts.member

  // A copy of what changes, the rest shared.
  const data: Record<string, unknown> = { ...answer.data }
  const put = (name: string, count?: string) => {
    const next = atTop(data[name], task)
    if (!next) return false
    data[name] = next
    if (count) data[count] = (Number(data[count]) || 0) + 1
    return true
  }
  let added = false
  // Exact paths, so one never takes another's answer.
  if (isTimelineKey(pathname)) {
    // The timeline holds a project's own tasks, newest first.
    if (!project || isTimelineKey(pathname, project)) added = put("tasks", "total")
  } else if (pathname.startsWith(GetEndpointUrl.GetProjectTaskListForKanban)) {
    const column = `project_tasks_${statusToKey(task.task_status)}`
    if ((!project || pathname.includes(project)) && Array.isArray(data[column])) added = put(column)
    // Its column's count (and a closed column's own) counts it, as a moved card's does.
    if (added) carryCounts(data, "project", undefined, task)
  } else if (pathname.startsWith(GetEndpointUrl.GetProjectTaskList)) {
    if (!project || pathname.includes(project)) added = put("project_tasks", "project_task_count")
  } else if (pathname === GetEndpointUrl.GetUserTaskListForKanban) {
    const column = `user_tasks_${statusToKey(task.task_status)}`
    if (mine && Array.isArray(data[column])) added = put(column)
    if (added) carryCounts(data, "user", undefined, task)
  } else if (pathname === GetEndpointUrl.GetUserTaskList) {
    if (mine) added = put("user_tasks", "user_task_count")
  }
  return added ? ({ ...answer, data } as A) : answer
}
