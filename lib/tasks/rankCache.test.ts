import { describe, expect, it, vi } from "vitest"

import { rerankProjectCaches } from "@/lib/tasks/rankCache"
import type { TaskInfoInterface } from "@/types/task"
import { pinTestClock } from "@/lib/testing/testClock"

// The dates here are tasks' creation times, never read against today; the clock is pinned all the same.
pinTestClock()

type Task = TaskInfoInterface & { task_rank?: number }
const t = (id: string, rank: number, extra: Partial<TaskInfoInterface> = {}) => ({ task_uuid: id, task_rank: rank, task_status: "todo", task_created_at: "2026-10-01T09:00:00Z", ...extra }) as unknown as Task
const ids = (ts: Task[]) => ts.map((x) => x.task_uuid)
const MANUAL = `/project/taskList/p?sorting=${encodeURIComponent(JSON.stringify([{ id: "task_rank", desc: false }]))}&pageSize=500&pageIndex=0`
const BY_DUE = `/project/taskList/p?sorting=${encodeURIComponent(JSON.stringify([{ id: "task_due_date", desc: false }]))}&pageSize=500&pageIndex=0`
const BOARD = "/project/taskListForKanban/p"

/** A cache of answers, and a mutate that applies an updater to it, as SWR's would. */
function cacheOf(entries: Record<string, unknown>) {
  const data = new Map(Object.entries(entries))
  const mutate = vi.fn((key: string, update?: (current: unknown) => unknown) => {
    if (update) data.set(key, update(data.get(key)))
    return Promise.resolve(undefined)
  })
  return { data, mutate, keys: () => [...data.keys()] }
}

describe("a project's caches take new ranks and re-sort in place (live Task_Changed, an optimistic move)", () => {
  it("re-sorts a list in Manual order and leaves a list sorted by something else in its order", () => {
    const list = { data: { project_tasks: [t("a", 1024), t("b", 2048), t("c", 3072)] } }
    const due = { data: { project_tasks: [t("a", 1024), t("b", 2048), t("c", 3072)] } }
    const c = cacheOf({ [MANUAL]: list, [BY_DUE]: due })
    rerankProjectCaches(c.keys(), c.mutate, "p", { c: 1536 })
    expect(ids((c.data.get(MANUAL) as typeof list).data.project_tasks)).toEqual(["a", "c", "b"])
    const byDue = (c.data.get(BY_DUE) as typeof due).data.project_tasks
    expect(ids(byDue)).toEqual(["a", "b", "c"])
    expect(byDue[2].task_rank).toBe(1536)
  })

  it("re-sorts a board's columns, and leaves other projects' lists alone", () => {
    const board = { data: { project_tasks_todo: [t("a", 1), t("b", 2)], project_tasks_done: [t("d", 1)] } }
    const other = { data: { project_tasks: [t("a", 1)] } }
    const c = cacheOf({ [BOARD]: board, "/project/taskList/q?pageSize=500&pageIndex=0": other })
    rerankProjectCaches(c.keys(), c.mutate, "p", { a: 3 })
    expect(ids((c.data.get(BOARD) as typeof board).data.project_tasks_todo)).toEqual(["b", "a"])
    expect(c.mutate).toHaveBeenCalledTimes(1)
  })

  it("puts a drop where it was made, in a list whose order its ranks don't explain", () => {
    // Created in no order the list follows, never moved: only the dropped task may move.
    const list = { data: { project_tasks: [t("a", 0, { task_created_at: "2026-10-01T09:00:00Z" }), t("b", 0, { task_created_at: "2026-10-05T09:00:00Z" }), t("c", 0, { task_created_at: "2026-10-03T09:00:00Z" })] } }
    for (const x of list.data.project_tasks) delete x.task_rank
    const c = cacheOf({ [MANUAL]: list })
    rerankProjectCaches(c.keys(), c.mutate, "p", { a: 1 }, undefined, undefined, { ids: ["a"], before: "b", after: "c" })
    expect(ids((c.data.get(MANUAL) as typeof list).data.project_tasks)).toEqual(["b", "a", "c"])
  })

  it("takes a moved task's new status too, in the list", () => {
    const list = { data: { project_tasks: [t("a", 1), t("b", 2)] } }
    const c = cacheOf({ [MANUAL]: list })
    rerankProjectCaches(c.keys(), c.mutate, "p", { a: 3 }, { a: { task_status: "done", task_custom_status: "", task_custom_status_name: "" } })
    const now = (c.data.get(MANUAL) as typeof list).data.project_tasks
    expect(ids(now)).toEqual(["b", "a"])
    expect(now[1].task_status).toBe("done")
  })
})

describe("the phone's list, kept in the app's store", () => {
  const storeOf = (list: Task[], sort: { id: string; desc: boolean }[] = []) => {
    const actions: { type: string; payload: { tasks?: Task[] } }[] = []
    const state = { taskFilter: { projectsTaskList: { p: list }, projectsSortingAndFilter: { p: { sort, filters: [] } } } }
    return { actions, store: { getState: () => state as never, dispatch: (a: unknown) => actions.push(a as (typeof actions)[number]) } }
  }

  it("re-sorts in Manual order, in one go", () => {
    const { actions, store } = storeOf([t("a", 1), t("b", 2), t("c", 3)])
    rerankProjectCaches([], vi.fn(), "p", { a: 2.5 }, undefined, store)
    expect(actions.map((a) => a.type)).toEqual(["taskFilter/clearProjectTask", "taskFilter/updateProjectTaskList"])
    expect(ids(actions[1].payload.tasks!)).toEqual(["b", "a", "c"])
  })

  it("keeps its order when sorted by something else, and leaves another project's alone", () => {
    const { actions, store } = storeOf([t("a", 1), t("b", 2)], [{ id: "task_due_date", desc: false }])
    rerankProjectCaches([], vi.fn(), "p", { a: 3 }, undefined, store)
    expect(ids(actions[1].payload.tasks!)).toEqual(["a", "b"])
    const other = storeOf([t("a", 1)])
    rerankProjectCaches([], vi.fn(), "q", { a: 3 }, undefined, other.store)
    expect(other.actions).toEqual([])
  })
})
