import { describe, expect, it } from "vitest"
import { withNewTask } from "@/lib/tasks/taskLists"
import { GetEndpointUrl } from "@/services/endPoints"
import type { TaskInfoInterface } from "@/types/task"

// One function puts a new task on the lists, for the screens' cache
// (hooks/useTaskUpdate) and for the Offline Store's answers (lib/offline).

const made = (more: Record<string, unknown> = {}) =>
  ({ task_uuid: "n1", task_name: "Book the venue", task_status: "todo", task_priority: "medium", task_project: { project_uuid: "p1" }, task_assignee: { user_uuid: "ann" }, ...more }) as unknown as TaskInfoInterface
const ids = (list: unknown) => (list as { task_uuid: string }[]).map((t) => t.task_uuid)

const LIST = `${GetEndpointUrl.GetProjectTaskList}/p1?pageSize=50&pageIndex=0`
const BOARD = `${GetEndpointUrl.GetProjectTaskListForKanban}/p1`
const MINE = `${GetEndpointUrl.GetUserTaskList}?pageSize=50&pageIndex=0`
const MY_BOARD = GetEndpointUrl.GetUserTaskListForKanban

describe("a new task on the list a key reads", () => {
  it("goes at the top of its project's list, counted, and of its status's column on the board", () => {
    const list = withNewTask(LIST, { data: { project_tasks: [{ task_uuid: "t1" }], project_task_count: 1 } }, made())
    expect(ids(list.data?.project_tasks)).toEqual(["n1", "t1"])
    expect(list.data?.project_task_count).toBe(2)
    const counts = { todo: 1, inProgress: 0, done: 4 }
    const board = withNewTask(BOARD, { data: { project_tasks_todo: [{ task_uuid: "t1" }], project_tasks_in_progress: [], project_column_counts: counts } }, made())
    expect(ids(board.data?.project_tasks_todo)).toEqual(["n1", "t1"])
    expect(board.data?.project_tasks_in_progress).toEqual([])
    // The column's count counts it (the server's own isn't changed in place).
    expect(board.data?.project_column_counts).toEqual({ todo: 2, inProgress: 0, done: 4 })
    expect(counts.todo).toBe(1)
    // A closed column's own count too.
    const done = withNewTask(BOARD, { data: { project_tasks_done: [], project_tasks_done_count: 4, project_column_counts: counts } }, made({ task_status: "done" }))
    expect(done.data).toMatchObject({ project_tasks_done_count: 5, project_column_counts: { done: 5 } })
  })

  it("leaves another project's list, a later page and a filter it doesn't match as they are", () => {
    const byPriority = `${LIST}&filters=${encodeURIComponent(JSON.stringify([{ id: "task_priority", value: ["high"] }]))}`
    for (const key of [`${GetEndpointUrl.GetProjectTaskList}/p2?pageIndex=0`, `${GetEndpointUrl.GetProjectTaskList}/p1?pageIndex=1`, byPriority]) {
      const answer = { data: { project_tasks: [{ task_uuid: "t1" }] } }
      expect(withNewTask(key, answer, made()), key).toBe(answer)
    }
  })

  it("joins My Tasks only as the member's own, when the member is named", () => {
    const list = { data: { user_tasks: [], user_task_count: 0 } }
    expect(ids(withNewTask(MINE, list, made(), { member: "ann" }).data?.user_tasks)).toEqual(["n1"])
    expect(withNewTask(MINE, list, made(), { member: "bob" })).toBe(list)
    const board = { data: { user_tasks_todo: [] } }
    expect(ids(withNewTask(MY_BOARD, board, made(), { member: "ann" }).data?.user_tasks_todo)).toEqual(["n1"])
    expect(withNewTask(MY_BOARD, board, made({ task_assignee: undefined }), { member: "ann" })).toBe(board)
  })

  it("is added once: a list that has it already is left as it is", () => {
    const answer = { data: { project_tasks: [{ task_uuid: "n1" }] } }
    expect(withNewTask(LIST, answer, made())).toBe(answer)
  })
})
