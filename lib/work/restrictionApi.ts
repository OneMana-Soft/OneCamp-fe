import axiosInstance, { OWN_ERRORS } from "@/lib/axiosInstance"

/**
 * Who can see a task (WA2, router/projectsRestriction.go). These paths sit
 * here, not in services/endPoints.ts, which every route's first load carries
 * (app/firstLoad.test.ts): only the task panel's "Who can see" dialog reaches
 * this file. Each call leaves its failure to the dialog (OWN_ERRORS), which
 * says it through apiErrorMessage.
 */

/** A task's restriction, as the server answers it. */
export interface TaskRestriction {
  task_uuid: string
  restricted: boolean
  /** The people let in by name (user ids), beyond its project's admins, its assignee and its creator. */
  people: string[]
  restricted_by?: string
  restricted_at?: string
  /** The task above it it is restricted with, whose people are its people. */
  restricted_with?: string
  /** Whether the reader may restrict it or open it again. */
  can_change: boolean
}

export const restrictionPath = (taskRef: string) => `/task/${encodeURIComponent(taskRef)}/restriction`

/** Keeps a task to its project's admins, its assignee, its creator and people (replacing those named before), or opens it to its project again. */
export async function setRestriction(taskRef: string, restricted: boolean, people: string[] = []): Promise<TaskRestriction> {
  const res = await axiosInstance.put<{ data: TaskRestriction }>(restrictionPath(taskRef), { restricted, people: restricted ? people : [] }, OWN_ERRORS)
  return res.data.data
}
