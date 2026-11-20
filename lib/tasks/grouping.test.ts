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

describe("a list grouped by SLA (linear-24 W1)", () => {
  const sla = (id: string, state?: string, status = "todo") =>
    ({ task_uuid: id, task_name: id, task_status: status, ...(state ? { task_sla: { state } } : {}) }) as unknown as TaskInfoInterface
  it("reads breached, at risk, on track, met, then tasks with no SLA; empty groups step aside and breached is in danger ink", () => {
    const groups = groupTasks([sla("a", "on_track"), sla("b"), sla("c", "breached"), sla("d", "met", "done"), sla("e", "at_risk"), sla("f", "breached", "canceled")], "sla")
    expect(groups.map((g) => [g.label, g.tasks.map((t) => t.task_uuid)])).toEqual([
      ["Breached", ["c"]],
      ["At risk", ["e"]],
      ["On track", ["a"]],
      ["Met", ["d"]],
      ["No SLA", ["b"]],
    ])
    expect(groups[0].danger).toBe(true)
    expect(groups.find((g) => g.label === "Met")?.closed).toBe(true)
  })
  it("reads by status when no row carries an SLA: a guest's rows, or a project with SLAs off (V-1011)", () => {
    const rows = [sla("b"), sla("g", undefined, "done")]
    expect(groupTasks(rows, "sla")).toEqual(groupTasks(rows, "status"))
    expect(groupTasks(rows, "sla").some((g) => g.label === "No SLA")).toBe(false)
  })
  it("is offered as a grouping", () => {
    expect(GROUPINGS.some((g) => g.value === "sla" && g.label === "SLA")).toBe(true)
  })
})
