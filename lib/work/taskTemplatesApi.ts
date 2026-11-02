import axiosInstance, { OWN_ERRORS } from "@/lib/axiosInstance"
import type { TaskTemplate, Typed } from "@/lib/work/taskTemplates"

/**
 * Task templates (linear-09, router/taskTemplates.go), out of
 * services/endPoints.ts as lib/work/keysApi.ts is. A project's list holds its
 * own templates and the workspace's; a task is made from either through the
 * project. Each call leaves its failure to its screen (OWN_ERRORS).
 */
export const taskTemplatesPath = (projectId?: string) => (projectId ? `/project/${projectId}/task-templates` : "/project/task-templates")

/** One template in full, to make a task from. */
export async function getTaskTemplate(projectId: string, id: string): Promise<TaskTemplate> {
  const res = await axiosInstance.get<{ data: TaskTemplate }>(`${taskTemplatesPath(projectId)}/${id}`, OWN_ERRORS)
  return res.data.data
}

/** A task made from a template: its id, how many sub-tasks came, and the presets left off by name. */
export interface Made {
  task_id: string
  subtasks: number
  left_off?: string[]
}

/** Made, or what the template still asks for (nothing was made). */
export type MakeResult = { made: Made } | { asks: { missing: string[]; leftOff: string[] } }

/**
 * Makes a task in the project from the template, with what the form shows
 * typed over it and its days counted in the maker's own zone. A refusal for
 * what the template asks for comes back as asks; any other failure throws.
 */
export async function makeFromTemplate(projectId: string, id: string, typed: Typed): Promise<MakeResult> {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    const res = await axiosInstance.post<{ data: Made }>(`${taskTemplatesPath(projectId)}/${id}/make`, { ...typed, tz }, OWN_ERRORS)
    return { made: res.data.data }
  } catch (err) {
    const asks = readAsks(err)
    if (asks) return { asks }
    throw err
  }
}

/** A make the server refused for what the template asks for (422 {missing, left_off}), or null for any other failure. */
export function readAsks(err: unknown): { missing: string[]; leftOff: string[] } | null {
  const res = (err as { response?: { status?: number; data?: { missing?: unknown; left_off?: unknown } } } | null)?.response
  if (res?.status !== 422 || !Array.isArray(res.data?.missing)) return null
  const strings = (v: unknown) => (Array.isArray(v) ? v.filter((s): s is string => typeof s === "string") : [])
  return { missing: strings(res.data.missing), leftOff: strings(res.data.left_off) }
}
