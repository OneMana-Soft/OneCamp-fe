import { expect, test, type Page, type TestInfo } from "@playwright/test"

import { holdChunk } from "./holdChunk"
import { reviewShot, stubBackend } from "./stubbedApp"

// PR3 (the BE audit's panel fan-out): opening a task asked for it, then for its
// cycle, repeat, client verdict, time, and its project's statuses and fields,
// two levels deep. The task now comes with them (?include=), and the panel's
// rows show them without asking again.

const SAM = { user_uuid: "2f6b6c3a-1d8e-4c55-9a0b-7c1e2d3f4a5b", user_name: "sam", user_full_name: "Sam Rivera", user_email_id: "sam@example.com", user_is_admin: false }

/** Every request leaving the app answered here: by path (the longest that matches), the profile, else a 404. */
async function stub(page: Page, testInfo: TestInfo, answers: Record<string, unknown>) {
  const app = new URL(String(testInfo.project.use.baseURL || "http://localhost:3001"))
  await page.routeWebSocket(/.*/, () => {})
  const paths = Object.keys(answers).sort((a, b) => b.length - a.length)
  await page.route(
    (url) => url.origin !== app.origin,
    async (route) => {
      const request = route.request()
      const headers = {
        "access-control-allow-origin": request.headers()["origin"] || app.origin,
        "access-control-allow-credentials": "true",
        "access-control-allow-headers": request.headers()["access-control-request-headers"] || "*",
        "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
      }
      if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers })
      const path = new URL(request.url()).pathname
      const hit = paths.find((p) => path.includes(p))
      if (hit) return route.fulfill({ status: 200, headers, json: answers[hit] })
      if (/\/user\/profile$/.test(path)) return route.fulfill({ status: 200, headers, json: { msg: "ok", data: SAM } })
      return route.fulfill({ status: 404, headers, json: { msg: "Not in this test" } })
    },
  )
}

const P = "9e0a0000-0000-4000-8000-0000000000e3"
const NAMES = ["Refactor the invoice export", "Fix sign-in on Safari", "Write the release notes", "Audit the CSV import", "Tidy the settings page"]
const id = (i: number) => `7a5c00e3-0000-4000-8000-${String(i + 1).padStart(12, "0")}`
const NONE = "0001-01-01T00:00:00Z"
const project = { project_uuid: P, project_name: "Billing", project_is_admin: 1, project_is_member: 1, project_members: [SAM] }
const tasks = NAMES.map((name, i) => ({
  task_uuid: id(i),
  task_name: name,
  task_status: "todo",
  task_priority: "medium",
  task_label: i % 2 ? "design" : "frontend, billing",
  task_due_date: "",
  task_start_date: "",
  task_created_at: "2026-10-01T09:00:00Z",
  task_status_since: "2026-10-01T09:00:00Z",
  task_deleted_at: NONE,
  task_sub_task_count: 0,
  task_comment_count: 0,
  task_assignee: SAM,
  task_project: { project_uuid: P, project_name: "Billing" },
}))

const included = {
  cycle: { data: { id: "c1", project_uuid: P, number: 4, name: "Cycle 4", starts_at: "2026-10-13T00:00:00Z", ends_at: "2026-10-27T00:00:00Z" } },
  recurrence: { data: { task_uuid: id(0), rule: "FREQ=WEEKLY;BYDAY=MO", mode: "schedule" } },
  client_review: { data: null },
  time_summary: { data: { entries: [], seconds: 5400, billable_seconds: 5400, running: null } },
  statuses: { data: null },
  fields: { data: { fields: [], can_edit: true } },
}

/** Requests to the panel's own reads, from the moment it's asked (the running timer is the app's, not the panel's). */
const PART = /\/task\/(cycle|recurrence|clientReview|time)\/(?!running$)[^/]+$|\/project\/[^/]+\/(statuses|fields)$/

test.use({ viewport: { width: 1440, height: 900 } })

/** The project's page, its list, and its first task as the panel reads it, with its parts. */
function answers(): Record<string, unknown> {
  const t = tasks[0]
  return {
    [`/project/taskList/${P}`]: { msg: "ok", data: { ...project, project_task_count: tasks.length, project_tasks: tasks }, pageCount: 1 },
    [`/project/taskListForKanban/${P}`]: {
      msg: "ok",
      data: { ...project, project_tasks_backlog: [], project_tasks_todo: tasks, project_tasks_in_progress: [], project_tasks_in_review: [], project_tasks_done: [], project_tasks_canceled: [], project_tasks_done_count: 0, project_tasks_canceled_count: 0, project_column_counts: { backlog: 0, todo: tasks.length, inProgress: 0, inReview: 0, done: 0, canceled: 0 } },
    },
    [`/project/info/${P}`]: { msg: "ok", data: project },
    [`/project/membersInfo/${P}`]: { msg: "ok", data: project },
    [`/project/${P}/updates`]: { msg: "ok", data: { updates: [], can_post: true } },
    [`/project/${P}/cycles`]: { msg: "ok", data: { cycles: [], can_edit: true } },
    [`/project/${P}/goals`]: { msg: "ok", data: { goals: [] } },
    "/notices": { msg: "ok", data: [] },
    "/entities": { msg: "ok", data: [] },
    [`/project/${P}/statuses`]: { msg: "ok", data: null },
    [`/project/${P}/fields`]: { msg: "ok", data: { fields: [], can_edit: true } },
    [`/project/${P}/tags`]: { msg: "ok", data: [] },
    "/task/views": { msg: "ok", data: [] },
    "/task/time/": { msg: "ok", data: null },
    "/task/recurrence/": { msg: "ok", data: null },
    "/task/cycle/": { msg: "ok", data: null },
    "/task/clientReview/": { msg: "ok", data: null },
    [`/task/info/${t.task_uuid}`]: {
      msg: "ok",
      data: { ...t, task_description: "<p>What it needs.</p>", task_project: { ...project }, task_sub_tasks: [], task_comments: [], task_activities: [], task_attachments: [], task_collaborators: [], task_blocked_by: [], task_blocks: [] },
      included,
    },
  }
}

