// The bulk change itself (PR2): loaded on first use, so a list's first screen
// carries only the hook (hooks/useBulkTaskUpdate).
import axiosInstance, { OWN_ERRORS } from "@/lib/axiosInstance"
import { appMutate } from "@/lib/swrMutate"
import { bulkOp, bulkRequest, type BulkChange } from "@/lib/bulkTasks"
import { BACKLOG, backlogPath, measureOf, moveTasks, type BacklogAnswer } from "@/lib/work/backlog"
import { milestonesPath, taskMilestonePath } from "@/lib/work/milestones"
import { settleLimited } from "@/lib/utils/settleLimited"
import { GetEndpointUrl } from "@/services/endPoints"
import type { TaskInfoInterface } from "@/types/task"
import type { BulkDeps, BulkResult } from "@/hooks/useBulkTaskUpdate"

/** One request for the lot (PR2), as each task's outcome. */
async function bulkPost(ids: string[], op: object): Promise<PromiseSettledResult<unknown>[]> {
  try {
    const res = await axiosInstance.post<{ data?: { refused?: { task_uuid: string; msg: string }[] } }>("/task/bulk", { task_uuids: ids, ...op }, OWN_ERRORS)
    const no = new Map((res.data.data?.refused ?? []).map((r) => [r.task_uuid.toLowerCase(), r.msg]))
    return ids.map((id) => (no.has(id.toLowerCase()) ? { status: "rejected", reason: new Error(no.get(id.toLowerCase())) } : { status: "fulfilled", value: null }))
  } catch (reason) {
    return ids.map(() => ({ status: "rejected", reason }))
  }
}

/** Requests at a time: enough to be quick, few enough to leave the server room. */
const AT_ONCE = 4

export async function applyBulk(deps: BulkDeps, listProjectId: string | undefined, tasks: TaskInfoInterface[], change: BulkChange): Promise<BulkResult> {
  const { optimisticUpdateTask, optimisticDeleteTask, revalidateTaskKeys } = deps
  const work = tasks.flatMap((task) => {
    const request = bulkRequest(task, change)
    const project = task.task_project?.project_uuid || listProjectId
    return request && project ? [{ task, request, project }] : []
  })
  for (const w of work) {
    if (w.request.removes) optimisticDeleteTask(w.task.task_uuid, w.project)
    else optimisticUpdateTask({ task_uuid: w.task.task_uuid, ...w.request.patch }, w.project)
  }
  // Which cycle a task is in is drawn by the project's backlog, not by a task's copy in a list.
  const backlog = change.field === "cycle" && listProjectId ? { key: backlogPath(listProjectId), to: change.value || BACKLOG } : null
  if (backlog) {
    const ids = work.map((w) => w.task.task_uuid)
    await appMutate<BacklogAnswer>(
      backlog.key,
      (a) => {
        const moved = a && moveTasks(a.data.backlog, ids, backlog.to, measureOf(a.data.backlog))
        return moved ? { ...a, data: { ...a.data, backlog: moved } } : a
      },
      { revalidate: false },
    )
  }
  const op = bulkOp(change)
  const results = op && work.length > 0 ? await bulkPost(work.map((w) => w.task.task_uuid), op) : await settleLimited(work, AT_ONCE, (w) =>
    axiosInstance.post(w.request.endpoint, { task_uuid: w.task.task_uuid, task_project_uuid: w.project, ...w.request.payload }, OWN_ERRORS),
  )
  const refused = work.filter((_, i) => results[i].status === "rejected")
  const saved = work.filter((_, i) => results[i].status === "fulfilled")
  // Refused ones are read again, as are tasks back from the trash (their
  // lists have no copy of them to change) and tasks moved between cycles (a
  // list filtered by cycle drops or gains them). The backlog is read again too.
  const reread = change.field === "restore" || change.field === "cycle" ? [...refused, ...saved] : refused
  for (const project of new Set(reread.map((w) => w.project))) revalidateTaskKeys(project)
  if (backlog) void appMutate(backlog.key)
  // A milestone's progress counts its tasks: the projects' milestones are read again.
  if (change.field === "milestone") for (const project of new Set(work.map((w) => w.project))) void appMutate(milestonesPath(project))
  // A task open in the panel shows its new status, assignee, tags or milestone too.
  const opened = new Set(
    work.flatMap((w) => [`${GetEndpointUrl.GetTaskInfo}/${w.task.task_uuid}`, ...(change.field === "milestone" ? [taskMilestonePath(w.task.task_uuid)] : [])]),
  )
  void appMutate((key) => typeof key === "string" && opened.has(key))
  const error = results.find((r): r is PromiseRejectedResult => r.status === "rejected")?.reason
  return { changed: saved.length, failed: refused.length, unchanged: tasks.length - work.length, done: saved.map((w) => w.task), error }
}
