import { describe, expect, it } from "vitest"
import type { TaskInfoInterface, TaskWorkType } from "@/types/task"
import { GROUPINGS, groupTasks } from "./grouping"
import { PLAIN_TASK } from "@/lib/work/workTypes"

const bugA: TaskWorkType = { id: "wt-bug-a", builtin: "bug", name: "Bug", icon: "bug" }
const bugB: TaskWorkType = { id: "wt-bug-b", builtin: "bug", name: "Bug", icon: "bug" }
const spike: TaskWorkType = { id: "wt-spike", name: "Spike", icon: "flask" }
const task = (id: string, type?: TaskWorkType, status = "todo") => ({ task_uuid: id, task_name: id, task_status: status, task_work_type: type }) as unknown as TaskInfoInterface

describe("a list grouped by type (linear-03)", () => {
  it("puts each task under its type, a built-in one across projects, plain work under Task, built-in types first, each with its type for the header's glyph", () => {
    const groups = groupTasks([task("t1", spike), task("t2"), task("t3", bugA), task("t4", bugB), task("t5", spike, "canceled")], "type")
    expect(groups.map((g) => [g.label, g.tasks.map((t) => t.task_uuid)])).toEqual([
      ["Task", ["t2"]],
      ["Bug", ["t3", "t4"]],
      ["Spike", ["t1"]],
    ])
    expect(groups[0].workType).toEqual(PLAIN_TASK)
    expect(groups[1].workType).toEqual(bugA)
    expect(new Set(groups.map((g) => g.key)).size).toBe(3)
  })

  it("is one of the ways a list can be grouped", () => {
    expect(GROUPINGS.find((g) => g.value === ("type" as never))?.label).toBe("Type")
  })
})
