/**
 * New places in a project's one order, into the project's cached lists and
 * board (L-1): a list in Manual order and each board column re-sort in place,
 * a list sorted by something else keeps its order and takes the ranks. Run
 * for a move at once (optimistic) and for everyone else when Task_Changed
 * brings the server's ranks. No request: what is cached changes. With the
 * app's store, the phone's list (kept there, page by page) changes too.
 */
import type { UnknownAction } from "@reduxjs/toolkit"
import { GetEndpointUrl } from "@/services/endPoints"
import { placeTasks, withRanks, type Ranked } from "@/lib/tasks/listOrder"
import { MANUAL_SORT, isManualSort } from "@/lib/tasks/manualSort"
import { clearProjectTask, updateProjectTaskList } from "@/store/slice/taskFilterSlice"
import type { RootState } from "@/store/store"
import type { TaskInfoInterface } from "@/types/task"

type Mutate = (key: string, update?: (current: unknown) => unknown, opts?: { revalidate: boolean }) => unknown
type Answer = { data?: Record<string, unknown> } | undefined
type Patches = Record<string, Partial<TaskInfoInterface>>

const COLUMNS = ["backlog", "todo", "in_progress", "in_review", "done", "canceled"].map((c) => `project_tasks_${c}`)

const isManual = (url: URL) => {
  try {
    return (JSON.parse(url.searchParams.get("sorting") || "[]") as { id: string }[])[0]?.id === MANUAL_SORT.id
  } catch {
    return false
  }
}

/** The app's store, for the phone's list. */
export interface RankStore {
  getState: () => RootState
  dispatch: (action: UnknownAction) => unknown
}

/** A drop made here: the moved tasks and the tasks directly above and below it. */
export type Place = { ids: readonly string[]; before: string; after: string }

/** A list in its new order: a drop's tasks where it was made (`place`), or a message's by their ranks. */
const reorder = <T extends Ranked>(tasks: T[], ranks: Record<string, number>, patches?: Record<string, Partial<T>>, place?: Place) =>
  place ? placeTasks(tasks, place, ranks, patches) : withRanks(tasks, ranks, patches)

/**
 * Gives `ranks` (and `patches`, a status a move changed) to every cached list
 * and board of the project, and the phone's list. With `place`, a drop made
 * here, the moved tasks go where it was made; without, a message's ranks
 * place them.
 */
export function rerankProjectCaches(keys: Iterable<string>, mutate: Mutate, projectId: string, ranks: Record<string, number>, patches?: Patches, store?: RankStore, place?: Place): void {
  if (!projectId || (!Object.keys(ranks).length && !patches)) return
  if (store) rerankPhoneList(store, projectId, ranks, patches, place)
  const board = `${GetEndpointUrl.GetProjectTaskListForKanban}/${projectId}`
  const list = `${GetEndpointUrl.GetProjectTaskList}/${projectId}`
  for (const key of keys) {
    if (typeof key !== "string") continue
    const url = new URL(key, "http://localhost")
    if (url.pathname === board) {
      // A status changed moves a card to another column: the board is read again.
      if (patches) void mutate(key)
      else void mutate(key, (a) => rerankColumns(a as Answer, ranks, place), { revalidate: false })
    } else if (url.pathname === list) {
      const manual = isManual(url)
      void mutate(
        key,
        (a) => {
          const answer = a as Answer
          const tasks = answer?.data?.project_tasks as TaskInfoInterface[] | undefined
          if (!answer?.data || !Array.isArray(tasks)) return answer
          const next = reorder(tasks, ranks, patches, place)
          const shown = manual ? next : keepOrder(tasks, next)
          return shown === tasks ? answer : { ...answer, data: { ...answer.data, project_tasks: shown } }
        },
        { revalidate: false },
      )
    }
  }
}

/** The phone's list of the project, in its order: re-sorted in Manual order, its tasks changed in place otherwise. */
function rerankPhoneList(store: RankStore, projectId: string, ranks: Record<string, number>, patches?: Patches, place?: Place) {
  const state = store.getState().taskFilter
  const list = state?.projectsTaskList?.[projectId]
  if (!list?.length) return
  const next = reorder(list, ranks, patches, place)
  const shown = isManualSort(state.projectsSortingAndFilter?.[projectId]?.sort ?? []) ? next : keepOrder(list, next)
  if (shown === list) return
  // Emptied and filled in one go: one render, in the new order.
  store.dispatch(clearProjectTask({ projectId }))
  store.dispatch(updateProjectTaskList({ projectId, tasks: shown }))
}

function rerankColumns(answer: Answer, ranks: Record<string, number>, place?: Place): Answer {
  if (!answer?.data) return answer
  let data: Record<string, unknown> | null = null
  for (const col of COLUMNS) {
    const tasks = answer.data[col]
    if (!Array.isArray(tasks)) continue
    const next = reorder(tasks as TaskInfoInterface[], ranks, undefined, place)
    if (next !== tasks) (data ??= { ...answer.data })[col] = next
  }
  return data ? { ...answer, data } : answer
}

/** next's tasks in prev's order: a list sorted by something else stays as it is. */
function keepOrder(prev: TaskInfoInterface[], next: TaskInfoInterface[]): TaskInfoInterface[] {
  if (next === prev) return prev
  const byId = new Map(next.map((t) => [t.task_uuid, t]))
  return prev.map((t) => byId.get(t.task_uuid) ?? t)
}
