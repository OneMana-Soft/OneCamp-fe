import { describe, expect, it } from "vitest"
import { workRoute } from "./route"

// Day 0 is today's addresses: a task's page, a project's page with its view,
// and the projects page for anything else.
describe("workRoute", () => {
  it("opens a task at its page", () => {
    expect(workRoute({ task: "t-1" })).toBe("/app/task/t-1")
    expect(workRoute({ task: "t-1", project: "p-1" })).toBe("/app/task/t-1")
  })

  it("opens a project at its page, in the view asked for", () => {
    expect(workRoute({ project: "p-1" })).toBe("/app/project/p-1")
    expect(workRoute({ project: "p-1", tab: "kanban" })).toBe("/app/project/p-1?tab=kanban")
  })

  it("opens a saved view or a cycle at its project, which gives them no address yet", () => {
    expect(workRoute({ project: "p-1", view: "v-1" })).toBe("/app/project/p-1")
    expect(workRoute({ project: "p-1", cycle: "c-1" })).toBe("/app/project/p-1")
  })

  it("opens the projects page for anything else", () => {
    expect(workRoute()).toBe("/app/project")
    expect(workRoute({ task: "", project: null })).toBe("/app/project")
  })
})
