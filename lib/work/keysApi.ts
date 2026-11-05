import axiosInstance, { OWN_ERRORS } from "@/lib/axiosInstance"
import type { TaskWorkType } from "@/types/task"
import { madeOffline } from "@/lib/offline/offlineId"
import { projectTypesPath } from "@/lib/work/workTypes"

/**
 * Task keys and types (projects A8K, router/projectsKeys.go), out of
 * services/endPoints.ts, which every route's first load carries. Each call
 * leaves its failure to its screen (OWN_ERRORS).
 */

/** A project's key, the number its next task takes and the keys it had. */
export interface ProjectKey {
  key: string
  next_number: number
  aliases: string[]
}

/** A type a task in the project can have: built in, or its own (own). */
export interface ProjectType extends TaskWorkType {
  own?: boolean
}

export const projectKeyPath = (projectId: string) => `/project/${projectId}/key`
export { projectTypesPath }

/** Changes a project's key; answers the key as it is now. */
export async function setProjectKey(projectId: string, key: string): Promise<ProjectKey> {
  const res = await axiosInstance.put<{ data: ProjectKey }>(projectKeyPath(projectId), { key }, OWN_ERRORS)
  return res.data.data
}

/** Adds a type to a project. */
export async function createProjectType(projectId: string, name: string, icon: string): Promise<ProjectType> {
  const res = await axiosInstance.post<{ data: ProjectType }>(projectTypesPath(projectId), { name, icon }, OWN_ERRORS)
  return res.data.data
}

/** Renames a project's own type, or changes its icon. */
export async function updateProjectType(projectId: string, typeId: string, name: string, icon: string): Promise<void> {
  await axiosInstance.put(`${projectTypesPath(projectId)}/${typeId}`, { name, icon }, OWN_ERRORS)
}

/** Takes a project's own type out of the pickers; its tasks keep it. */
export async function archiveProjectType(projectId: string, typeId: string): Promise<void> {
  await axiosInstance.delete(`${projectTypesPath(projectId)}/${typeId}`, OWN_ERRORS)
}

/** Gives a task a type ("" makes it a plain Task); answers the type it has now. */
export async function setTaskType(taskUUID: string, typeId: string): Promise<TaskWorkType | null> {
  const res = await axiosInstance.post<{ data: { task_work_type: TaskWorkType | null } }>("/task/type", { task_uuid: taskUUID, type_id: typeId }, OWN_ERRORS)
  return res.data.data.task_work_type
}

/**
 * Gives a task just made the type of the place it was added in (a board's
 * column or a list's group of a type). Nothing for a plain Task (""), or for a
 * task made offline, which waits as one create.
 */
export async function typeMade(made: unknown, typeId: string | undefined): Promise<void> {
  if (!typeId || typeof made !== "string" || !made || madeOffline(made)) return
  await setTaskType(made, typeId)
}

/** The task a key ("Q4-12") names, for the task's own page. */
export async function resolveTask(ref: string): Promise<{ task_uuid: string; task_key: string }> {
  const res = await axiosInstance.get<{ data: { task_uuid: string; task_key: string } }>(`/task/resolve/${encodeURIComponent(ref)}`, OWN_ERRORS)
  return res.data.data
}

/** Whether raw reads as a task's key ("Q4-12", "q4-12"), as the server's Parse does. Pure. */
export const isTaskKey = (raw: string) => /^[A-Za-z][A-Za-z0-9]{1,4}-[1-9]\d{0,8}$/.test(raw.trim())
