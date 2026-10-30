/**
 * THE LIST'S ORDER (L-1): a project keeps one manual order, task_rank
 * (backend business/TaskRank), that the list's Manual sort and the board's
 * columns both show. A drag or Alt+↑/↓ names the tasks directly above and
 * below the drop in that order; the server gives the moved tasks ranks
 * between theirs. Pure, for its tests; no React and no @dnd-kit.
 */
import type { TaskInfoInterface } from "@/types/task"

export { MANUAL_SORT, isManualSort, requestSorting } from "@/lib/tasks/manualSort"

/** The gap the server leaves between ranks at an end (TaskRank Step). */
export const RANK_STEP = 1024

/** A task as the order reads it: task_rank comes with the project's lists (none until the task is first moved). */
export type Ranked = Pick<TaskInfoInterface, "task_uuid" | "task_created_at"> & { task_rank?: number }

const createdMs = (t: Ranked) => {
  const ms = Date.parse(t.task_created_at ?? "")
  return Number.isNaN(ms) ? 0 : ms
}

/** The rank a task sorts by: its own, or, never moved, minus its creation time in ms (newest first, before ranked ones near 0). */
export function effectiveRank(t: Ranked): number {
  return typeof t.task_rank === "number" ? t.task_rank : -createdMs(t)
}

/** The server's order (TaskRank less): rank, then newest, then id. */
export function byRank(a: Ranked, b: Ranked): number {
  const ra = effectiveRank(a)
  const rb = effectiveRank(b)
  if (ra !== rb) return ra - rb
  const ca = createdMs(a)
  const cb = createdMs(b)
  if (ca !== cb) return cb - ca
  return a.task_uuid < b.task_uuid ? -1 : a.task_uuid > b.task_uuid ? 1 : 0
}

/** The tasks in the project's order; the same array when they already are, so nothing renders again. */
export function sortByRank<T extends Ranked>(tasks: T[]): T[] {
  for (let i = 1; i < tasks.length; i++) if (byRank(tasks[i - 1], tasks[i]) > 0) return [...tasks].sort(byRank)
  return tasks
}

/** A task with its new rank and patch, if either names it; otherwise itself. */
function changed<T extends Ranked>(t: T, ranks: Record<string, number>, patches?: Record<string, Partial<T>>): T {
  const r = ranks[t.task_uuid]
  const p = patches?.[t.task_uuid]
  return r === undefined && !p ? t : { ...t, ...p, ...(r === undefined ? {} : { task_rank: r }) }
}

/**
 * The tasks with new ranks (a Task_Changed message's) and patches: only the
 * tasks the ranks name move, each in front of the first task that sorts
 * after it, and every other task keeps its place and its object. No whole
 * re-sort: a list in the server's order comes out sorted, and a list its
 * ranks don't explain is not reshuffled. The same array when none of them is
 * here.
 */
export function withRanks<T extends Ranked>(tasks: T[], ranks: Record<string, number>, patches?: Record<string, Partial<T>>): T[] {
  let any = false
  const moved: T[] = []
  const rest: T[] = []
  for (const t of tasks) {
    const next = changed(t, ranks, patches)
    if (next !== t) any = true
    if (ranks[t.task_uuid] !== undefined) moved.push(next)
    else rest.push(next)
  }
  if (!any) return tasks
  for (const m of moved.sort(byRank)) {
    const at = rest.findIndex((x) => byRank(x, m) > 0)
    rest.splice(at < 0 ? rest.length : at, 0, m)
  }
  return rest
}

/**
 * A drop on screen, before the server answers: the moved tasks, in their
 * order, right after the task above the drop or else right before the task
 * below it, with their new ranks and patches; nothing else moves. A list
 * (a page) holding neither neighbour keeps its tasks where they are, changed
 * in place. The same array when none of the moved tasks is here.
 */
export function placeTasks<T extends Ranked>(tasks: T[], place: { ids: readonly string[]; before: string; after: string }, ranks: Record<string, number>, patches?: Record<string, Partial<T>>): T[] {
  const moving = new Set(place.ids)
  const found = new Map<string, T>()
  const rest: T[] = []
  for (const t of tasks) {
    if (moving.has(t.task_uuid)) found.set(t.task_uuid, changed(t, ranks, patches))
    else rest.push(t)
  }
  if (!found.size) return tasks
  const after = place.before ? rest.findIndex((t) => t.task_uuid === place.before) : -1
  const at = after >= 0 ? after + 1 : place.after ? rest.findIndex((t) => t.task_uuid === place.after) : -1
  if (at < 0) return tasks.map((t) => found.get(t.task_uuid) ?? t)
  rest.splice(at, 0, ...place.ids.flatMap((id) => found.get(id) ?? []))
  return rest
}

