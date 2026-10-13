import { expect, test, type Page, type TestInfo } from "@playwright/test"

// PROJ-BUG-1 (P0, data loss). For a project admin, opening a task a second
// time, or with J then Enter (the list prefetches the highlighted task), sent
// POST /task/updateTaskLabel {task_label: ""}: the panel saved its empty first
// state over the task's tags. The server wrote it, and GitHub sync stripped the
// linked issue's labels. Opening a task must send no label at all.
//
// Its own stub, not e2e/stubbedApp.ts: this goes into the patch releases too,
// whose lines don't have that file.

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

const P = "9e0a0000-0000-4000-8000-0000000000e2"
const NAMES = ["Refactor the invoice export", "Fix sign-in on Safari", "Write the release notes", "Audit the CSV import", "Tidy the settings page"]
const id = (i: number) => `7a5c00e2-0000-4000-8000-${String(i + 1).padStart(12, "0")}`
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

/** The project's list, its reads answered here; returns every label the app sends. */
async function openList(page: Page, testInfo: TestInfo) {
  const answers: Record<string, unknown> = {
    [`/project/taskList/${P}`]: { msg: "ok", data: { ...project, project_task_count: tasks.length, project_tasks: tasks }, pageCount: 1 },
    [`/project/info/${P}`]: { msg: "ok", data: project },
    [`/project/${P}/statuses`]: { msg: "ok", data: null },
    [`/project/${P}/fields`]: { msg: "ok", data: { fields: [], can_edit: true } },
    [`/project/${P}/tags`]: { msg: "ok", data: [] },
    "/task/views": { msg: "ok", data: [] },
    "/task/time/": { msg: "ok", data: null },
    "/task/recurrence/": { msg: "ok", data: null },
    "/task/cycle/": { msg: "ok", data: null },
    "/task/clientReview/": { msg: "ok", data: null },
  }
  for (const t of tasks) {
    answers[`/task/info/${t.task_uuid}`] = {
      msg: "ok",
      data: {
        ...t,
        task_description: "<p>What it needs.</p>",
        task_project: { ...project },
        task_sub_tasks: [],
        task_comments: [],
        task_activities: [],
        task_attachments: [],
        task_collaborators: [],
        task_blocked_by: [],
        task_blocks: [],
      },
    }
  }
  await stub(page, testInfo, answers)
  const labels: string[] = []
  page.on("request", (r) => {
    if (r.method() === "POST" && r.url().includes("/task/updateTaskLabel")) labels.push(r.postData() ?? "")
  })
  await page.goto(`/app/project/${P}?tab=list`, { waitUntil: "domcontentloaded", timeout: 120_000 })
  await expect(page.locator("[data-task-id]").first()).toBeVisible({ timeout: 60_000 })
  return labels
}

/** The panel's title once it shows a task: the details have loaded. */
const panelShows = (page: Page, name: string) => expect(page.locator("[data-task-panel]").getByText(name).first()).toBeVisible({ timeout: 20_000 })

test.use({ viewport: { width: 1440, height: 900 } })

test("opening the same task again sends no labels", async ({ page }, testInfo) => {
  const labels = await openList(page, testInfo)
  await page.getByText(NAMES[0], { exact: true }).first().click()
  await panelShows(page, NAMES[0])
  await page.waitForTimeout(1200)
  await page.keyboard.press("Escape")
  await expect(page.locator("[data-task-panel]")).toHaveCount(0, { timeout: 10_000 })
  // Its details are cached now: the second open mounts the panel on them.
  await page.getByText(NAMES[0], { exact: true }).first().click()
  await panelShows(page, NAMES[0])
  await page.waitForTimeout(1500)
  expect(labels).toEqual([])
})

test("J then Enter opens the highlighted task and sends no labels", async ({ page }, testInfo) => {
  const labels = await openList(page, testInfo)
  // The list prefetches the task the keys rest on.
  const prefetched = page.waitForResponse((r) => r.url().includes(`/task/info/${id(2)}`), { timeout: 20_000 })
  // The keys belong to the list when nothing has focus.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.())
  for (let i = 0; i < 3; i++) await page.keyboard.press("j")
  await prefetched
  await page.waitForTimeout(400)
  await page.keyboard.press("Enter")
  await panelShows(page, NAMES[2])
  await page.waitForTimeout(1500)
  expect(labels).toEqual([])
})
