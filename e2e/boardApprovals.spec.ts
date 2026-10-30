import { expect, test, type Page, type TestInfo } from "@playwright/test"

import { SAM, logFailures, stubBackend } from "./stubbedApp"

// A project's status rules on its board (main's approvals check, gaps 1 and
// 3), in a real browser on the stubbed app: a column whose rule leaves the
// reader out offers no New task; a New task in a column that wants approval
// is made in To do, says so in the server's words, and its card says it's
// waiting; on a computer and a phone, light and dark. With SHOTS_DIR set,
// saved for review.

const P = "9e0a0000-0000-4000-8000-0000000000c1"
const NONE = "0001-01-01T00:00:00Z"
const MADE = "7a5c00c1-0000-4000-8000-000000000009"
const HELD = "Made in To do. Sent for approval: it moves to In progress once it's approved."
// The toast says it under "Sent for approval".
const SAID = "Made in To do. It moves to In progress once it's approved."

const card = (id: string, name: string, status: string, over: Record<string, unknown> = {}) => ({
  task_uuid: id, task_name: name, task_status: status, task_priority: "medium", task_label: "", task_due_date: "",
  task_created_at: "2026-10-20T09:00:00Z", task_status_since: "2026-10-20T09:00:00Z", task_deleted_at: NONE,
  task_sub_task_count: 0, task_comment_count: 0, task_assignee: SAM, task_project: { project_uuid: P, project_name: "Q4 launch" }, ...over,
})

/** A member: Done is for the project's admins, and In progress wants an approval (the board's read, project_access.move_into). */
const access = {
  role: "member", view: true, comment: true, create_tasks: true, edit_tasks: "all", delete_tasks: "own", log_time: true,
  post_updates: true, add_files: true, manage: false, manage_people: false, archive: false, move_into: { done: false, inProgress: true },
}
const project = { project_uuid: P, project_name: "Q4 launch", project_is_admin: 0, project_is_member: 1, project_members: [SAM], project_access: access }

/** What the page asked for that this file didn't answer, named if a shot fails on it. */
const unanswered: string[] = []

async function openBoard(page: Page, testInfo: TestInfo, theme: "light" | "dark") {
  let made = false
  await page.addInitScript((t) => {
    localStorage.setItem("ui-theme", t)
    localStorage.setItem("oc_keys_tip_seen", "1")
  }, theme)
  await stubBackend(page, testInfo, {
    [`/project/taskListForKanban/${P}`]: () => ({
      msg: "ok",
      data: {
        ...project,
        project_tasks_backlog: [],
        project_tasks_todo: [
          card("7a5c00c1-0000-4000-8000-000000000001", "Write the pricing FAQ", "todo"),
          ...(made ? [card(MADE, "Draft the launch post", "todo", { task_waiting: { approval_id: "a1", to_status: "inProgress" } })] : []),
        ],
        project_tasks_in_progress: [card("7a5c00c1-0000-4000-8000-000000000002", "Record the walkthrough", "inProgress")],
        project_tasks_in_review: [],
        project_tasks_done: [card("7a5c00c1-0000-4000-8000-000000000003", "Book the venue", "done")],
        project_tasks_canceled: [],
        project_tasks_done_count: 1,
        project_tasks_canceled_count: 0,
        project_column_counts: { backlog: 0, todo: made ? 2 : 1, inProgress: 1, inReview: 0, done: 1, canceled: 0 },
      },
    }),
    // The server makes it in To do and asks at once (gap 1), saying both.
    "/task/createTask": () => {
      made = true
      return { msg: HELD, code: "approval", data: { task_uuid: MADE, approval_id: "a1", status: "todo" } }
    },
    [`/project/info/${P}`]: { msg: "ok", data: project },
    [`/project/${P}/statuses`]: { msg: "ok", data: null },
    [`/project/${P}/fields`]: { msg: "ok", data: { fields: [], can_edit: true } },
    [`/project/${P}/tags`]: { msg: "ok", data: [] },
    [`/project/${P}/glance`]: { msg: "ok", data: { open: 2, done: 1, overdue: 0, due_this_week: 0 } },
    [`/project/${P}/cycles`]: { msg: "ok", data: { cycles: [], can_edit: false } },
    [`/project/membersInfo/${P}`]: { msg: "ok", data: project },
    [`/project/${P}/updates`]: { msg: "ok", data: { updates: [], can_post: true } },
    [`/project/${P}/goals`]: { msg: "ok", data: { goals: [] } },
    "/notices": { msg: "ok", data: [] },
    "/entities": { msg: "ok", data: [{ kind: "project", id: P, access: "view", data: { project_name: "Q4 launch" }, topic: `project/${P}` }] },
  })
  logFailures(page)
  page.on("response", (r) => {
    if (r.status() === 404) unanswered.push(new URL(r.url()).pathname)
  })
  await page.goto(`/app/project/${P}?tab=kanban`, { waitUntil: "domcontentloaded", timeout: 120_000 })
  await expect(page.locator('[data-board] [data-column="todo"]')).toBeVisible({ timeout: 60_000 })
}

async function shot(page: Page, name: string, theme: string) {
  const dir = process.env.SHOTS_DIR
  if (!dir) return
  await page.waitForTimeout(450)
  await page.screenshot({ path: `${dir}/${name}-${page.viewportSize()?.width}-${theme}.png` })
}

for (const theme of ["light", "dark"] as const) {
  for (const [label, use] of [
    ["at 1280", { viewport: { width: 1280, height: 860 }, colorScheme: theme }],
    ["on a phone", { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: theme }],
  ] as const) {
    test.describe(`a board's status rules ${label}, ${theme}`, () => {
      test.use(use)

      test("offers no New task where the rule leaves the reader out, and makes one in To do, waiting, where it wants approval", async ({ page }, testInfo) => {
        test.setTimeout(180_000)
        await openBoard(page, testInfo, theme)
        const column = (status: string) => page.locator(`[data-board] [data-column="${status}"]`)
        await expect(column("done").getByRole("button", { name: /^New task/ })).toHaveCount(0)
        await expect(page.getByText("Not in this test"), `unanswered: ${unanswered.join(", ")}`).toHaveCount(0, { timeout: 15_000 })
        await column("inProgress").getByRole("button", { name: "New task in In progress" }).click()
        const name = column("inProgress").getByLabel("New task name")
        await name.fill("Draft the launch post")
        await name.press("Enter")
        // One toast, "Sent for approval" over where it was made and where it
        // goes (exact: the screen reader's live region says it too).
        await expect(page.getByText(SAID, { exact: true })).toHaveCount(1)
        await expect(page.getByText(SAID, { exact: true })).toBeVisible()
        await expect(page.getByText("Sent for approval", { exact: true }).first()).toBeVisible()
        const made = page.locator(`[data-task-id="${MADE}"]`)
        await expect(column("todo").locator(`[data-task-id="${MADE}"]`)).toBeVisible()
        await expect(made).toHaveCount(1)
        await expect(made.getByTitle("Waiting for approval")).toBeVisible()
        const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
        expect(over).toBeLessThanOrEqual(0)
        await column("todo").scrollIntoViewIfNeeded()
        await shot(page, "board-held-new-task", theme)
      })
    })
  }
}
