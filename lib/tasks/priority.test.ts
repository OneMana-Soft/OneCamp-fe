import { describe, expect, it } from "vitest"
import { PRIORITY_NAMES, priorityLevel } from "@/lib/tasks/priority"

describe("a priority's scale, one for tasks and projects", () => {
  it("runs from none 0 to urgent 4, as the glyph fills its bars", () => {
    expect(["", "low", "medium", "high", "urgent"].map(priorityLevel)).toEqual([0, 1, 2, 3, 4])
  })

  it("reads anything else as no priority, an object's own keys included", () => {
    expect([undefined, null, "Urgent", "p1", "constructor", "toString", "__proto__"].map(priorityLevel)).toEqual([0, 0, 0, 0, 0, 0, 0])
  })

  it("names each level, none to urgent", () => {
    expect(PRIORITY_NAMES).toEqual(["No priority", "Low", "Medium", "High", "Urgent"])
  })
})