/** n ranks, in order, for tasks dropped between ranks lo and hi (null at an end), as the server spaces them (TaskRank BetweenMany). */
export function ranksBetween(lo: number | null, hi: number | null, n: number): number[] {
  return Array.from({ length: n }, (_, i) =>
    lo === null && hi === null ? i * RANK_STEP : lo === null ? hi! - (n - i) * RANK_STEP : hi === null ? lo + (i + 1) * RANK_STEP : lo + ((hi - lo) * (i + 1)) / (n + 1),
  )
}

/**
 * Where a drop lands, as the tasks directly above and below it in the
 * project's order ("" at an end). `flat` is the list's tasks in that order,
 * `group` the tasks of the group dropped into, `index` the place among the
 * group's tasks that aren't moving. At a group's top the task above is
 * whatever precedes its first task in the project; at its foot, whatever
 * follows its last. A moving task is never its own neighbour.
 */
export function dropPlace({ flat, group, index, moving }: { flat: string[]; group: string[]; index: number; moving: readonly string[] }): { before: string; after: string } {
  const out = new Set(moving)
  const rest = group.filter((id) => !out.has(id))
  const others = flat.filter((id) => !out.has(id))
  const near = (id: string, by: -1 | 1) => others[others.indexOf(id) + by] ?? ""
  if (rest.length === 0) return { before: "", after: "" }
  if (index <= 0) return { before: others.includes(rest[0]) ? near(rest[0], -1) : "", after: rest[0] }
  const before = rest[Math.min(index, rest.length) - 1]
  return { before, after: index < rest.length ? rest[index] : others.includes(before) ? near(before, 1) : "" }
}

/** Alt+↑/↓: the place among the group's other tasks the moving ones go to, one step on; null at an end. A selection moves as one block. */
export function stepPlace({ group, moving, by }: { group: string[]; moving: readonly string[]; by: -1 | 1 }): number | null {
  const out = new Set(moving)
  const at = group.map((id, i) => (out.has(id) ? i : -1)).filter((i) => i >= 0)
  if (!at.length) return null
  const restBefore = (i: number) => group.slice(0, i).filter((id) => !out.has(id)).length
  const rest = group.length - at.length
  if (by < 0) {
    const p = restBefore(at[0])
    return p > 0 ? p - 1 : null
  }
  const p = restBefore(at[at.length - 1])
  return p < rest ? p + 1 : null
}

/** One request for one task: between before and after, with a status when it changes group. */
export interface RankMove {
  task_uuid: string
  before: string
  after: string
  status?: string
}

/**
 * Tasks moved together, as the one-task requests that move them until the
 * bulk writer lands: the first between the drop's neighbours, each next
 * right after the one before it.
 */
export function chainMoves(ids: readonly string[], before: string, after: string, status?: Record<string, string>): RankMove[] {
  return ids.map((id, i) => ({ task_uuid: id, before: i === 0 ? before : ids[i - 1], after, ...(status?.[id] ? { status: status[id] } : {}) }))
}

/** A move: tasks, in their order, between two others ("" at an end), each with the status it takes, if any. */
export interface MovePlan {
  ids: string[]
  before: string
  after: string
  status?: Record<string, string>
}

/**
 * What puts moved tasks back: each run of them that sat together goes back
 * between its old neighbours (the tasks around it that didn't move), with
 * the statuses they had. `flat` is the order before the move.
 */
export function undoRuns(flat: readonly string[], moved: readonly string[], status: Record<string, string> = {}): Required<MovePlan>[] {
  const out = new Set(moved)
  const runs: Required<MovePlan>[] = []
  let run: string[] = []
  let before = ""
  const close = (after: string) => {
    if (!run.length) return
    runs.push({ ids: run, before, after, status: Object.fromEntries(run.filter((id) => status[id]).map((id) => [id, status[id]])) })
    run = []
  }
  for (const id of flat) {
    if (out.has(id)) run.push(id)
    else {
      close(id)
      before = id
    }
  }
  close("")
  return runs
}
