import { expect, test, type Page, type TestInfo } from "@playwright/test"

import { SAM, stubBackend } from "./stubbedApp"

// Restricted tasks on the web (WA2b, design/projects-vs-asana-jira/
// WA2_PLAN.md): a task kept to a few people carries a lock on its card and
// row; its panel says who can see it and an admin changes that in a dialog
// (a sheet on a phone); a task the reader can't see is "A task you can't see"
// in a dependency and a sub-task's path. With SHOTS_DIR set, each view is also
// saved for review, at the viewport and theme it ran in.

const P = "9e0a0000-0000-4000-8000-0000000000b2"
const NONE = "0001-01-01T00:00:00Z"
const id = (i: number) => `7a5c00b2-0000-4000-8000-${String(i + 1).padStart(12, "0")}`
const HIDDEN = "7a5c00b2-0000-4000-8000-0000000000ff"
const admin = { role: "admin", view: true, comment: true, create_tasks: true, edit_tasks: "all", delete_tasks: "all", log_time: true, post_updates: true, add_files: true, manage: true, manage_people: true, archive: true }
const MAYA = { user_uuid: "5a5c00b2-0000-4000-8000-0000000000a1", user_name: "maya", user_full_name: "Maya Chen", user_email_id: "maya@example.com" }
const IVY = { user_uuid: "5a5c00b2-0000-4000-8000-0000000000a2", user_name: "ivy", user_full_name: "Ivy Park", user_email_id: "ivy@example.com" }
const BEN = { user_uuid: "5a5c00b2-0000-4000-8000-0000000000a3", user_name: "ben", user_full_name: "Ben Ortiz", user_email_id: "ben@example.com" }
const project = { project_uuid: P, project_name: "Q4 launch", project_is_admin: 1, project_is_member: 1, project_members: [SAM, MAYA, IVY, BEN], project_access: admin }

const TASKS = [
  { name: "Zephyr pay review", status: "inProgress", key: "Q4-7", restricted: true, blocked: 1 },
  { name: "Write the launch announcement", status: "inProgress", key: "Q4-12" },
  { name: "Review the pricing page copy", status: "todo", key: "Q4-9" },
  { name: "Book the room", status: "todo", key: "Q4-31" },
  { name: "Record the product walkthrough", status: "todo", key: "Q4-13" },
  { name: "Fix the signup confirmation email", status: "done", key: "Q4-5" },
].map((t, i) => ({
  task_uuid: id(i),
  task_name: t.name,
  task_status: t.status,
  task_priority: i % 3 ? "medium" : "high",
  task_label: "",
  task_due_date: "",
  task_start_date: "",
  task_created_at: "2026-10-01T09:00:00Z",
  task_status_since: "2026-10-01T09:00:00Z",
  task_deleted_at: NONE,
  task_sub_task_count: 0,
  task_comment_count: 0,
  task_assignee: i === 0 ? MAYA : SAM,
  task_created_by: SAM,
  task_project: { project_uuid: P, project_name: "Q4 launch" },
  task_access: { edit: true, delete: true, comment: true, log_time: true, restrict: true },
  task_key: t.key,
  task_restricted: t.restricted || undefined,
  task_blocked_open: t.blocked ?? 0,
}))

const column = (status: string) => TASKS.filter((t) => t.task_status === status)

type Server = { restricted: boolean; people: string[] }

