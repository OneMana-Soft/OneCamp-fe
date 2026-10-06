import { describe, expect, it } from "vitest"
import type { TaskInfoInterface } from "@/types/task"
import { assigneeLanes, cellKey, intoCells, priorityLanes, splitCell } from "./lanes"
import { NO_ASSIGNEE } from "./groupBy"

const task = (id: string, extra: Partial<TaskInfoInterface> = {}) => ({ task_uuid: id, task_status: "todo", ...extra }) as TaskInfoInterface
const maya = { user_uuid: "u-maya", user_name: "Maya Chen" }
const jonas = { user_uuid: "u-jonas", user_name: "Jonas Weber" }

describe("cell keys", () => {
  it("round-trip a lane and a column", () => {
    expect(splitCell(cellKey("u-maya", "inProgress"))).toEqual({ lane: "u-maya", column: "inProgress" })
    expect(splitCell("todo")).toEqual({ lane: "", column: "todo" })
  })
})

describe("intoCells", () => {
  it("cuts each column into one cell per lane, keeping the column's order", () => {
    const byStatus = {
      todo: [task("a", { task_assignee: maya as never }), task("b"), task("c", { task_assignee: maya as never })],
      done: [task("d", { task_assignee: jonas as never })],
    }
    const lanes = assigneeLanes(byStatus, [maya, jonas] as never, false)
    expect(lanes.list.map((l) => l.id)).toEqual([NO_ASSIGNEE, "u-jonas", "u-maya"])
    const cells = intoCells(byStatus, ["todo", "done"], lanes)
    expect(cells[cellKey("u-maya", "todo")].map((t) => t.task_uuid)).toEqual(["a", "c"])
    expect(cells[cellKey(NO_ASSIGNEE, "todo")].map((t) => t.task_uuid)).toEqual(["b"])
    expect(cells[cellKey("u-jonas", "done")].map((t) => t.task_uuid)).toEqual(["d"])
    // Every cell exists, so an empty one is still somewhere to drop.
    expect(cells[cellKey("u-maya", "done")]).toEqual([])
    expect(Object.keys(cells)).toHaveLength(6)
  })

  it("leaves out tasks whose lane is hidden instead of misplacing them", () => {
    const byStatus = { todo: [task("a", { task_assignee: maya as never })] }
    const cells = intoCells(byStatus, ["todo"], { list: [{ id: "u-jonas", label: "Jonas" }], laneOf: (t) => t.task_assignee?.user_uuid ?? "" })
    expect(cells).toEqual({ [cellKey("u-jonas", "todo")]: [] })
  })
})

describe("priorityLanes", () => {
  it("puts the most urgent first, and a task with no priority under Medium", () => {
    const byStatus = { todo: [task("a", { task_priority: "high" }), task("b", { task_priority: "" })] }
    const lanes = priorityLanes(byStatus, false)
    expect(lanes.list.map((l) => l.id)).toEqual(["high", "medium", "low"])
    expect(lanes.laneOf(byStatus.todo[1])).toBe("medium")
    expect(priorityLanes(byStatus, true).list.map((l) => l.id)).toEqual(["high", "medium"])
  })
})
