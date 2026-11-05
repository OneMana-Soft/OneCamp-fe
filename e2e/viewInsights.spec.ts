import { expect, test, type Page, type TestInfo } from "@playwright/test"

import { SAM, reviewShot, stubBackend } from "./stubbedApp"

// A view's insights (B9-b1: jira-08, asana-08, linear-32), on a production
// build. A project's list filtered to High opens, from Display on a computer
// and from the sort and filter sheet on a phone, the project's report asked
// for with that project and those filters; the report says which view it
// shows, its project stands in the picker, and the chip lets the view go. The
// board's Display opens it too. With SHOTS_DIR set, each place is saved for
// review, light and dark.

const P = "9e0a0000-0000-4000-8000-0000000000b9"
const project = { project_uuid: P, project_name: "Spring fair", project_is_admin: 1, project_is_member: 1, project_members: [SAM] }
const task = {
  task_uuid: "7a5c00b9-0000-4000-8000-000000000001",
  task_name: "Book the venue",
  task_status: "todo",
  task_priority: "high",
  task_label: "",
  task_created_at: "2026-10-01T09:00:00Z",
  task_status_since: "2026-10-01T09:00:00Z",
  task_deleted_at: "0001-01-01T00:00:00Z",
  task_sub_task_count: 0,
  task_comment_count: 0,
  task_assignee: SAM,
  task_project: { project_uuid: P, project_name: "Spring fair" },
}
const HIGH = [{ id: "task_priority", value: ["high"] }]
const counts = { to_do: 1, in_progress: 0, in_review: 0, overdue: 0, done: 0 }
const report = {
  weeks: ["2026-10-12", "2026-10-19", "2026-10-26", "2026-11-02"],
  done: [0, 0, 0, 0],
  added: [1, 0, 0, 0],
  hours: null,
  open: 1,
  overdue: 0,
  due_this_week: 0,
  done_total: 0,
  projects: [{ project_uuid: P, project_name: "Spring fair", ...counts }],
  people: [{ user_uuid: SAM.user_uuid, user_name: "Sam Rivera", ...counts }],
  priorities: [{ priority: "high", ...counts }],
  all_projects: [
    { project_uuid: "9e0a0000-0000-4000-8000-0000000000aa", project_name: "Billing revamp" },
    { project_uuid: P, project_name: "Spring fair" },
  ],
  truncated: false,
}

/** The project's list (or board) and the report answered; every report asked for is kept. */
async function open(page: Page, testInfo: TestInfo, theme: "light" | "dark", address: string) {
  const asked: URL[] = []
  await page.addInitScript((t) => {
    localStorage.setItem("ui-theme", t)
    localStorage.setItem("oc_keys_tip_seen", "1")
  }, theme)
  await stubBackend(page, testInfo, {
    [`/project/taskList/${P}`]: { msg: "ok", data: { ...project, project_task_count: 1, project_tasks: [task] }, pageCount: 1 },
    [`/project/taskListForKanban/${P}`]: { msg: "ok", data: { ...project, project_tasks_todo: [task], project_tasks_done_count: 0 } },
    [`/project/info/${P}`]: { msg: "ok", data: project },
    [`/project/membersInfo/${P}`]: { msg: "ok", data: project },
    [`/project/${P}/statuses`]: { msg: "ok", data: null },
    [`/project/${P}/fields`]: { msg: "ok", data: { fields: [], can_edit: true } },
    [`/project/${P}/cycles`]: { msg: "ok", data: { cycles: [], can_edit: false } },
    [`/project/${P}/tags`]: { msg: "ok", data: [] },
    [`/project/${P}/types`]: { msg: "ok", data: [], icons: [] },
    [`/project/${P}/updates`]: { msg: "ok", data: { updates: [], can_post: true } },
    [`/project/${P}/goals`]: { msg: "ok", data: { goals: [] } },
    "/project/overview": { msg: "ok", data: { projects: [{ project_uuid: P, project_name: "Spring fair", is_admin: 1, open: 1, done: 0, overdue: 0, due_soon: 0 }] } },
    "/project/report": (url: URL) => {
      asked.push(url)
      return { msg: "ok", data: report }
    },
    "/goal/list": { msg: "ok", data: { goals: [] } },
    "/task/views": { msg: "ok", data: [] },
    "/user/dm-ai-targets": { msg: "ok", data: [] },
    "/notices": { msg: "ok", data: [] },
  })
  await page.goto(address, { waitUntil: "domcontentloaded", timeout: 120_000 })
  return asked
}

