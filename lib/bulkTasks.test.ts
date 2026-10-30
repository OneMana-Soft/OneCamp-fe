import { describe, expect, it } from "vitest"
import { bulkOp, bulkRequest, notDone, tagState } from "./bulkTasks"
import { BUILT_IN_STATUSES } from "./taskStatus"
import { PostEndpointUrl } from "@/services/endPoints"
import type { TaskInfoInterface } from "@/types/task"
import { pinTestClock } from "@/lib/testing/testClock"

pinTestClock()

const task = (extra: Partial<TaskInfoInterface> = {}) => ({ task_uuid: "t1", task_status: "todo", task_priority: "low", task_label: "", ...extra }) as TaskInfoInterface

describe("one change to many tasks", () => {
  it("moves a task, and leaves one already there alone", () => {
    const r = bulkRequest(task(), { field: "status", value: "done", options: BUILT_IN_STATUSES })
    expect(r?.endpoint).toBe(PostEndpointUrl.UpdateTaskStatus)
    expect(r?.payload).toEqual({ task_status: "done" })
    expect(r?.patch).toMatchObject({ task_status: "done", task_custom_status: "" })
    expect(bulkRequest(task({ task_status: "done" }), { field: "status", value: "done", options: BUILT_IN_STATUSES })).toBeNull()
  })

  it("treats a project's own status as the status it is", () => {
    const qa = { value: "s-qa", label: "QA", category: "in_review", custom: true } as never
    const r = bulkRequest(task(), { field: "status", value: "s-qa", options: [...BUILT_IN_STATUSES, qa] })
    expect(r?.patch).toMatchObject({ task_status: "in_review", task_custom_status: "s-qa", task_custom_status_name: "QA" })
    expect(bulkRequest(task({ task_status: "in_review", task_custom_status: "s-qa" }), { field: "status", value: "s-qa", options: [qa] })).toBeNull()
  })

  it("assigns and unassigns", () => {
    const maya = { user_uuid: "u-maya", user_name: "Maya" } as never
    expect(bulkRequest(task(), { field: "assignee", user: maya })?.payload).toEqual({ task_assignee_uuid: "u-maya" })
    expect(bulkRequest(task({ task_assignee: maya }), { field: "assignee", user: maya })).toBeNull()
    expect(bulkRequest(task({ task_assignee: maya }), { field: "assignee", user: null })?.payload).toEqual({ task_assignee_uuid: "" })
    expect(bulkRequest(task(), { field: "assignee", user: null })).toBeNull()
  })

  it("adds a tag where missing and removes it where present, ignoring case", () => {
    expect(bulkRequest(task({ task_label: "design" }), { field: "tags", tag: "Launch", add: true })?.payload).toEqual({ task_label: "design, Launch" })
    expect(bulkRequest(task({ task_label: "design, launch" }), { field: "tags", tag: "Launch", add: true })).toBeNull()
    expect(bulkRequest(task({ task_label: "design, launch" }), { field: "tags", tag: "LAUNCH", add: false })?.payload).toEqual({ task_label: "design" })
    const full = Array.from({ length: 10 }, (_, i) => `t${i}`).join(", ")
    expect(bulkRequest(task({ task_label: full }), { field: "tags", tag: "one more", add: true })).toBeNull()
  })

  it("sets a due date, takes it off, and leaves a task already due then alone (PTC-20)", () => {
    const due = "2026-10-20T00:00:00.000Z"
    const r = bulkRequest(task(), { field: "due", value: due })
    expect(r?.endpoint).toBe(PostEndpointUrl.UpdateTaskDueDate)
    expect(r?.payload).toEqual({ task_due_date: due })
    expect(r?.patch).toEqual({ task_due_date: due })
    // The server writes the same moment its own way.
    expect(bulkRequest(task({ task_due_date: "2026-10-20T00:00:00Z" }), { field: "due", value: due })).toBeNull()
    expect(bulkRequest(task({ task_due_date: due }), { field: "due", value: "" })?.payload).toEqual({ task_due_date: "" })
    // No date is no date, whichever way it is written.
    expect(bulkRequest(task({ task_due_date: "0001-01-01T00:00:00Z" }), { field: "due", value: "" })).toBeNull()
  })

  it("deletes a task off its lists, and brings back only one in the trash (PTC-20)", () => {
    const live = task({ task_deleted_at: "0001-01-01T00:00:00Z" })
    const trashed = task({ task_deleted_at: "2026-10-14T09:00:00Z" })
    const del = bulkRequest(live, { field: "delete" })
    expect(del?.endpoint).toBe(PostEndpointUrl.ArchiveTask)
    expect(del?.removes).toBe(true)
    expect(bulkRequest(trashed, { field: "delete" })).toBeNull()
    const back = bulkRequest(trashed, { field: "restore" })
    expect(back?.endpoint).toBe(PostEndpointUrl.UnArchiveTask)
    expect(back?.removes).toBeFalsy()
    expect(bulkRequest(live, { field: "restore" })).toBeNull()
  })

  it("moves tasks into a cycle or back to the backlog in one request, the server answering the ones already there", () => {
    expect(bulkRequest(task(), { field: "cycle", value: "c-4" })).toMatchObject({ payload: { cycle_id: "c-4" }, patch: {} })
    expect(bulkOp({ field: "cycle", value: "c-4" })).toEqual({ op: "cycle", value: "c-4" })
    expect(bulkOp({ field: "cycle", value: "" })).toEqual({ op: "cycle", value: "" })
  })

  it("puts tasks in a milestone or takes them out in one request, as POST /task/bulk's milestone op", () => {
    expect(bulkRequest(task(), { field: "milestone", value: "m-2" })).toMatchObject({ endpoint: "/task/milestone", payload: { milestone_id: "m-2" }, patch: {} })
    expect(bulkOp({ field: "milestone", value: "m-2" })).toEqual({ op: "milestone", value: "m-2" })
    expect(bulkOp({ field: "milestone", value: "" })).toEqual({ op: "milestone", value: "" })
  })

  it("says what a change to many tasks didn't do, in words that agree", () => {
    expect(notDone(1, 0, "deleted")).toBe("The task wasn't deleted")
    expect(notDone(3, 0, "changed")).toBe("None of the 3 tasks were changed")
    expect(notDone(1, 2, "changed")).toBe("1 of 3 tasks wasn't changed")
    expect(notDone(2, 3, "deleted")).toBe("2 of 5 tasks weren't deleted")
  })

  it("says whether all, some or none of the tasks have a tag", () => {
    const ts = [task({ task_label: "a, b" }), task({ task_label: "b" })]
    expect(tagState(ts, "B")).toBe("all")
    expect(tagState(ts, "a")).toBe("some")
    expect(tagState(ts, "c")).toBe("none")
  })
})
