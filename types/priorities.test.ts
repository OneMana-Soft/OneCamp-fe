import { describe, expect, it } from "vitest"
import { NO_PRIORITY, TASK_PRIORITIES, taskPriorityOptions } from "@/types/taskScale"
import { priorities } from "@/types/table"

// One priority scale, as the server has it (business/TaskPriority): urgent,
// high, medium, low and none. Five lists of three meant Urgent was never
// offered and "No priority" was refused.
describe("the priority scale", () => {
  it("is urgent to low, most pressing first, with none apart", () => {
    expect(TASK_PRIORITIES.map((p) => [p.value, p.level])).toEqual([["urgent", 4], ["high", 3], ["medium", 2], ["low", 1]])
    expect(NO_PRIORITY).toEqual({ value: "", label: "No priority", level: 0 })
  })

  it("is the one list the filters and the board read", () => {
    expect(taskPriorityOptions.map((o) => o.id)).toEqual(["urgent", "high", "medium", "low"])
    expect(priorities.map((p) => p.value)).toEqual(["low", "medium", "high", "urgent"])
    expect(priorities.find((p) => p.value === "urgent")?.label).toBe("Urgent")
  })
})
