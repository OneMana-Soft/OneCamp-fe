import { describe, expect, it } from "vitest"
import { projectGlance, projectGlanceParts } from "./projectGlance"

const now = new Date(2026, 8, 30, 15, 0) // Wed 30 Sep, 3pm local
const day = (d: number, m = 9) => new Date(2026, m - 1, d, 12).toISOString()

describe("projectGlance", () => {
  it("counts open, overdue, due this week and done", () => {
    const g = projectGlance(
      [
        { task_status: "todo", task_due_date: day(29) }, // overdue
        { task_status: "inProgress", task_due_date: day(30) }, // today: due soon, not late
        { task_status: "inReview", task_due_date: day(6, 10) }, // within 7 days
        { task_status: "backlog", task_due_date: day(20, 10) }, // later
        { task_status: "todo" }, // no date
        { task_status: "done", task_due_date: day(1) },
        { task_status: "canceled", task_due_date: day(1) },
      ],
      now,
    )
    expect(g).toEqual({ open: 5, overdue: 1, dueSoon: 2, done: 1 })
  })

  it("counts every done task, not only the newest the board loaded", () => {
    const loaded = Array.from({ length: 200 }, () => ({ task_status: "done" }))
    expect(projectGlance(loaded, now, 206).done).toBe(206)
    expect(projectGlance(loaded, now).done).toBe(200)
  })

  it("treats the zero time as no due date", () => {
    expect(projectGlance([{ task_status: "todo", task_due_date: "0001-01-01T00:00:00Z" }], now).overdue).toBe(0)
  })

  it("does not count a finished task as late", () => {
    expect(projectGlance([{ task_status: "done", task_due_date: day(1) }], now).overdue).toBe(0)
  })
})

describe("projectGlanceParts", () => {
  it("says nothing for a project with no tasks", () => {
    expect(projectGlanceParts({ open: 0, overdue: 0, dueSoon: 0, done: 0 })).toBeNull()
  })
  it("celebrates quietly when everything is done", () => {
    expect(projectGlanceParts({ open: 0, overdue: 0, dueSoon: 0, done: 3 })).toEqual([{ text: "All 3 tasks done", tone: "default" }])
  })
  it("leaves out what is zero and marks what is late", () => {
    expect(projectGlanceParts({ open: 4, overdue: 1, dueSoon: 0, done: 2 })).toEqual([
      { text: "4 open", tone: "default" },
      { text: "1 overdue", tone: "late" },
      { text: "2 done", tone: "default" },
    ])
  })
})
