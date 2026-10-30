import { expect, test, type Page, type Request, type TestInfo } from "@playwright/test"

import { brokerOn, mqttConfig, SAM, stubBackend, type Answers } from "./stubbedApp"

// F5 (REGRESSION-HUNT, 26 Oct 2026): what someone else did while a page
// loaded never reached it. The page reads what it shows as it opens, and its
// topics go live only when the broker answers the app's subscriptions, a
// second or two in: a change sent in between was in neither the read nor the
// stream, and the page stayed stale until a reload. Here the app's connection
// waits until the page has read; the change is made and sent while it waits,
// reaching no one, and then the app connects.

const P = "9e0a0000-0000-4000-8000-0000000000f5"
const T = "7a5c00f5-0000-4000-8000-000000000001"
const PROJECT_TOPIC = `project/${P}`
const NONE = "0001-01-01T00:00:00Z"
// MqttMessageType (services/mqttService.ts).
const TASK_COMMENT = 14
const TASK_CHANGED = 40
const ALEX = { user_uuid: "5d1e7f2a-3b4c-4d5e-8f60-718293a4b5c6", user_name: "alex", user_full_name: "Alex Kim", user_email_id: "alex@example.com", user_is_admin: false }
const admin = { role: "admin", view: true, comment: true, create_tasks: true, edit_tasks: "all", delete_tasks: "all", log_time: true, post_updates: true, add_files: true, manage: true, manage_people: true, archive: true }
const project = { project_uuid: P, project_name: "Q4 launch", project_is_admin: 1, project_is_member: 1, project_members: [SAM, ALEX], project_access: admin }

/** The server: one task in Q4 launch, whose status and comments someone else changes while the page loads. */
function server() {
  const state = {
    status: "todo",
    comments: [{ comment_uuid: "c-1", comment_text: "<p>First pass is up for review.</p>", comment_by: SAM, comment_created_at: "2026-10-27T08:00:00Z" }],
  }
  const task = () => ({
    task_uuid: T,
    task_name: "Draft the launch post",
    task_status: state.status,
    task_priority: "medium",
    task_label: "",
    task_due_date: "",
    task_start_date: "",
    task_created_at: "2026-10-01T09:00:00Z",
    task_status_since: "2026-10-01T09:00:00Z",
    task_deleted_at: NONE,
    task_sub_task_count: 0,
    task_comment_count: state.comments.length,
    task_assignee: SAM,
    task_project: { project_uuid: P, project_name: "Q4 launch" },
    task_access: { edit: true, delete: true, comment: true, log_time: true },
    task_key: "Q4-1",
  })
  const column = (status: string) => (state.status === status ? [task()] : [])
  const answers: Answers = {
    "/config/mqttConfig": mqttConfig([`user/${SAM.user_uuid}`, PROJECT_TOPIC]),
    // The chips' read: an open board takes up its project's topic from it.
    "/entities": (_url: URL, request: Request) => ({
      msg: "ok",
      data: (request.postDataJSON() as { refs: { kind: string; id: string }[] }).refs.map((ref) =>
        ref.kind === "project" && ref.id === P ? { ...ref, access: "ok", data: { name: "Q4 launch" }, topic: PROJECT_TOPIC } : { ...ref, access: "none" },
      ),
    }),
    [`/task/info/${T}`]: () => ({
      msg: "ok",
      data: {
        ...task(),
        task_description: "<p>The post for launch day.</p>",
        task_project: project,
        task_sub_tasks: [],
        task_comments: state.comments,
        task_activities: [],
        task_attachments: [],
        task_collaborators: [],
        task_blocked_by: [],
        task_blocks: [],
      },
    }),
    [`/project/taskListForKanban/${P}`]: () => ({
      msg: "ok",
      data: {
        ...project,
        project_tasks_backlog: [],
        project_tasks_todo: column("todo"),
        project_tasks_in_progress: column("inProgress"),
        project_tasks_in_review: [],
        project_tasks_done: [],
        project_tasks_canceled: [],
        project_tasks_done_count: 0,
        project_tasks_canceled_count: 0,
        project_column_counts: { backlog: 0, todo: column("todo").length, inProgress: column("inProgress").length, inReview: 0, done: 0, canceled: 0 },
      },
    }),
    [`/project/taskList/${P}`]: () => ({ msg: "ok", data: { ...project, project_task_count: 1, project_tasks: [task()] }, pageCount: 1 }),
    [`/project/info/${P}`]: { msg: "ok", data: project },
    [`/project/membersInfo/${P}`]: { msg: "ok", data: project },
    [`/project/${P}/updates`]: { msg: "ok", data: { updates: [], can_post: true } },
    [`/project/${P}/cycles`]: { msg: "ok", data: { cycles: [], can_edit: true } },
    [`/project/${P}/goals`]: { msg: "ok", data: { goals: [] } },
    [`/project/${P}/statuses`]: { msg: "ok", data: null },
    [`/project/${P}/fields`]: { msg: "ok", data: { fields: [], can_edit: true } },
    [`/project/${P}/tags`]: { msg: "ok", data: [] },
    [`/project/${P}/types`]: { msg: "ok", data: [{ id: "t-task", builtin: "task", name: "Task", icon: "task" }] },
    "/link/source/task/": { msg: "ok", data: { docs: [], boards: [] } },
    "/user/dm-ai-targets": { msg: "ok", data: [] },
    "/notices": { msg: "ok", data: [] },
    "/task/views": { msg: "ok", data: [] },
    "/task/time/": { msg: "ok", data: null },
    "/task/recurrence/": { msg: "ok", data: null },
    "/task/cycle/": { msg: "ok", data: null },
    "/task/clientReview/": { msg: "ok", data: null },
  }
  return { state, answers }
}

