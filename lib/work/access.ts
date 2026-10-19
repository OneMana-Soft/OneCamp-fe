// What someone may do in a project, as the server says (Work Access:
// project_access, task_access); from a server before roles, its rule. Pure.
import type { ProjectLike, TaskLike, WorkAccess } from "@/lib/work/types"

const access = (role: WorkAccess["role"], reads: boolean, runs: boolean, steward = runs): WorkAccess => ({
  role,
  view: reads,
  comment: reads,
  create_tasks: runs,
  edit_tasks: runs ? "all" : "none",
  delete_tasks: runs ? "all" : "none",
  log_time: reads,
  post_updates: runs,
  add_files: runs,
  manage: runs,
  manage_people: steward,
  archive: steward,
})

export const NO_ACCESS = access("", false, false)

export function accessOf(p?: ProjectLike | null): WorkAccess {
  if (!p) return NO_ACCESS
  if (p.project_access) return { ...NO_ACCESS, ...p.project_access }
  if (p.project_is_admin) return access("admin", true, true)
  return access(p.project_is_member ? "member" : "", !!p.project_is_member, false, !!p.project_team?.team_is_admin)
}

// A list's tasks don't carry their project's access: the page's project does.
const accessFor = (t: TaskLike, p?: ProjectLike | null) => accessOf(t.task_project?.project_access || !p ? t.task_project : p)

/**
 * Whether the reader may comment on t: the task's own answer when it carries
 * one, else its project's role (a commenter or above may; a viewer may not).
 */
export function canCommentTask(t?: TaskLike | null, p?: ProjectLike | null): boolean {
  if (!t) return false
  if (t.task_access) return t.task_access.comment
  return accessFor(t, p).comment
}

/** Whether the reader (me) may change t. */
export function canEditTask(t?: TaskLike | null, me?: string, p?: ProjectLike | null): boolean {
  if (!t) return false
  if (t.task_access) return t.task_access.edit
  const e = accessFor(t, p).edit_tasks
  return e === "all" || (e === "assigned" && !!me && t.task_assignee?.user_uuid === me)
}
