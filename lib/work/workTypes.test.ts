import { describe, expect, it } from "vitest"
import type { TaskWorkType } from "@/types/task"
import { PLAIN_TASK, compareTypes, typeKey, typeOf } from "./workTypes"

const bug: TaskWorkType = { id: "wt-bug", builtin: "bug", name: "Bug", icon: "bug" }
const bugElsewhere: TaskWorkType = { id: "wt-bug-2", builtin: "bug", name: "Bug", icon: "bug" }
const request: TaskWorkType = { id: "wt-req", builtin: "request", name: "Request", icon: "request" }
const task: TaskWorkType = { id: "wt-task", builtin: "task", name: "Task", icon: "task" }
const spike: TaskWorkType = { id: "wt-spike", name: "Spike", icon: "flask" }
const alpha: TaskWorkType = { id: "wt-alpha", name: "alpha", icon: "flag" }

describe("a task's type (linear-03)", () => {
  it("is a Task when it has none, as the panel names it", () => {
    expect(typeOf(undefined)).toBe(PLAIN_TASK)
    expect(typeOf(null)).toBe(PLAIN_TASK)
    expect(typeOf(bug)).toBe(bug)
    expect(PLAIN_TASK).toMatchObject({ id: "", builtin: "task", name: "Task", icon: "task" })
  })

  it("has one key per type: a built-in one's is the same in every project, and a plain task's is Task's", () => {
    expect(typeKey(bug)).toBe(typeKey(bugElsewhere))
    expect(typeKey(undefined)).toBe(typeKey(task))
    expect(new Set([bug, spike, alpha, undefined].map(typeKey)).size).toBe(4)
  })

  it("orders the built-in types as the server lists them, then a project's own by name", () => {
    expect([spike, request, alpha, PLAIN_TASK, bug].sort(compareTypes).map((t) => t.name)).toEqual(["Task", "Bug", "Request", "alpha", "Spike"])
  })
})
