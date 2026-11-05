import { describe, expect, it } from "vitest"
import { groupByType, typeMove } from "@/lib/board/groupByType"
import type { TaskInfoInterface, TaskWorkType } from "@/types/task"

describe("a board grouped by type (linear-03)", () => {
  const task: TaskWorkType = { id: "wt-task", builtin: "task", name: "Task", icon: "task" }
  const bug: TaskWorkType = { id: "wt-bug", builtin: "bug", name: "Bug", icon: "bug" }
  const feature: TaskWorkType = { id: "wt-feat", builtin: "feature", name: "Feature", icon: "feature" }
  const spike: TaskWorkType = { id: "wt-spike", name: "Spike", icon: "flask" }
  const old: TaskWorkType = { id: "wt-old", name: "Old kind", icon: "flag" }
  const typed = (id: string, type?: TaskWorkType) => ({ task_uuid: id, task_name: id, task_work_type: type }) as unknown as TaskInfoInterface

  it("has a column per type in the project's order, plain work under Task, each column with its type for the glyph", () => {
    const { columns, options } = groupByType({ todo: [typed("a", bug), typed("b")], done: [typed("c", spike), typed("d", bug)] }, [task, bug, feature, spike])
    expect(options.map((o) => o.label)).toEqual(["Task", "Bug", "Feature", "Spike"])
    expect(options.map((o) => o.workType?.id)).toEqual(["wt-task", "wt-bug", "wt-feat", "wt-spike"])
    expect(columns["wt-task"].map((x) => x.task_uuid)).toEqual(["b"])
    expect(columns["wt-bug"].map((x) => x.task_uuid)).toEqual(["a", "d"])
    expect(columns["wt-feat"]).toEqual([])
  })

  it("keeps a column for a type the project archived while tasks have it, and can leave out empty types", () => {
    const byStatus = { todo: [typed("a", old), typed("b", bug)] }
    expect(groupByType(byStatus, [task, bug, feature]).options.map((o) => o.label)).toEqual(["Task", "Bug", "Feature", "Old kind"])
    expect(groupByType(byStatus, [task, bug, feature], true).options.map((o) => o.label)).toEqual(["Bug", "Old kind"])
  })

  it("draws Task's column before the project's types have loaded", () => {
    const { columns, options } = groupByType({ todo: [typed("b")] }, [])
    expect(options.map((o) => o.label)).toEqual(["Task"])
    expect(columns[options[0].value].map((x) => x.task_uuid)).toEqual(["b"])
  })

  it("sets the column's type on a drop into another type's column, and Task makes a task plain", () => {
    const { options } = groupByType({ todo: [typed("a", bug), typed("b")] }, [task, bug, feature])
    const col = (label: string) => options.find((o) => o.label === label)!.value
    expect(typeMove(typed("a", bug), col("Feature"), options)).toBe("wt-feat")
    expect(typeMove(typed("a", bug), col("Task"), options)).toBe("")
    expect(typeMove(typed("a", bug), col("Bug"), options)).toBeUndefined()
    expect(typeMove(typed("b"), col("Task"), options)).toBeUndefined()
    expect(typeMove(typed("b"), "nowhere", options)).toBeUndefined()
  })
})
