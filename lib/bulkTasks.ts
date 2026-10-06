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
import type { TaskInfoInterface } from "@/types/task"
import type { UserProfileDataInterface } from "@/types/user"

export type BulkChange =
  | { field: "status"; value: string; options: StatusOption[] }
  | { field: "priority"; value: string }
  | { field: "assignee"; user: UserProfileDataInterface | null }
  | { field: "tags"; tag: string; add: boolean }

export interface BulkRequest {
  endpoint: PostEndpointUrl
  payload: Record<string, string>
  patch: Partial<TaskInfoInterface>
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
  }
}

/** Whether every task has the tag (removing it is then the choice), some, or none. */
export function tagState(tasks: TaskInfoInterface[], tag: string): "all" | "some" | "none" {
  const n = tasks.filter((t) => hasTagIn(splitTags(t.task_label), tag)).length
  return n === 0 ? "none" : n === tasks.length ? "all" : "some"
}

/** "3 tasks", "1 task". */
export const tasksCount = (n: number) => `${n} task${n === 1 ? "" : "s"}`
