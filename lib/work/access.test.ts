import { describe, expect, it } from "vitest"
import { NO_ACCESS, accessOf, canCommentTask, canEditTask } from "@/lib/work/access"
import { canDeleteTask } from "@/lib/work/canDelete"
import type { WorkAccess } from "@/lib/work/types"

const member: WorkAccess = {
  ...NO_ACCESS,
  role: "member",
  view: true,
  comment: true,
  create_tasks: true,
  edit_tasks: "all",
  delete_tasks: "own",
  log_time: true,
  post_updates: true,
  add_files: true,
}

describe("what someone may do in a project", () => {
  it("is what the server says", () => {
    expect(accessOf({ project_access: member, project_is_admin: 1 })).toEqual(member)
  })

  it("is nothing for a project not read yet", () => {
    expect(accessOf(undefined)).toEqual(NO_ACCESS)
  })

  // A server from before roles sends no project_access: its rule holds.
  it("keeps to an older server's rule", () => {
    const admin = accessOf({ project_is_admin: 1, project_is_member: 1 })
    expect(admin.manage && admin.create_tasks && admin.edit_tasks === "all" && admin.delete_tasks === "all").toBe(true)
    const plain = accessOf({ project_is_member: 1 })
    expect(plain).toMatchObject({ role: "member", view: true, comment: true, create_tasks: false, edit_tasks: "none", manage: false })
    const steward = accessOf({ project_team: { team_is_admin: 1 } })
    expect(steward).toMatchObject({ view: false, manage_people: true, archive: true, manage: false })
  })
})

describe("whether someone may change or delete a task", () => {
  const me = "u-me"
  const mine = { task_assignee: { user_uuid: me }, task_created_by: { user_uuid: me } }
  const theirs = { task_assignee: { user_uuid: "u-other" }, task_created_by: { user_uuid: "u-other" } }

  it("is the task's own answer when it carries one", () => {
    const t = { ...theirs, task_access: { edit: true, delete: false, comment: true, log_time: true }, task_project: { project_access: NO_ACCESS } }
    expect(canEditTask(t, me)).toBe(true)
    expect(canDeleteTask(t, me)).toBe(false)
  })

  it("follows who can change tasks: everyone, those assigned, or nobody", () => {
    const at = (edit: WorkAccess["edit_tasks"]) => ({ project_access: { ...member, edit_tasks: edit } })
    expect(canEditTask({ ...theirs, task_project: at("all") }, me)).toBe(true)
    expect(canEditTask({ ...mine, task_project: at("assigned") }, me)).toBe(true)
    expect(canEditTask({ ...theirs, task_project: at("assigned") }, me)).toBe(false)
    expect(canEditTask({ ...mine, task_project: at("assigned") }, undefined)).toBe(false)
    expect(canEditTask({ ...mine, task_project: at("none") }, me)).toBe(false)
  })

  it("deletes only the tasks they made when it says own", () => {
    expect(canDeleteTask({ ...mine, task_project: { project_access: member } }, me)).toBe(true)
    expect(canDeleteTask({ ...theirs, task_project: { project_access: member } }, me)).toBe(false)
    expect(canDeleteTask({ ...theirs, task_project: { project_access: { ...member, delete_tasks: "all" } } }, me)).toBe(true)
  })

  // A list's tasks carry their project without what the reader may do: the
  // page's read of the project says it.
  it("reads the page's project for a list's task", () => {
    const listed = { ...theirs, task_project: { project_is_admin: 0 } }
    expect(canEditTask(listed, me)).toBe(false)
    expect(canEditTask(listed, me, { project_access: member })).toBe(true)
  })

  it("is no for no task", () => {
    expect(canEditTask(undefined, me)).toBe(false)
    expect(canDeleteTask(null, me)).toBe(false)
  })
})

// A viewer reads a task but can't comment on it: the server refuses their
// comment, so the panel offers no box (components/task/taskCommentComposer).
describe("whether someone may comment on a task", () => {
  const viewer: WorkAccess = { ...NO_ACCESS, role: "viewer", view: true }

  it("is the task's own answer when it carries one", () => {
    expect(canCommentTask({ task_access: { edit: false, delete: false, comment: false, log_time: false }, task_project: { project_access: member } })).toBe(false)
    expect(canCommentTask({ task_access: { edit: false, delete: false, comment: true, log_time: false }, task_project: { project_access: viewer } })).toBe(true)
  })

  it("is the project's role otherwise: a commenter or above may, a viewer may not", () => {
    expect(canCommentTask({ task_project: { project_access: member } })).toBe(true)
    expect(canCommentTask({ task_project: { project_access: { ...viewer, role: "commenter", comment: true } } })).toBe(true)
    expect(canCommentTask({ task_project: { project_access: viewer } })).toBe(false)
  })

  it("reads the page's project for a list's task, and is no for no task", () => {
    expect(canCommentTask({ task_project: { project_is_admin: 0 } }, { project_access: viewer })).toBe(false)
    expect(canCommentTask({ task_project: { project_is_admin: 0 } }, { project_access: member })).toBe(true)
    expect(canCommentTask(undefined)).toBe(false)
  })
})
