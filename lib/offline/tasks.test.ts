import { describe, expect, it } from "vitest"
import { KEPT_PARTLY, TASK_WRITES, keptPart, overlay, projectOfPage, projectsIn, taskInfoUrl, tasksIn, withKeptProject } from "@/lib/offline/tasks"
import { statusValueOf } from "@/lib/taskStatus"
import { PostEndpointUrl } from "@/services/endPoints"

const status = TASK_WRITES[PostEndpointUrl.UpdateTaskStatus]
const assignee = TASK_WRITES[PostEndpointUrl.UpdateTaskAssignee]

// One task as a project's list shows it and as its own page does.
const listed = { data: { project_tasks: [{ task_uuid: "t1", task_status: "inReview", task_custom_status: "c1", task_custom_status_name: "QA", task_assignee: { user_uuid: "u1" } }] } }
const own = { data: { task_uuid: "t1", task_name: "Write brief", task_status: "inReview", task_custom_status: "c1", task_assignee: { user_uuid: "u1", user_name: "Ada" }, task_project: { project_uuid: "p1" } } }

describe("the task fields a change sets", () => {
  it("read the same off a list's answer and the task's own", () => {
    const [fromList] = tasksIn(listed)
    const [fromPage] = tasksIn(own)
    for (const write of [status, assignee]) expect(write.read(fromList.value)).toEqual(write.read(fromPage.value))
    // A project's own status is read as the picker writes it: by its id.
    expect(status.read(fromPage.value)).toBe("c1")
  })

  it("a status kept offline shows where lists read it, a project's own or a built-in one", () => {
    const custom = overlay(listed, [{ id: "t1", field: "task_status", value: "c2" }]) as typeof listed
    expect(statusValueOf(custom.data.project_tasks[0])).toBe("c2")
    const builtIn = overlay(listed, [{ id: "t1", field: "task_status", value: "done" }]) as typeof listed
    expect(statusValueOf(builtIn.data.project_tasks[0])).toBe("done")
  })
})

describe("a project's access as its board or list was read (asana-12)", () => {
  const MEMBER = { role: "member", comment: true, edit_tasks: "all" }

  it("keeps only what says what the member may do there, from an answer that says it", () => {
    const board = { msg: "ok", data: { project_uuid: "p1", project_name: "Launch", project_is_member: 1, project_access: MEMBER, project_tasks_todo: [{ task_uuid: "t1" }] } }
    expect(projectsIn(board)).toEqual([{ id: "p1", value: { project_uuid: "p1", project_access: MEMBER, project_is_member: 1 } }])
    // No access in the answer (a server before roles, a list of tasks, a task's page): nothing kept.
    expect(projectsIn({ data: { project_uuid: "p1", project_tasks: [] } })).toEqual([])
    expect(projectsIn({ data: [{ project_uuid: "p1", project_access: MEMBER }] })).toEqual([])
    expect(projectsIn({ data: { task_uuid: "t1", task_project: { project_uuid: "p1", project_access: MEMBER } } })).toEqual([])
    expect(projectsIn(null)).toEqual([])
  })

  it("lays the kept access on a made task's page for that project only, and leaves the rest as it was", () => {
    const page = { msg: "Kept on this device", data: { task_uuid: "offline-1", task_project: { project_uuid: "p1" } } }
    expect(projectOfPage(page)).toBe("p1")
    expect(withKeptProject(page, { project_uuid: "p1", project_access: MEMBER, project_name: "not copied" })).toEqual({
      msg: "Kept on this device",
      data: { task_uuid: "offline-1", task_project: { project_uuid: "p1", project_access: MEMBER } },
    })
    expect(withKeptProject(page, { project_uuid: "p2", project_access: MEMBER })).toBe(page)
    expect(withKeptProject(page, undefined)).toBe(page)
    expect(projectOfPage({ data: { task_uuid: "t1" } })).toBeUndefined()
  })
})

// The project's estimate scale (linear-05) as a task's page there brought it (its project_meta part): a task made
// offline in that project then has its Points row, and its points wait on its create like its other changes.
describe("a project's estimate scale as a task's page brought it (asana-12)", () => {
  const FIB = { kind: "fibonacci", sizes: [1, 2, 3, 5, 8], labels: ["1", "2", "3", "5", "8"] }
  const SCALE = { data: { scale: FIB, kinds: [], can_edit: false } }
  const pageWith = (estimates: unknown) => ({ msg: "ok", data: { task_uuid: "t1", task_project: { project_uuid: "p1", project_access: { comment: true } } }, included: { estimates } })

  it("keeps the scale a task's page came with, under its project, and nothing else of the page", () => {
    expect(projectsIn(pageWith(SCALE))).toEqual([{ id: "p1", value: { project_uuid: "p1", estimates: SCALE } }])
    // A project on hours says so too: a task made there has no Points row, as online.
    const hours = { data: { scale: null, kinds: [], can_edit: false } }
    expect(projectsIn(pageWith(hours))).toEqual([{ id: "p1", value: { project_uuid: "p1", estimates: hours } }])
    // A part that failed, or none at all: nothing kept, so what was kept before stands.
    expect(projectsIn(pageWith({ error: "The estimates couldn't be read just now." }))).toEqual([])
    expect(projectsIn({ data: { task_uuid: "t1", task_project: { project_uuid: "p1" } } })).toEqual([])
  })

  it("lays the kept scale on a made task's page in that project, as the page's own estimates part", () => {
    const made = { msg: "Kept on this device", data: { task_uuid: "offline-1", task_project: { project_uuid: "p1" } }, included: { cycle: { data: null } } }
    expect(withKeptProject(made, { project_uuid: "p1", project_access: { comment: true }, estimates: SCALE })).toEqual({
      msg: "Kept on this device",
      data: { task_uuid: "offline-1", task_project: { project_uuid: "p1", project_access: { comment: true } } },
      included: { cycle: { data: null }, estimates: SCALE },
    })
    // No scale kept for it: none is made up, and the page has no estimates part.
    expect((withKeptProject(made, { project_uuid: "p1", project_access: { comment: true } }) as { included: object }).included).toEqual({ cycle: { data: null } })
  })

  it("keeps a points change like the other field changes, read the same off a task", () => {
    const points = TASK_WRITES["/task/updateTaskPoints"]
    expect(points).toMatchObject({ field: "task_estimate_points", payloadKey: "task_estimate_points" })
    expect(points.read({ task_estimate_points: 3 })).toBe(3)
    const shown = overlay(listed, [{ id: "t1", field: "task_estimate_points", value: 5 }]) as { data: { project_tasks: { task_estimate_points?: number }[] } }
    expect(shown.data.project_tasks[0].task_estimate_points).toBe(5)
  })
})

