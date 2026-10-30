import { expect, test, type Page, type Request, type TestInfo } from "@playwright/test"

import { SAM, stubBackend } from "./stubbedApp"

// A card dragged across the board with the mouse (F-1 #5): the board's cards
// share one drag source, which a press binds to the card it lands on. The
// card lands in the column it's dropped on, and the move names that column and
// its new neighbours. With SHOTS_DIR set, the lift and the drop are saved.

const P = "9e0a0000-0000-4000-8000-0000000000c5"
const NONE = "0001-01-01T00:00:00Z"
const ADMIN = { role: "admin", view: true, comment: true, create_tasks: true, edit_tasks: "all", delete_tasks: "all", log_time: true, post_updates: true, add_files: true, manage: true, manage_people: true, archive: true }

const TASKS = [
  ["Write the launch announcement", "inProgress"],
  ["Review the pricing page copy", "todo"],
  ["Record the product walkthrough", "todo"],
  ["Set up SSO for the pilot customer", "inProgress"],
  ["Plan the webinar", "todo"],
  ["Fix the signup confirmation email", "done"],
].map(([name, status], i) => ({
  task_uuid: `7a5c00c5-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
  task_name: name,
  task_status: status,
  task_priority: "medium",
  task_label: "",
  task_due_date: "",
  task_start_date: "",
  task_created_at: "2026-10-01T09:00:00Z",
  task_status_since: "2026-10-01T09:00:00Z",
  task_deleted_at: NONE,
  task_sub_task_count: 0,
  task_comment_count: 0,
  task_assignee: SAM,
  task_project: { project_uuid: P, project_name: "Q4 launch" },
  task_access: { edit: true, delete: true, comment: true, log_time: true },
}))
const column = (status: string) => TASKS.filter((t) => t.task_status === status)

function cors(request: Request) {
  return {
    "access-control-allow-origin": request.headers()["origin"] || "*",
    "access-control-allow-credentials": "true",
    "access-control-allow-headers": request.headers()["access-control-request-headers"] || "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
  }
}

async function openBoard(page: Page, testInfo: TestInfo, moves: Record<string, unknown>[]) {
  const project = { project_uuid: P, project_name: "Q4 launch", project_is_admin: 1, project_is_member: 1, project_members: [SAM], project_access: ADMIN }
  await stubBackend(page, testInfo, {
    [`/project/taskListForKanban/${P}`]: {
      msg: "ok",
      data: {
        ...project,
        project_tasks_backlog: [],
        project_tasks_todo: column("todo"),
        project_tasks_in_progress: column("inProgress"),
        project_tasks_in_review: [],
        project_tasks_done: column("done"),
        project_tasks_canceled: [],
        project_tasks_done_count: column("done").length,
        project_tasks_canceled_count: 0,
        project_column_counts: { backlog: 0, todo: 3, inProgress: 2, inReview: 0, done: 1, canceled: 0 },
      },
    },
    [`/project/info/${P}`]: { msg: "ok", data: project },
    [`/project/membersInfo/${P}`]: { msg: "ok", data: project },
    [`/project/${P}/updates`]: { msg: "ok", data: { updates: [], can_post: true } },
    [`/project/${P}/cycles`]: { msg: "ok", data: { cycles: [], can_edit: true } },
    [`/project/${P}/goals`]: { msg: "ok", data: { goals: [] } },
    [`/project/${P}/statuses`]: { msg: "ok", data: { built_in: [], custom: [], colors: [], max: 20 } },
    [`/project/${P}/fields`]: { msg: "ok", data: { fields: [], can_edit: true } },
    [`/project/${P}/tags`]: { msg: "ok", data: [] },
    [`/project/${P}/types`]: { msg: "ok", data: [], icons: [] },
    "/task/views": { msg: "ok", data: [] },
    "/user/dm-ai-targets": { msg: "ok", data: [] },
    "/notices": { msg: "ok", data: [] },
    "/task/info/": (url: URL) => {
      const t = TASKS.find((x) => url.pathname.endsWith(x.task_uuid)) ?? TASKS[0]
      return { msg: "ok", data: { ...t, task_description: "", task_sub_tasks: [], task_comments: [], task_activities: [], task_attachments: [], task_collaborators: [], task_blocked_by: [], task_blocks: [] } }
    },
    "/entities": { msg: "ok", data: [{ kind: "project", id: P, access: "view", data: { project_name: "Q4 launch" }, topic: `project/${P}` }] },
  })
  // The move, after stubBackend so it comes first: kept, and answered as the server does.
  await page.route(/\/task\/moveTask$/, async (route) => {
    const request = route.request()
    const headers = cors(request)
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers })
    moves.push(request.postDataJSON() as Record<string, unknown>)
    return route.fulfill({ status: 200, headers, json: { msg: "ok" } })
  })
  await page.addInitScript(() => localStorage.setItem("oc_keys_tip_seen", "1"))
  await page.goto(`/app/project/${P}?tab=kanban`, { waitUntil: "domcontentloaded", timeout: 120_000 })
  await expect(page.locator('[data-board] [data-column="todo"] [data-task-id]').first()).toBeVisible({ timeout: 60_000 })
}

/** Saved for review when SHOTS_DIR is set: name-<width>-<theme>.png. */
async function shot(page: Page, name: string, theme: string) {
  const dir = process.env.SHOTS_DIR
  if (!dir) return
  await expect(page.getByText("Not in this test")).toHaveCount(0)
  await page.waitForTimeout(300)
  await page.screenshot({ path: `${dir}/${name}-${page.viewportSize()?.width}-${theme}.png` })
}

for (const theme of ["light", "dark"] as const) {
  test.describe(`a card dragged on the board at 1280, ${theme}`, () => {
    test.use({ viewport: { width: 1280, height: 860 }, colorScheme: theme })
    test.skip(theme === "dark" && !process.env.SHOTS_DIR, "dark only for the review shots")

    test("lands in the column it's dropped on, and the move names that column", async ({ page }, testInfo) => {
      test.setTimeout(180_000)
      const moves: Record<string, unknown>[] = []
      await openBoard(page, testInfo, moves)
      const card = page.locator('[data-board] [data-column="todo"] [data-task-id]').filter({ hasText: "Review the pricing page copy" })
      const from = (await card.boundingBox())!
      const to = (await page.locator('[data-board] [data-column="inProgress"]').boundingBox())!
      await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
      await page.mouse.down()
      // Past the board's few pixels before a drag starts, then across to In progress.
      await page.mouse.move(from.x + from.width / 2 + 12, from.y + from.height / 2 + 4, { steps: 3 })
      await page.mouse.move(to.x + to.width / 2, to.y + 120, { steps: 16 })
      await expect(page.locator(".work-drag-overlay")).toBeVisible()
      await shot(page, "card-lifted", theme)
      await page.mouse.up()

      await expect(page.locator('[data-board] [data-column="inProgress"] [data-task-id]').filter({ hasText: "Review the pricing page copy" })).toBeVisible()
      await expect(page.locator('[data-board] [data-column="todo"] [data-task-id]').filter({ hasText: "Review the pricing page copy" })).toHaveCount(0)
      // The column it left counts it no more: no "The first 2 of 3", nothing more to show.
      await expect(page.locator('[data-board] [data-column="todo"]')).not.toContainText("The first 2 of 3")
      await expect(page.locator('[data-board] [data-column="todo"]').getByRole("button", { name: /Show 1 more/ })).toHaveCount(0)
      await expect.poll(() => moves.length).toBe(1)
      expect(moves[0]).toMatchObject({ task_uuid: TASKS[1].task_uuid, task_status: "inProgress" })
      await shot(page, "card-dropped", theme)
    })
  })
}