async function openProject(page: Page, testInfo: TestInfo, tab: "list" | "kanban", server: Server) {
  const restriction = () => ({ task_uuid: id(0), restricted: server.restricted, people: server.restricted ? server.people : [], can_change: true })
  const answers: Record<string, unknown> = {
    [`/project/taskList/${P}`]: { msg: "ok", data: { ...project, project_task_count: TASKS.length, project_tasks: TASKS }, pageCount: 1 },
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
    "/link/source/task/": { msg: "ok", data: { docs: [], boards: [] } },
    "/user/dm-ai-targets": { msg: "ok", data: [] },
    "/notices": { msg: "ok", data: [] },
    [`/project/${P}/statuses`]: { msg: "ok", data: null },
    [`/project/${P}/fields`]: { msg: "ok", data: { fields: [], can_edit: true } },
    [`/project/${P}/tags`]: { msg: "ok", data: [] },
    [`/project/${P}/types`]: { msg: "ok", data: [], icons: [] },
    "/task/views": { msg: "ok", data: [] },
    "/task/time/": { msg: "ok", data: null },
    "/task/recurrence/": { msg: "ok", data: null },
    "/task/cycle/": { msg: "ok", data: null },
    "/task/clientReview/": { msg: "ok", data: null },
    "/restriction": () => ({ msg: "ok", data: restriction() }),
  }
  for (const t of TASKS) {
    const extra =
      t.task_uuid === id(0)
        ? {
            // Waits on a task kept from Sam, and on one he can see.
            task_blocked_by: [
              { task_uuid: HIDDEN, task_hidden: true },
              { task_uuid: id(2), task_name: TASKS[2].task_name, task_status: "todo" },
            ],
          }
        : t.task_uuid === id(3)
          ? { task_parent_task: { task_uuid: HIDDEN, task_hidden: true } }
          : {}
    answers[`/task/info/${t.task_uuid}`] = () => ({
      msg: "ok",
      data: {
        ...t,
        task_restricted: t.task_uuid === id(0) ? server.restricted || undefined : t.task_restricted,
        task_description: "<p>What it needs.</p>",
        task_project: { ...project },
        task_sub_tasks: [],
        task_comments: [],
        task_activities: [],
        task_attachments: [],
        task_collaborators: [],
        task_blocked_by: [],
        task_blocks: [],
        ...extra,
      },
    })
  }
  await stubBackend(page, testInfo, answers)
  // The restriction's save, after stubBackend so it comes first: keeps what it is sent.
  await page.route(/\/task\/[^/]+\/restriction$/, async (route) => {
    const request = route.request()
    const headers = {
      "access-control-allow-origin": request.headers()["origin"] || "*",
      "access-control-allow-credentials": "true",
      "access-control-allow-headers": request.headers()["access-control-request-headers"] || "*",
      "access-control-allow-methods": "GET,PUT,OPTIONS",
    }
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers })
    if (request.method() === "PUT") {
      const body = request.postDataJSON() as { restricted: boolean; people: string[] }
      server.restricted = body.restricted
      server.people = body.people
    }
    return route.fulfill({ status: 200, headers, json: { msg: "ok", data: restriction() } })
  })
  await page.addInitScript(() => localStorage.setItem("oc_keys_tip_seen", "1"))
  await page.goto(`/app/project/${P}?tab=${tab}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
  await expect(page.locator("[data-task-id], [data-task-key]").first()).toBeVisible({ timeout: 60_000 })
}

/** Saved for review when SHOTS_DIR is set: name-<width>-<theme>.png, with no stray toast. */
async function shot(page: Page, name: string, theme: string) {
  const dir = process.env.SHOTS_DIR
  if (!dir) return
  await expect(page.getByText("Not in this test")).toHaveCount(0)
  await page.waitForTimeout(400)
  await page.screenshot({ path: `${dir}/${name}-${page.viewportSize()?.width}-${theme}.png` })
}

for (const theme of ["light", "dark"] as const) {
  test.describe(`restricted tasks at 1280, ${theme}`, () => {
    test.use({ viewport: { width: 1280, height: 860 }, colorScheme: theme })

    test("a restricted card carries its lock; its panel says who can see it and an admin adds someone", async ({ page }, testInfo) => {
      test.setTimeout(180_000)
      const server: Server = { restricted: true, people: [IVY.user_uuid] }
      await openProject(page, testInfo, "kanban", server)
      const card = page.locator(`[data-board] [data-task-id="${id(0)}"]`)
      await expect(card.locator("[data-card-key] [data-restricted-mark]")).toBeVisible()
      await expect(page.locator(`[data-board] [data-task-id="${id(1)}"] [data-restricted-mark]`)).toHaveCount(0)
      await shot(page, "board", theme)

      await card.getByText("Zephyr pay review", { exact: true }).click()
      const panel = page.locator("[data-task-panel]")
      const row = panel.locator("[data-property=visibility]")
      await expect(row).toContainText("Only some people", { timeout: 20_000 })
      // What it waits on: one Sam can see, and one he can't, named as such.
      await expect(panel.getByText("A task you can't see")).toBeVisible()
      await shot(page, "panel", theme)

      await row.getByRole("button").click()
      const dialog = page.getByRole("dialog", { name: "Who can see this task" })
      await expect(dialog.locator("[data-share-row]").filter({ hasText: "ivy@example.com" })).toBeVisible()
      await dialog.getByRole("combobox", { name: "Add people" }).fill("be")
      await dialog.getByRole("option", { name: /ben/i }).click()
      await shot(page, "dialog-adding", theme)
      await dialog.getByRole("button", { name: "Invite" }).click()
      await expect(dialog.locator("[data-share-row]").filter({ hasText: "ben@example.com" })).toBeVisible()
      expect(server.people).toEqual([IVY.user_uuid, BEN.user_uuid])
      await shot(page, "dialog", theme)
    })

    test("a list row carries the lock after its title", async ({ page }, testInfo) => {
      test.setTimeout(180_000)
      await openProject(page, testInfo, "list", { restricted: true, people: [] })
      await expect(page.locator(`[data-task-id="${id(0)}"] [data-restricted-mark]`)).toBeVisible()
      await shot(page, "list", theme)
    })
  })

  test.describe(`restricted tasks at 390, ${theme}`, () => {
    test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: theme })

    test("a phone opens who can see as a sheet, and a sub-task names a parent it can't see", async ({ page }, testInfo) => {
      test.setTimeout(180_000)
      const server: Server = { restricted: false, people: [] }
      await openProject(page, testInfo, "list", server)
      await page.goto(`/app/task/${id(0)}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
      const row = page.locator("[data-property=visibility]")
      await expect(row).toContainText("Everyone in the project", { timeout: 60_000 })
      await shot(page, "task", theme)
      await row.getByRole("button").click()
      await expect(page.getByRole("dialog", { name: "Who can see this task" })).toBeVisible()
      await shot(page, "sheet", theme)

      await page.goto(`/app/task/${id(3)}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
      const path = page.getByRole("navigation", { name: "Where this task sits" })
      // On a phone the parent it can't see is its glyph, its name kept for
      // screen readers and in its tip: the name's sr-only 1 px box alone
      // would pass toBeVisible, so the glyph is what's measured.
      const hidden = path.locator("[data-hidden-task]")
      await expect(hidden).toContainText("A task you can't see", { timeout: 60_000 })
      expect((await hidden.locator("svg").boundingBox())!.width).toBeGreaterThanOrEqual(16)
      await shot(page, "subtask", theme)
    })
  })
}
