import { OWN_ERRORS } from "@/lib/http/ownErrors"
import { projectStatusesKey } from "@/lib/projectStatusesKey"
import type { OrderedStatuses } from "@/lib/statusOrder"
import type { TaskField } from "@/lib/tasks/fields"
import type { TaskTemplate, TemplateList } from "@/lib/work/taskTemplates"
import type { UserProfileDataInterface } from "@/types/user"

// taskTemplatesApi's path, written here as restoreService writes OWN_ERRORS: that module imports the shared client,
// which this lazy chunk mustn't, and moving the path out of it grows the create-task page's source past its line.
const taskTemplatesPath = (projectId?: string) => (projectId ? `/project/${projectId}/task-templates` : "/project/task-templates")

/**
 * Keeping task templates (linear-09, router/taskTemplates.go): a place's list, one template in full, and adding,
 * changing, deleting and restoring one. The server says who may (a project's admins, the workspace's admins).
 * No shared core: the manager is a lazy chunk, so http is the page's own client (LEAD-RULES 30 Oct 00:13), and
 * each call leaves its failure to its screen (OWN_ERRORS).
 */

/** The page's HTTP client, as the manager uses it. */
export interface KeepHttp {
  get<T>(path: string, config: typeof OWN_ERRORS): Promise<{ data: T }>
  post<T>(path: string, body: object, config: typeof OWN_ERRORS): Promise<{ data: T }>
}

/** What a keep sends: the template's name, what it's for, the type it is the default for (or ""), and its shape. */
export type Kept = Pick<TaskTemplate, "name" | "description" | "default_for" | "shape">

/** The calls for one place's templates, on the page's client. */
export function templateKeep(http: KeepHttp, projectId?: string) {
  const base = taskTemplatesPath(projectId)
  const one = (id: string) => `${base}/${encodeURIComponent(id)}`
  return {
    list: async () => (await http.get<{ data: TemplateList }>(base, OWN_ERRORS)).data.data,
    get: async (id: string) => (await http.get<{ data: TaskTemplate }>(one(id), OWN_ERRORS)).data.data,
    add: async (t: Kept) => (await http.post<{ data: TaskTemplate }>(base, t, OWN_ERRORS)).data.data,
    change: async (id: string, t: Kept) => (await http.post<{ data: TaskTemplate }>(one(id), t, OWN_ERRORS)).data.data,
    remove: (id: string) => http.post(`${one(id)}/delete`, {}, OWN_ERRORS),
    restore: (id: string) => http.post(`${one(id)}/restore`, {}, OWN_ERRORS),
  }
}

export type TemplateKeep = ReturnType<typeof templateKeep>

/** What the editor offers in a place: a project's fields, people and statuses (none for the workspace's), and the AI teammates. */
export interface PlaceLists {
  fields: TaskField[]
  people: UserProfileDataInterface[]
  teammates: UserProfileDataInterface[]
  statuses: OrderedStatuses | null
  /** A list didn't load: the editor says so, and what the template has stays. */
  partial: boolean
}

// The paths the page's own reads use (useProjectFields, useProjectMembers, the task panel's AI teammates), written
// here for the reason above; TaskTemplatesManager.test pins each to its shared constant.
export const placePaths = {
  fields: (projectId: string) => `/project/${projectId}/fields`,
  people: (projectId: string) => `/project/memberWithAdminFlag/${projectId}`,
  teammates: "/user/dm-ai-targets",
}

/** A place's lists for the editor, read once on the page's client; a list that fails reads as empty. */
export async function placeLists(http: KeepHttp, projectId?: string): Promise<PlaceLists> {
  let partial = false
  const read = async <T>(path: string, pick: (data: unknown) => T | undefined, none: T): Promise<T> => {
    try {
      return pick((await http.get<{ data: unknown }>(path, OWN_ERRORS)).data.data) ?? none
    } catch {
      partial = true
      return none
    }
  }
  const [fields, members, teammates, statuses] = await Promise.all([
    projectId ? read(placePaths.fields(projectId), (d) => (d as { fields?: TaskField[] } | null)?.fields, []) : [],
    projectId ? read(placePaths.people(projectId), (d) => (d as { project_members?: UserProfileDataInterface[] } | null)?.project_members, []) : [],
    read(placePaths.teammates, (d) => d as UserProfileDataInterface[] | undefined, []),
    projectId ? read<OrderedStatuses | null>(projectStatusesKey(projectId), (d) => d as OrderedStatuses | null, null) : null,
  ])
  // The project's people as the task panel lists them: an AI teammate is listed with the teammates.
  const people = members.filter((m) => m.user_uuid && !m.is_bot)
  return { fields, people, teammates: teammates.filter((t) => t.user_uuid), statuses, partial }
}

