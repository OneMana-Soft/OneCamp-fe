import { accessOf } from "@/lib/work/access"
import type { ProjectLike, TaskLike } from "@/lib/work/types"

/** Whether the reader (me) may delete or restore t: its task_access, else its project's. Pure. */
export function canDeleteTask(t?: TaskLike | null, me?: string, p?: ProjectLike | null): boolean {
  if (!t) return false
  if (t.task_access) return t.task_access.delete
  const d = accessOf(t.task_project?.project_access || !p ? t.task_project : p).delete_tasks
  return d === "all" || (d === "own" && !!me && t.task_created_by?.user_uuid === me)
}
