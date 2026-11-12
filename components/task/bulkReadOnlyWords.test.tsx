import { describe, expect, it } from "vitest"

import { readOnlyWords } from "@/lib/work/readOnlyWords"
import type { WorkAccess } from "@/lib/work/types"

// UX-PROJECTS-H1 (PROJECTS-23): the selection's bar said "only a project's
// admins can change these" whatever the project's rule was, from before Work
// Access. It now says how many the reader can't change, and why, by each
// project's own rule (project_access: edit_tasks all, assigned or none; a
// viewer's or a commenter's role).

const access = (over: Partial<WorkAccess>): WorkAccess => ({
  role: "member", view: true, comment: true, create_tasks: true, edit_tasks: "all", delete_tasks: "own",
  log_time: true, post_updates: true, add_files: true, manage: false, manage_people: false, archive: false, ...over,
})
const inProject = (name: string, a?: WorkAccess) => ({ task_project: { project_uuid: name, project_name: name, project_access: a } })

describe("what the selection's bar says of tasks the reader can't change", () => {
  it("says nothing when every task can change", () => {
    expect(readOnlyWords([], 3)).toBeNull()
  })

  it("counts them among the rest, and names the project's rule", () => {
    expect(readOnlyWords([inProject("Q4 launch", access({ edit_tasks: "assigned" }))], 2)).toEqual({
      line: "You can't change 1 of these",
      why: "In Q4 launch you change only tasks assigned to you.",
    })
    expect(readOnlyWords([inProject("Q4 launch", access({ edit_tasks: "none" })), inProject("Q4 launch", access({ edit_tasks: "none" }))], 0)).toEqual({
      line: "You can't change these tasks",
      why: "In Q4 launch only admins change tasks.",
    })
  })

  it("names a viewer's and a commenter's role, and each project once", () => {
    const words = readOnlyWords(
      [inProject("Q4 launch", access({ role: "viewer", edit_tasks: "none" })), inProject("Hiring", access({ role: "commenter", edit_tasks: "none" })), inProject("Hiring", access({ role: "commenter", edit_tasks: "none" }))],
      1,
    )
    expect(words).toEqual({ line: "You can't change 3 of these", why: "In Q4 launch you can view tasks, not change them. In Hiring you can comment on tasks, not change them." })
  })

  it("takes a project list's own project, whose rows don't carry its rule", () => {
    const list = { project_uuid: "p1", project_name: "Website", project_access: access({ edit_tasks: "assigned" }) }
    expect(readOnlyWords([{ task_project: { project_uuid: "p1" } }], 1, list)?.why).toBe("In Website you change only tasks assigned to you.")
  })

  // B63 F2 of 3ef857030: the rule is picked as canEditTask picks it (lib/work/access ruleProject): a row's own project_access first, else the list's project.
  it("takes a row's own rule before the list's, as the row's access does", () => {
    const list = { project_uuid: "p1", project_name: "Website", project_access: access({ edit_tasks: "assigned" }) }
    expect(readOnlyWords([inProject("Hiring", access({ role: "viewer", edit_tasks: "none" }))], 1, list)?.why).toBe("In Hiring you can view tasks, not change them.")
  })

  it("says only that they can't change, where a row doesn't say why", () => {
    expect(readOnlyWords([{ task_project: { project_uuid: "p9", project_name: "Ops" } }], 0)).toEqual({ line: "You can't change these tasks", why: "You can't change the tasks of Ops." })
  })
})
