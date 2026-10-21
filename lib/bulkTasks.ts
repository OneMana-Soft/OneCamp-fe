/**
 * One change to many tasks (a list's selection): for each task, the request
 * to make and how it looks at once, or nothing when the task is already that
 * way. There is no bulk endpoint; each task goes through the same one a single
 * change uses, so its notifications, history and GitHub sync are the same.
 * Pure, for its test.
 */
import { PostEndpointUrl } from "@/services/endPoints"
import { statusPatch, type StatusOption } from "@/lib/taskStatus"
import { MAX_TAGS, joinTags, splitTags } from "@/lib/tags"
import { isZeroEpoch } from "@/lib/utils/validation/isZeroEpoch"
import { apiErrorMessage } from "@/lib/utils/apiError"
import type { TaskInfoInterface } from "@/types/task"
import type { UserProfileDataInterface } from "@/types/user"

export type BulkChange =
  | { field: "status"; value: string; options: StatusOption[] }
  | { field: "priority"; value: string }
  | { field: "assignee"; user: UserProfileDataInterface | null }
  | { field: "tags"; tag: string; add: boolean }
  /** A due date as the server keeps it (an ISO time), or "" for none. */
  | { field: "due"; value: string }
  /** Into the trash, and back out of it (Undo). */
  | { field: "delete" }
  | { field: "restore" }

export interface BulkRequest {
  endpoint: string
  payload: Record<string, string>
  patch: Partial<TaskInfoInterface>
  /** It takes the task off every list (a delete), rather than changing it there. */
  removes?: boolean
}

/** The status a task shows: its project's own, or a built-in one. */
export const statusOf = (t: TaskInfoInterface) => t.task_custom_status || t.task_status

const hasTagIn = (tags: string[], tag: string) => tags.some((x) => x.toLowerCase() === tag.toLowerCase())

export function bulkRequest(t: TaskInfoInterface, change: BulkChange): BulkRequest | null {
  switch (change.field) {
    case "status":
      if (statusOf(t) === change.value) return null
      return { endpoint: PostEndpointUrl.UpdateTaskStatus, payload: { task_status: change.value }, patch: statusPatch(change.value, change.options) }
    case "priority":
      if (t.task_priority === change.value) return null
      return { endpoint: PostEndpointUrl.UpdateTaskPriority, payload: { task_priority: change.value }, patch: { task_priority: change.value } }
    case "assignee": {
      const to = change.user?.user_uuid ?? ""
      if ((t.task_assignee?.user_uuid ?? "") === to) return null
      return { endpoint: PostEndpointUrl.UpdateTaskAssignee, payload: { task_assignee_uuid: to }, patch: { task_assignee: change.user ?? undefined } }
    }
    case "tags": {
      const tags = splitTags(t.task_label)
      const has = hasTagIn(tags, change.tag)
      // Already so, or (adding) a task that has all the tags it may.
      if (has === change.add || (change.add && tags.length >= MAX_TAGS)) return null
      const label = joinTags(change.add ? [...tags, change.tag] : tags.filter((x) => x.toLowerCase() !== change.tag.toLowerCase()))
      return { endpoint: PostEndpointUrl.UpdateTaskLabel, payload: { task_label: label }, patch: { task_label: label } }
    }
    case "due": {
      if (sameMoment(t.task_due_date, change.value)) return null
      return { endpoint: PostEndpointUrl.UpdateTaskDueDate, payload: { task_due_date: change.value }, patch: { task_due_date: change.value } }
    }
    case "delete":
      if (isDeleted(t)) return null
      return { endpoint: PostEndpointUrl.ArchiveTask, payload: {}, patch: {}, removes: true }
    case "restore":
      if (!isDeleted(t)) return null
      return { endpoint: PostEndpointUrl.UnArchiveTask, payload: {}, patch: { task_deleted_at: NO_TIME } }
  }
}

/** The zero time the server writes for "never" (a live task's deletion time). */
const NO_TIME = "0001-01-01T00:00:00Z"

/** Whether the task is in the trash. */
const isDeleted = (t: TaskInfoInterface) => !isZeroEpoch(t.task_deleted_at || "")

/** Whether two due dates as the server keeps them name the same moment ("" and the zero time are none). */
function sameMoment(a: string | undefined, b: string): boolean {
  const at = (s: string | undefined) => (isZeroEpoch(s || "") ? null : new Date(s as string).getTime())
  return at(a) === at(b)
}

/** Whether every task has the tag (removing it is then the choice), some, or none. */
export function tagState(tasks: TaskInfoInterface[], tag: string): "all" | "some" | "none" {
  const n = tasks.filter((t) => hasTagIn(splitTags(t.task_label), tag)).length
  return n === 0 ? "none" : n === tasks.length ? "all" : "some"
}

/** "3 tasks", "1 task". */
export const tasksCount = (n: number) => `${n} task${n === 1 ? "" : "s"}`

/** What a change to many tasks didn't do: "The task wasn't deleted", "1 of 3 tasks wasn't changed", "None of the 2 tasks were deleted". */
export function notDone(failed: number, done: number, what: string): string {
  if (done > 0) return `${failed} of ${failed + done} tasks ${failed === 1 ? "wasn't" : "weren't"} ${what}`
  return failed === 1 ? `The task wasn't ${what}` : `None of the ${failed} tasks were ${what}`
}

/** Why, from the first refusal, in the server's or the connection's words. */
export const whyNotDone = (error: unknown) => apiErrorMessage(error, "The list shows them as they are.")