describe("a task a board or list kept, opened offline (asana-12, DESIGN-BUILD-62 MUST 1)", () => {
  const board = {
    msg: "ok",
    data: {
      project_uuid: "p1",
      project_name: "Q4 launch",
      project_members: [{ user_uuid: "u1" }],
      project_tasks_todo: [{ task_uuid: "t1", task_name: "Write the launch announcement", task_status: "todo", task_key: "Q4-1" }],
      project_tasks_done: [{ task_uuid: "t2", task_name: "Draft", task_project: { project_uuid: "p9", project_name: "Elsewhere" } }],
    },
  }
  const byId = (answer: unknown) => Object.fromEntries(tasksIn(answer).map((t) => [t.id, t.value]))

  it("keeps each task a board shows with the board's project, a sub-task with its parent's, and a task's own project as it came", () => {
    const kept = byId(board)
    expect(kept.t1.task_project).toEqual({ project_uuid: "p1", project_name: "Q4 launch" })
    expect(kept.t2.task_project).toEqual({ project_uuid: "p9", project_name: "Elsewhere" })
    const page = { data: { task_uuid: "t3", task_project: { project_uuid: "p1", project_name: "Q4 launch", project_is_admin: 1 }, task_sub_tasks: [{ task_uuid: "t4", task_name: "Sub" }] } }
    const fromPage = byId(page)
    expect(fromPage.t3.task_project).toEqual(page.data.task_project)
    expect(fromPage.t4.task_project).toEqual({ project_uuid: "p1", project_name: "Q4 launch" })
    // An answer that names no project above its tasks (My Tasks): none is made up.
    expect(byId({ data: [{ task_uuid: "t5" }] }).t5.task_project).toBeUndefined()
  })

  it("builds the task's page from what was kept, marked partial, with what a list never shows empty, for that task's page only", () => {
    const task = byId(board).t1
    const page = keptPart(taskInfoUrl("t1"), task) as { msg: string; partial: boolean; data: Record<string, unknown> }
    expect(page).toMatchObject({
      msg: KEPT_PARTLY,
      partial: true,
      data: { task_uuid: "t1", task_name: "Write the launch announcement", task_status: "todo", task_key: "Q4-1", task_project: { project_uuid: "p1" } },
    })
    for (const list of ["task_sub_tasks", "task_comments", "task_attachments", "task_activities"]) expect(page.data[list]).toEqual([])
    expect(keptPart(`${taskInfoUrl("t1")}?include=estimates`, task)).toMatchObject({ partial: true })
    expect(keptPart(taskInfoUrl("t2"), task)).toBeUndefined()
    expect(keptPart("/project/taskList/p1", task)).toBeUndefined()
    expect(keptPart(taskInfoUrl("t1"), undefined)).toBeUndefined()
  })
})

// CODE-REVIEWER-140 MUST 1 (row 2178): a task's page lists what it waits on and what waits on it (task_blocked_by,
// task_blocks), which can be another project's tasks (DG10) or ones the reader may not see (task_hidden). Only its
// sub-tasks are in its project: a linked task kept with the page's project overwrote what its own board kept
// (store.saveRead merges), and offline it opened under the wrong project's access.
describe("a task page's linked tasks keep no project of the page's (CODE-REVIEWER-140 MUST 1)", () => {
  const page = {
    msg: "ok",
    data: {
      task_uuid: "t3",
      task_project: { project_uuid: "p1", project_name: "Q4 launch" },
      task_sub_tasks: [{ task_uuid: "t4", task_name: "Draft the brief" }],
      task_blocked_by: [{ task_uuid: "x1", task_name: "Sign the vendor contract", task_status: "todo" }],
      task_blocks: [{ task_uuid: "x2", task_hidden: true }],
    },
  }
  const kept = Object.fromEntries(tasksIn(page).map((t) => [t.id, t.value]))

  it("keeps a sub-task with its parent's project, and a task the page only links to with none", () => {
    expect(kept.t4.task_project).toEqual({ project_uuid: "p1", project_name: "Q4 launch" })
    expect(kept.x1.task_project).toBeUndefined()
    expect(kept.x2.task_project).toBeUndefined()
  })

  it("keeps a linked task's own project as it came", () => {
    const own = tasksIn({ data: { ...page.data, task_blocked_by: [{ task_uuid: "x3", task_project: { project_uuid: "p2" } }] } })
    expect(own.find((t) => t.id === "x3")?.value.task_project).toEqual({ project_uuid: "p2" })
  })

  it("builds no page offline from a task the reader may not see", () => {
    expect(keptPart(taskInfoUrl("x2"), { task_uuid: "x2", task_hidden: true })).toBeUndefined()
  })
})