/** The report shows the view: asked for with its project and filters, named, its project in the picker; the chip lets it go. */
async function reportShowsView(page: Page, asked: URL[], filters: unknown, name: string, tap: (l: ReturnType<Page["locator"]>) => Promise<void>) {
  await expect(page).toHaveURL(/\/app\/project\?view=reports&projects=/, { timeout: 60_000 })
  const chip = page.getByRole("button", { name: `Show all work, not only ${name}` })
  await expect(chip).toBeVisible({ timeout: 60_000 })
  await expect(chip).toHaveText(`Only ${name}`)
  const q = asked.at(-1)!.searchParams
  expect(q.get("projects")).toBe(P)
  expect(q.get("filters") ? JSON.parse(q.get("filters")!) : null).toEqual(filters)
  await expect(page.getByRole("button", { name: /^Projects: Spring fair/ })).toBeDisabled()
  return async () => {
    const before = asked.length
    await tap(chip)
    await expect(page).toHaveURL(/\/app\/project\?view=reports$/)
    await expect(chip).toHaveCount(0)
    await expect.poll(() => asked.length).toBeGreaterThan(before)
    const all = asked.at(-1)!.searchParams
    expect([all.get("projects"), all.get("filters")]).toEqual([null, null])
  }
}

const listAddress = `/app/project/${P}?tab=list&filters=${encodeURIComponent(JSON.stringify(HIGH))}`

for (const theme of ["light", "dark"] as const) {
  test.describe(`a view's insights at 1280 (${theme})`, () => {
    test.use({ viewport: { width: 1280, height: 860 }, colorScheme: theme })
    test.beforeEach(() => test.skip(theme === "dark" && !process.env.SHOTS_DIR, "dark only for the review shots"))

    test("the list's Display opens the report of its project, filtered to High, and the chip lets the view go", async ({ page }, testInfo) => {
      test.setTimeout(180_000)
      const asked = await open(page, testInfo, theme, listAddress)
      await expect(page.getByText("Book the venue").first()).toBeVisible({ timeout: 60_000 })
      await page.getByRole("button", { name: "Display" }).click()
      const link = page.getByRole("link", { name: "Insights for this view" })
      await expect(link).toBeInViewport({ ratio: 1, timeout: 30_000 })
      await page.mouse.move(0, 0)
      await reviewShot(page, "insights-list-display", theme)
      await link.click()
      const letGo = await reportShowsView(page, asked, HIGH, "Spring fair, filtered", (l) => l.click())
      await reviewShot(page, "insights-report-view", theme)
      await letGo()
    })

    test("the board's Display opens the report of its project", async ({ page }, testInfo) => {
      test.setTimeout(180_000)
      const asked = await open(page, testInfo, theme, `/app/project/${P}?tab=kanban`)
      await page.getByRole("button", { name: "Display" }).click()
      const item = page.getByRole("menuitem", { name: "Insights for this view" })
      // In view as the menu opens, not only once a click scrolls to it (DB-112 F1).
      await expect(item).toBeInViewport({ ratio: 1, timeout: 30_000 })
      await reviewShot(page, "insights-board-display", theme)
      await item.click()
      await reportShowsView(page, asked, null, "Spring fair", (l) => l.click())
    })
  })

  test.describe(`a view's insights on a phone (${theme})`, () => {
    test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: theme })
    test.beforeEach(() => test.skip(theme === "dark" && !process.env.SHOTS_DIR, "dark only for the review shots"))

    test("the sort and filter sheet, filtered to High, opens the report of its project, and closes", async ({ page }, testInfo) => {
      test.setTimeout(180_000)
      const asked = await open(page, testInfo, theme, `/app/project/${P}`)
      await expect(page.getByText("Book the venue").first()).toBeVisible({ timeout: 60_000 })
      await page.getByRole("button", { name: "Filter tasks" }).tap()
      await page.getByText("Priority", { exact: true }).tap()
      await page.getByRole("checkbox", { name: "High" }).tap()
      await page.getByRole("button", { name: "Apply" }).tap()
      await expect(page.getByRole("button", { name: "Apply" })).toHaveCount(0)
      await page.getByRole("button", { name: "Filter tasks" }).tap()
      const link = page.getByRole("link", { name: "Insights" })
      await expect(link).toBeInViewport({ timeout: 30_000 })
      await reviewShot(page, "insights-sheet", theme)
      await link.tap()
      const letGo = await reportShowsView(page, asked, HIGH, "Spring fair, filtered", (l) => l.tap())
      // The sheet closed on the way: nothing of it over the report.
      await expect(page.getByRole("button", { name: "Apply" })).toHaveCount(0)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
      await reviewShot(page, "insights-report-view-phone", theme)
      await letGo()
    })
  })
}
