import { describe, expect, it } from "vitest"

import { taskListQuery } from "./listQuery"

describe("a task list's query", () => {
  it("names its sorts, filters, page and search as the lists always sent them", () => {
    const q = taskListQuery({
      sort: [{ id: "task_due_date", desc: true }],
      filters: [{ id: "task_status", value: ["todo"] }],
      search: "launch",
      pageSize: 50,
      pageIndex: 2,
    })
    expect(q.toString()).toBe(
      "sorting=%5B%7B%22id%22%3A%22task_due_date%22%2C%22desc%22%3Atrue%7D%5D&filters=%5B%7B%22id%22%3A%22task_status%22%2C%22value%22%3A%5B%22todo%22%5D%7D%5D&pageSize=50&pageIndex=2&taskSearchString=launch",
    )
  })

  it("leaves out what the list doesn't have, a page for its CSV among them", () => {
    expect(taskListQuery({ sort: [], filters: [], search: "" }).toString()).toBe("")
    expect(taskListQuery({ pageSize: 50 }).toString()).toBe("pageSize=50")
  })

  it("sends a sort's and a filter's own keys and nothing a table adds to them", () => {
    const sort = [{ id: "task_created_at", desc: false, extra: 1 }]
    const filters = [{ id: "task_priority", value: ["high"], extra: 2 }]
    expect(JSON.parse(taskListQuery({ sort, filters }).get("sorting")!)).toEqual([{ id: "task_created_at", desc: false }])
    expect(JSON.parse(taskListQuery({ sort, filters }).get("filters")!)).toEqual([{ id: "task_priority", value: ["high"] }])
  })
})
