import { describe, expect, it } from "vitest"
import { statusOptions, type ProjectStatuses } from "@/lib/taskStatus"
import { inOrder, type OrderedStatuses } from "@/lib/statusOrder"

// A project's board order (its admins drag columns; lib/board/columnOrder):
// what useProjectStatuses gives every board, list group and picker.
const project: ProjectStatuses = {
  built_in: [],
  colors: [],
  max: 20,
  custom: [
    { id: "qa", project_id: "p", name: "QA", category: "inReview", color: "violet", position: 1 },
    { id: "blk", project_id: "p", name: "Blocked", category: "inProgress", color: "red", position: 0 },
    { id: "legal", project_id: "p", name: "Legal", category: "inReview", color: "amber", position: 0 },
  ],
}
const statusOptionsIn = (p: OrderedStatuses) => inOrder(statusOptions(p), p.order)

describe("a project's statuses in its board order", () => {
  it("follows the project's column order when it has one", () => {
    const order = ["todo", "backlog", "inReview", "qa", "inProgress", "blk", "legal", "canceled", "done"]
    expect(statusOptionsIn({ ...project, order }).map((o) => o.value)).toEqual(order)
  })
  it("puts a status the order doesn't name yet after the one before it, closed ones last, and drops names it doesn't know", () => {
    const order = ["todo", "backlog", "inProgress", "inReview", "qa", "gone", "done", "canceled"]
    // blk follows inProgress by default, legal follows inReview.
    expect(statusOptionsIn({ ...project, order }).map((o) => o.value)).toEqual([
      "todo", "backlog", "inProgress", "blk", "inReview", "legal", "qa", "done", "canceled",
    ])
    const shipped = { id: "shipped", project_id: "p", name: "Shipped", category: "done" as const, color: "green", position: 0 }
    const withShipped = { ...project, custom: [...project.custom, shipped], order: ["canceled", "done", "backlog", "todo", "inProgress", "blk", "inReview", "legal", "qa"] }
    // Shipped goes after Done; and whatever an order says, closed columns come after the open ones.
    expect(statusOptionsIn(withShipped).map((o) => o.value)).toEqual([
      "backlog", "todo", "inProgress", "blk", "inReview", "legal", "qa", "canceled", "done", "shipped",
    ])
  })
  it("is the default order without one", () => {
    expect(statusOptionsIn(project).map((o) => o.value)).toEqual(statusOptions(project).map((o) => o.value))
  })
})
