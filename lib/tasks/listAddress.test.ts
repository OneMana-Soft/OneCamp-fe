import { describe, expect, it } from "vitest"

import { countAddress, filtersFromAddress, filtersToAddress } from "@/lib/tasks/listAddress"
import { statusOptions } from "@/lib/taskStatus"

/** A project list's filters live in its address, as words where people read them (work.md W16). */
const options = statusOptions({ built_in: [], custom: [{ id: "qa", project_id: "p", name: "QA", category: "inReview", color: "rose", position: 0 }], colors: [], max: 20 })

describe("the list's filters in the address", () => {
  it("reads ?status=open as every open status, the project's own included", () => {
    const f = filtersFromAddress(new URLSearchParams("status=open&assignee=u1,u2&overdue=1"), options)
    expect(f).toContainEqual({ id: "task_status", value: ["backlog", "todo", "inProgress", "inReview", "qa"] })
    expect(f).toContainEqual({ id: "task_assignee_name", value: ["u1", "u2"] })
    expect(f).toContainEqual({ id: "overdue", value: "1" })
  })

  it("writes the worded filters back as words, the rest as JSON, and keeps the tab", () => {
    const p = filtersToAddress(new URLSearchParams("tab=list"), [{ id: "task_status", value: ["done"] }, { id: "task_priority", value: ["high"] }], options)
    expect(p.get("tab")).toBe("list")
    expect(p.get("status")).toBe("done")
    expect(JSON.parse(p.get("filters")!)).toEqual([{ id: "task_priority", value: ["high"] }])
  })

  it("makes a count's address from the current one, dropping other list filters", () => {
    const q = new URLSearchParams(countAddress(new URLSearchParams("tab=kanban&status=done&search=x"), "overdue"))
    expect(q.get("tab")).toBe("list")
    expect(q.get("overdue")).toBe("1")
    expect(q.get("status")).toBeNull()
  })
})
