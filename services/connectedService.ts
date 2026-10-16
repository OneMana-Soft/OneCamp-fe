// Connected work (docs programme C1): what chips show, who an "@" in a doc
// reaches, and to-dos that become tasks. Calls for the backend's
// controllers/EntityLink/connectedController.go, at CONNECTED_PATHS.

import axiosInstance, { OWN_ERRORS } from "@/lib/axiosInstance"
import type { EntityAccess } from "@/lib/liveEntity/types"
import { CONNECTED_PATHS } from "@/services/endPoints"

/** One thing as POST /entities answers it. */
export interface EntityAnswer {
  kind: string
  id: string
  access: EntityAccess
  data?: Record<string, unknown>
  topic?: string
}

/** What the server reads at once (business/EntityLink MaxRefs). */
export const MAX_REFS = 100

/** Reads things for chips, quietly: a chip says when it couldn't. */
export async function readEntities(refs: Array<{ kind: string; id: string }>): Promise<EntityAnswer[]> {
  const res = await axiosInstance.post(CONNECTED_PATHS.entities, { refs }, OWN_ERRORS)
  return (res.data?.data as EntityAnswer[] | undefined) ?? []
}

/** Who of these people can't open a doc being written in, and whether the writer may share it. */
export interface MentionAccess {
  can_share: boolean
  cant_open: string[]
}

export async function mentionAccess(docId: string, userIds: string[]): Promise<MentionAccess> {
  const res = await axiosInstance.post(CONNECTED_PATHS.mentionAccess, { doc_uuid: docId, user_uuids: userIds }, OWN_ERRORS)
  return res.data?.data as MentionAccess
}

/** Makes a task from a to-do in a doc, tied to it: the new task's id. */
export async function todoToTask(docId: string, projectId: string, title: string): Promise<string> {
  const res = await axiosInstance.post(CONNECTED_PATHS.todoTask, { doc_uuid: docId, project_uuid: projectId, title }, OWN_ERRORS)
  return String(res.data?.data?.task_uuid ?? "")
}

/** A tick or an untick of a to-do that is a task, made to the task. */
export async function checkTodo(docId: string, taskId: string, done: boolean): Promise<void> {
  await axiosInstance.post(CONNECTED_PATHS.todoCheck, { doc_uuid: docId, task_uuid: taskId, done }, OWN_ERRORS)
}
