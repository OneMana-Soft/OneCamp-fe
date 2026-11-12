import { expect, test, type Page, type TestInfo } from "@playwright/test"

// V-791. usePost's object changed identity whenever its request went out and
// came back, and the GitHub link dialog's search was a callback keyed on it
// that an effect was keyed on: every answer made a new callback, which
// searched again, for as long as the dialog stayed open. One query must send
// one search, by mouse at 1280 and by touch at 390.
//
// Its own stub (as taskTagsOnOpen.spec.ts): every request leaving the app is
// answered here, so the count is the app's alone.

const SAM = { user_uuid: "2f6b6c3a-1d8e-4c55-9a0b-7c1e2d3f4a5b", user_name: "sam", user_full_name: "Sam Rivera", user_email_id: "sam@example.com", user_is_admin: false }
const P = "9e0a0000-0000-4000-8000-0000000007e1"
const TASK = "7a5c07e1-0000-4000-8000-000000000001"
const NONE = "0001-01-01T00:00:00Z"
const project = { project_uuid: P, project_name: "Billing", project_is_admin: 1, project_is_member: 1, project_members: [SAM] }
const task = {
  task_uuid: TASK,
  task_name: "Fix sign-in on Safari",
  task_status: "todo",
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
  task_description: "<p>Safari drops the session cookie.</p>",
  task_project: project,
  task_sub_tasks: [],
  task_comments: [],
  task_activities: [],
  task_attachments: [],
  task_collaborators: [],
  task_blocked_by: [],
  task_blocks: [],
}
const ISSUE = { number: 412, title: "Sign-in loops on Safari 17", html_url: "https://github.com/acme/site/issues/412", state: "open", created_at: "2026-10-30T10:00:00Z", user: { login: "dana" } }

const answers: Record<string, unknown> = {
  [`/task/info/${TASK}`]: { msg: "ok", data: task },
  [`/project/info/${P}`]: { msg: "ok", data: project },
  [`/project/${P}/statuses`]: { msg: "ok", data: null },
  [`/project/${P}/fields`]: { msg: "ok", data: { fields: [], can_edit: true } },
  [`/project/${P}/tags`]: { msg: "ok", data: [] },
  "/task/time/": { msg: "ok", data: null },
  "/task/recurrence/": { msg: "ok", data: null },
  "/task/cycle/": { msg: "ok", data: null },
  "/task/clientReview/": { msg: "ok", data: null },
  "/task/github-search-issues/": { msg: "ok", data: { issues: [ISSUE] } },
  // GitHub is connected, so the task offers its link in the panel (the phone's way in).
  "/config/client": { msg: "ok", data: { features: { github: true } } },
}

/** Answers every request leaving the app (the longest path that matches, the profile, else a 404); returns the searches sent. */
async function stub(page: Page, testInfo: TestInfo) {
  const app = new URL(String(testInfo.project.use.baseURL || "http://localhost:3001"))
  await page.routeWebSocket(/.*/, () => {})
  const paths = Object.keys(answers).sort((a, b) => b.length - a.length)
  const searches: string[] = []
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
      const url = new URL(request.url())
      const hit = paths.find((p) => url.pathname.includes(p))
      if (hit === "/task/github-search-issues/") {
        searches.push(url.searchParams.get("q") ?? "")
        // A search takes a moment, as it does against GitHub: long enough for the dialog to draw it out.
        await new Promise((r) => setTimeout(r, 150))
      }
      if (hit) return route.fulfill({ status: 200, headers, json: answers[hit] })
      if (/\/user\/profile$/.test(url.pathname)) return route.fulfill({ status: 200, headers, json: { msg: "ok", data: SAM } })
      return route.fulfill({ status: 404, headers, json: { msg: "Not in this test" } })
    },
  )
  return searches
}

/** Opens the task's page, then its GitHub link dialog: by mouse from the task's More menu, by touch from the panel's GitHub section. */
async function openLinkDialog(page: Page, testInfo: TestInfo, press: "click" | "tap") {
  const searches = await stub(page, testInfo)
  await page.goto(`/app/task/${TASK}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
  await expect(page.locator("[data-task-panel]").getByText(task.task_name).first()).toBeVisible({ timeout: 60_000 })
  if (press === "click") {
    await page.getByRole("button", { name: "More task actions" }).first().click()
    await page.getByRole("menuitem", { name: /Link to GitHub/ }).click()
  } else {
    await page.locator("[data-task-panel]").getByText("Link to GitHub issue or PR").tap()
  }
  const dialog = page.getByRole("dialog")
  await expect(dialog.getByRole("searchbox", { name: /Search by issue title/ })).toBeVisible({ timeout: 30_000 })
  return { searches, dialog }
}

/** With SHOTS_DIR set, the dialog with its one answer is saved for review, named by width. */
async function shot(page: Page) {
  const dir = process.env.SHOTS_DIR
  if (!dir) return
  await page.screenshot({ path: `${dir}/githubSearchOnce-${page.viewportSize()?.width}.png` })
}

async function searchOnce(page: Page, testInfo: TestInfo, press: "click" | "tap") {
  const { searches, dialog } = await openLinkDialog(page, testInfo, press)
  await dialog.getByRole("searchbox", { name: /Search by issue title/ }).fill("safari")
  await expect(dialog.getByText(ISSUE.title)).toBeVisible({ timeout: 20_000 })
  // Long enough for a search that asks again on its own answer to ask several times over.
  await page.waitForTimeout(2500)
  await shot(page)
  expect(searches).toEqual(["safari"])
}

test.describe("at 1280 by mouse", () => {
  test.use({ viewport: { width: 1280, height: 800 } })
  test("one query in the GitHub link dialog sends one search", async ({ page }, testInfo) => {
    await searchOnce(page, testInfo, "click")
  })
})

test.describe("at 390 by touch", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })
  test("one query in the GitHub link dialog sends one search", async ({ page }, testInfo) => {
    await searchOnce(page, testInfo, "tap")
  })
})
