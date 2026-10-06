import { describe, expect, it } from "vitest"
import { bulkRequest, tagState } from "./bulkTasks"
import { BUILT_IN_STATUSES } from "./taskStatus"
import { PostEndpointUrl } from "@/services/endPoints"
import type { TaskInfoInterface } from "@/types/task"

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

  it("says whether all, some or none of the tasks have a tag", () => {
    const ts = [task({ task_label: "a, b" }), task({ task_label: "b" })]
    expect(tagState(ts, "B")).toBe("all")
    expect(tagState(ts, "a")).toBe("some")
    expect(tagState(ts, "c")).toBe("none")
  })
})