test("opening a task asks for it once, with its parts", async ({ page }, testInfo) => {
  await stub(page, testInfo, answers())
  await page.goto(`/app/project/${P}?tab=list`, { waitUntil: "domcontentloaded", timeout: 120_000 })
  await expect(page.locator("[data-task-id]").first()).toBeVisible({ timeout: 60_000 })
  await page.waitForTimeout(1500)

  const parts: string[] = []
  const infos: string[] = []
  page.on("request", (r) => {
    const url = new URL(r.url())
    if (PART.test(url.pathname)) parts.push(url.pathname)
    if (url.pathname.includes("/task/info/")) infos.push(url.search)
  })
  await page.getByText(NAMES[0], { exact: true }).first().click()
  const panel = page.locator("[data-task-panel]")
  await expect(panel.getByText(NAMES[0]).first()).toBeVisible({ timeout: 20_000 })
  // What came with the task is on the panel: its cycle and its repeat.
  await expect(panel.getByText("Cycle 4").first()).toBeVisible({ timeout: 10_000 })
  await page.waitForTimeout(1500)
  expect(infos.length).toBeGreaterThan(0)
  expect(infos[0]).toContain("include=")
  expect(parts).toEqual([])
})

/** Words only the task panel's own chunk carries (rightPanel's panelLoaders.task). */
const TASK_PANEL_CODE = "Back to My Tasks"

/**
 * The list, with the task panel's code held back as a slow line would, from
 * before the page loads so the panels' idle preload can't bring it first;
 * then a task opened. The panel draws its loading rows at once, the list
 * still on screen (V-39: a panel with no boundary of its own held up the
 * shell around it until its chunk landed).
 */
async function openWhileTheCodeComes(page: Page, testInfo: TestInfo) {
  const code = await holdChunk(page, TASK_PANEL_CODE)
  await stubBackend(page, testInfo, answers())
  await page.goto(`/app/project/${P}?tab=list`, { waitUntil: "domcontentloaded", timeout: 120_000 })
  const first = page.locator("[data-task-id]").first()
  await expect(first).toBeVisible({ timeout: 60_000 })
  await page.getByText(NAMES[0], { exact: true }).first().click()
  await expect.poll(code.asked).toBe(true)
  await expect(page.locator("[data-task-panel-skeleton]")).toBeVisible({ timeout: 2_000 })
  await expect(first).toBeVisible()
  return code
}

// A phone has no right panel: it opens a task as its own page.
for (const theme of ["light", "dark"] as const) {
  test.describe(`the task panel's code at 1280, ${theme}`, () => {
    test.use({ viewport: { width: 1280, height: 900 }, colorScheme: theme })

    test("opening a task draws the panel's loading rows at once while its code comes, the list staying on screen", async ({ page }, testInfo) => {
      const code = await openWhileTheCodeComes(page, testInfo)
      await reviewShot(page, "task-panel-code-coming", theme)
      code.release()
      await expect(page.locator("[data-task-panel]").getByText(NAMES[0]).first()).toBeVisible({ timeout: 30_000 })
      await code.done()
    })

    test("when the panel's code still can't come after the page's one reload, the panel says so with Try again, which brings the task", async ({ page }, testInfo) => {
      const code = await openWhileTheCodeComes(page, testInfo)
      // A chunk that fails reloads the page once, for a new deploy's chunks
      // (lib/chunkRecovery: its key, its 30 s guard). That reload is spent.
      await page.evaluate(() => sessionStorage.setItem("oc_chunk_reload_at", String(Date.now())))
      code.fail()
      await expect(page.getByText("Couldn't load the task")).toBeVisible({ timeout: 30_000 })
      await expect(page.locator("[data-task-id]").first()).toBeVisible()
      await reviewShot(page, "task-panel-code-failed", theme)
      code.release()
      await page.getByRole("button", { name: /Try again/ }).click()
      await expect(page.locator("[data-task-panel]").getByText(NAMES[0]).first()).toBeVisible({ timeout: 30_000 })
      await code.done()
    })
  })
}
