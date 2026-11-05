import { describe, expect, it } from "vitest"

import { projectRouteOf } from "./projectRoute"

// The phone bars' one reading of an /app/project address (DB-114 F1, B9-b3):
// the third bar took the projects' own Dashboards page for a project.
describe("projectRouteOf", () => {
  it.each([
    ["/app/project", {}],
    ["/app/project/", {}],
    ["/app/project/dashboards", { page: "Dashboards" }],
    ["/app/project/9e0a0000-0000-4000-8000-0000000000b9", { id: "9e0a0000-0000-4000-8000-0000000000b9" }],
    // Only its own pages are pages: anything else is an id, even a word an object has.
    ["/app/project/constructor", { id: "constructor" }],
  ])("reads %s", (path, route) => {
    expect(projectRouteOf(path)).toEqual(route)
  })

  it("reads nothing deeper than a project's page, nor outside the projects", () => {
    expect(projectRouteOf("/app/project/p1/extra")).toBeUndefined()
    expect(projectRouteOf("/app/projects")).toBeUndefined()
    expect(projectRouteOf("/app/team/t1")).toBeUndefined()
  })
})