/** The page at `path`, its realtime connection waiting. */
async function openWaiting(page: Page, testInfo: TestInfo, path: string) {
  const { state, answers } = server()
  await page.addInitScript(() => localStorage.setItem("oc_keys_tip_seen", "1"))
  await stubBackend(page, testInfo, answers)
  const { broker, release } = await brokerOn(page, { held: true })
  await page.goto(path, { waitUntil: "domcontentloaded", timeout: 120_000 })
  /** The app connects, and from the broker's answer on the project's topic is live. */
  const connect = async () => {
    release()
    await expect.poll(() => broker.subscriptions(), { timeout: 30_000 }).toContain(PROJECT_TOPIC)
  }
  return { state, broker, connect }
}

for (const where of [
  { name: "a computer, by mouse", viewport: { width: 1280, height: 860 }, touch: false },
  { name: "a phone, by touch", viewport: { width: 390, height: 844 }, touch: true },
]) {
  test.describe(`a task's own page on ${where.name}`, () => {
    test.use({ viewport: where.viewport, hasTouch: where.touch })

    test("shows a comment someone made while it loaded, without a reload", async ({ page }, testInfo) => {
      const { state, broker, connect } = await openWaiting(page, testInfo, `/app/task/${T}`)
      await expect(page.getByText("First pass is up for review.")).toBeVisible({ timeout: 60_000 })
      const late = { comment_uuid: "c-2", comment_text: "<p>Numbers are in: we ship Thursday.</p>", comment_by: ALEX, comment_created_at: "2026-10-27T08:01:00Z" }
      state.comments = [...state.comments, late]
      expect(broker.publish(PROJECT_TOPIC, { type: TASK_COMMENT, data: { task_uuid: T, comment: late } }), "sent while the page loaded").toBe(0)
      await connect()
      await expect(page.getByText("Numbers are in: we ship Thursday.")).toBeVisible({ timeout: 15_000 })
    })
  })
}

test.describe("a project's board on a computer, by mouse", () => {
  test.use({ viewport: { width: 1280, height: 860 } })

  test("shows a card someone moved while it loaded in its new column, without a reload", async ({ page }, testInfo) => {
    const { state, broker, connect } = await openWaiting(page, testInfo, `/app/project/${P}?tab=kanban`)
    const card = (column: string) => page.locator(`[data-task-sequence] [data-column="${column}"] [data-task-id]`).filter({ hasText: "Draft the launch post" })
    await expect(card("todo")).toBeVisible({ timeout: 60_000 })
    state.status = "inProgress"
    expect(broker.publish(PROJECT_TOPIC, { type: TASK_CHANGED, data: { task_uuid: T, task_status: "inProgress" } }), "sent while the page loaded").toBe(0)
    await connect()
    await expect(card("inProgress")).toBeVisible({ timeout: 15_000 })
  })
})
