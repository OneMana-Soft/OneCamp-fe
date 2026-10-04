import { describe, expect, it } from "vitest"
import { sameView, taskViewScope } from "./views"

describe("saved task views", () => {
  it("scopes by list", () => {
    expect(taskViewScope()).toBe("mine")
    expect(taskViewScope("p1")).toBe("project:p1")
  })

  it("matches a view regardless of order and empty filters", () => {
    const a = { filters: [{ id: "task_status", value: ["todo", "done"] }, { id: "task_priority", value: [] }], sort: [{ id: "task_due_date", desc: false }] }
    const b = { filters: [{ id: "task_status", value: ["done", "todo"] }], sort: [{ id: "task_due_date", desc: false }], columns: { task_label: true } }
    expect(sameView(a, b)).toBe(true)
    expect(sameView(a, { ...b, sort: [{ id: "task_due_date", desc: true }] })).toBe(false)
  })

  it("counts hidden columns only where they are tracked", () => {
    const a = { filters: [], sort: [], columns: { task_label: false } }
    const b = { filters: [], sort: [] }
    expect(sameView(a, b)).toBe(false)
    expect(sameView(a, b, false)).toBe(true)
  })
})
