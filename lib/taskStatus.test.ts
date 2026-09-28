import { describe, expect, it } from "vitest"
import { columnsByStatus, statusOptionOf, statusOptions, statusPatch, statusValueOf, type ProjectStatuses, statusFieldsFromMessage, holdsProjectTasks, isClosedStatus } from "./taskStatus"

const project: ProjectStatuses = {
  built_in: [],
  colors: [],
  max: 20,
  custom: [
    { id: "qa", project_id: "p", name: "QA", category: "inReview", color: "violet", position: 1 },
    { id: "blk", project_id: "p", name: "Blocked", category: "inProgress", color: "red", position: 0 },
    { id: "legal", project_id: "p", name: "Legal", category: "inReview", color: "amber", position: 0 },
  ],
}

describe("statusOptions", () => {
  it("puts each custom status after the built-in one it counts as, in the admins' order", () => {
    expect(statusOptions(project).map((o) => o.value)).toEqual([
      "backlog", "todo", "inProgress", "blk", "inReview", "legal", "qa", "done", "canceled",
    ])
  })
  it("is the six built-in statuses without a project", () => {
    expect(statusOptions().map((o) => o.value)).toEqual(["backlog", "todo", "inProgress", "inReview", "done", "canceled"])
  })
  it("gives a custom status its colour and its category's icon", () => {
    const qa = statusOptions(project).find((o) => o.value === "qa")!
    expect(qa).toMatchObject({ label: "QA", category: "inReview", custom: true, swatch: "violet" })
    expect(qa.color).toContain("violet")
    expect(qa.icon).toBe(statusOptions().find((o) => o.value === "inReview")!.icon)
  })
})

describe("a task's status", () => {
  const options = statusOptions(project)
  it("is its custom status when it has one", () => {
    const t = { task_status: "inReview", task_custom_status: "qa", task_custom_status_name: "QA" }
    expect(statusValueOf(t)).toBe("qa")
    expect(statusOptionOf(t, options)?.label).toBe("QA")
  })
  it("is its built-in status otherwise", () => {
    expect(statusOptionOf({ task_status: "done" }, options)?.label).toBe("Done")
  })
  it("still reads by name where the project's statuses are unknown (My Tasks)", () => {
    const t = { task_status: "inReview", task_custom_status: "qa", task_custom_status_name: "QA" }
    expect(statusOptionOf(t)).toMatchObject({ label: "QA", category: "inReview" })
  })
})

describe("statusPatch", () => {
  const options = statusOptions(project)
  it("into a custom status sets its category and itself", () => {
    expect(statusPatch("qa", options)).toEqual({ task_status: "inReview", task_custom_status: "qa", task_custom_status_name: "QA" })
  })
  it("into a built-in status clears the custom one", () => {
    expect(statusPatch("done", options)).toEqual({ task_status: "done", task_custom_status: "", task_custom_status_name: "" })
  })
})

describe("columnsByStatus", () => {
  const options = statusOptions(project)
  it("gives each custom status its own column and keeps the rest with their category", () => {
    const cols = columnsByStatus(
      {
        inReview: [
          { id: 1, task_status: "inReview", task_custom_status: "qa" },
          { id: 2, task_status: "inReview" },
          { id: 3, task_status: "inReview", task_custom_status: "legal" },
          { id: 4, task_status: "inReview", task_custom_status: "gone" },
        ],
        todo: [{ id: 5, task_status: "todo" }],
      },
      options,
    )
    expect(cols.qa.map((t) => t.id)).toEqual([1])
    expect(cols.legal.map((t) => t.id)).toEqual([3])
    // A status this view does not know (deleted meanwhile) stays with its category.
    expect(cols.inReview.map((t) => t.id)).toEqual([2, 4])
    expect(cols.todo.map((t) => t.id)).toEqual([5])
    expect(cols.blk).toEqual([])
  })
})

describe("statusFieldsFromMessage", () => {
  it("carries a custom status from a live update", () => {
    expect(statusFieldsFromMessage({ status: "inReview", custom_status: "qa-id", custom_status_name: "QA" })).toEqual({
      task_status: "inReview",
      task_custom_status: "qa-id",
      task_custom_status_name: "QA",
    })
  })
  it("clears the custom status when the update says none", () => {
    expect(statusFieldsFromMessage({ status: "done", custom_status: "", custom_status_name: "stale" })).toEqual({
      task_status: "done",
      task_custom_status: "",
      task_custom_status_name: "",
    })
  })
  it("leaves older messages, which name only a status, to the built-in rule", () => {
    expect(statusFieldsFromMessage({ status: "done" })).toBeUndefined()
    expect(statusFieldsFromMessage({})).toBeUndefined()
  })
})

describe("holdsProjectTasks", () => {
  it("matches this project's board and list, assigned lists and task panels", () => {
    expect(holdsProjectTasks("/project/taskListForKanban/p1?assignee=", "p1")).toBe(true)
    expect(holdsProjectTasks("/project/taskList/p1", "p1")).toBe(true)
    expect(holdsProjectTasks("/user/assignedTaskListForKanban?x=1", "p1")).toBe(true)
    expect(holdsProjectTasks("/task/info/t1", "p1")).toBe(true)
  })
  it("leaves other projects, other data and non-string keys alone", () => {
    expect(holdsProjectTasks("/project/taskListForKanban/p2", "p1")).toBe(false)
    expect(holdsProjectTasks("/project/p1/statuses", "p1")).toBe(false)
    expect(holdsProjectTasks("/channel/list", "p1")).toBe(false)
    expect(holdsProjectTasks(["/task/info", "t1"], "p1")).toBe(false)
    expect(holdsProjectTasks("/task/info/t1", "")).toBe(false)
  })
})

describe("isClosedStatus", () => {
  it("is done and canceled, so neither is ever overdue", () => {
    expect(isClosedStatus("done")).toBe(true)
    expect(isClosedStatus("canceled")).toBe(true)
    for (const s of ["backlog", "todo", "inProgress", "inReview", "", undefined]) expect(isClosedStatus(s)).toBe(false)
  })
})
