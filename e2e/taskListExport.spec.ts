import { expect, test, type Page, type TestInfo } from "@playwright/test"

import { SAM, reviewShot, stubBackend } from "./stubbedApp"

// A project's task list as a CSV file (asana-16, jira-16), on a production
// build. Display's Export CSV on a computer, and the sort and filter sheet's on
// a phone, ask for the list as it reads (its filters, no page, format=csv and
// the browser's time zone), and the browser saves the file under the name the
// server gives, which the API exposes across origins. A file that holds only
// the list's first part says so. With SHOTS_DIR set, each place is saved for
// review, light and dark.

const P = "9e0a0000-0000-4000-8000-0000000000e7"
const project = { project_uuid: P, project_name: "Spring fair", project_is_admin: 1, project_is_member: 1, project_members: [SAM] }
const task = {
  task_uuid: "7a5c00e7-0000-4000-8000-000000000001",
  task_name: "Book the venue",
  task_status: "todo",
  task_priority: "medium",
  task_label: "",
  task_created_at: "2026-10-01T09:00:00Z",
  task_status_since: "2026-10-01T09:00:00Z",
  task_deleted_at: "0001-01-01T00:00:00Z",
  task_sub_task_count: 0,
  task_comment_count: 0,
  task_assignee: SAM,
  task_project: { project_uuid: P, project_name: "Spring fair" },
}
const NAME = "Spring fair tasks 2026-10-24.csv"

/**
 * The project's list, its read and its CSV answered: the CSV reads asked for, and the list's own filters.
 * With refused, the CSV is refused as the API refuses it: that status, its words in JSON.
 */
async function openList(page: Page, testInfo: TestInfo, theme: "light" | "dark", counts = { total: 1, rows: 1 }, refused?: { status: number; msg: string }) {
  const asked: URL[] = []
  const listFilters: Array<string | null> = []
  await page.addInitScript((t) => {
    localStorage.setItem("ui-theme", t)
    localStorage.setItem("oc_keys_tip_seen", "1")
  }, theme)
  await stubBackend(page, testInfo, {
    [`/project/taskList/${P}`]: (url: URL) => {
      listFilters.push(url.searchParams.get("filters"))
      return { msg: "ok", data: { ...project, project_task_count: 1, project_tasks: [task] }, pageCount: 1 }
    },
    // The project's glance line reads the board's columns (ProjectGlanceLine): its one open task.
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
    "/task/views": { msg: "ok", data: [] },
    "/user/dm-ai-targets": { msg: "ok", data: [] },
    "/notices": { msg: "ok", data: [] },
  })
  // The CSV is a file, not JSON: answered here, ahead of the stubs, as the API
  // answers it. Its preflight is the stubs'.
  await page.route(
    (url) => url.pathname.endsWith(`/project/taskList/${P}`) && url.searchParams.get("format") === "csv",
    async (route) => {
      if (route.request().method() === "OPTIONS") return route.fallback()
      asked.push(new URL(route.request().url()))
      if (refused) {
        const origin = route.request().headers()["origin"] ?? ""
        await route.fulfill({ status: refused.status, headers: { "access-control-allow-origin": origin, "access-control-allow-credentials": "true", "content-type": "application/json" }, body: JSON.stringify({ msg: refused.msg }) })
        return
      }
      await route.fulfill({
        status: 200,
        headers: {
          "access-control-allow-origin": route.request().headers()["origin"] ?? "",
          "access-control-allow-credentials": "true",
          "access-control-expose-headers": "Content-Disposition, X-Total-Count, X-Export-Rows",
          "content-type": "text/csv; charset=utf-8",
          "content-disposition": `attachment; filename="${NAME}"; filename*=UTF-8''${encodeURIComponent(NAME)}`,
          "x-total-count": String(counts.total),
          "x-export-rows": String(counts.rows),
        },
        body: "﻿Key,Title\nSF-1,Book the venue\n",
      })
    },
  )
  // Open tasks only, from the address, so the file is seen to keep the list's filters.
  await page.goto(`/app/project/${P}?tab=list&status=open`, { waitUntil: "domcontentloaded", timeout: 120_000 })
  await expect(page.getByText("Book the venue").first()).toBeVisible({ timeout: 60_000 })
  return { asked, listFilters }
}

for (const theme of ["light", "dark"] as const) {
  test.describe(`a task list's CSV at 1280 (${theme})`, () => {
    test.use({ viewport: { width: 1280, height: 860 }, colorScheme: theme })
    test.beforeEach(() => test.skip(theme === "dark" && !process.env.SHOTS_DIR, "dark only for the review shots"))

    test("Display's Export CSV saves the list as it reads, under the server's name", async ({ page }, testInfo) => {
      test.setTimeout(180_000)
      const { asked, listFilters } = await openList(page, testInfo, theme)
      await page.getByRole("button", { name: "Display" }).click()
      const exportButton = page.getByRole("button", { name: "Export CSV" })
      await expect(exportButton).toBeVisible({ timeout: 30_000 })
      await page.mouse.move(0, 0)
      await reviewShot(page, "csv-export-display", theme)
      const saving = page.waitForEvent("download")
      await exportButton.click()
      expect((await saving).suggestedFilename()).toBe(NAME)
      expect(asked).toHaveLength(1)
      const q = asked[0].searchParams
      expect(q.get("filters")).toContain(`"task_status"`)
      expect(q.get("filters")).toBe(listFilters[listFilters.length - 1])
      expect([q.has("pageSize"), q.has("pageIndex"), q.get("tz") !== ""]).toEqual([false, false, true])
      await expect(page.getByText(/^Exported the first/)).toHaveCount(0)
    })

    // Asked for as a file, a refusal comes back as one too: its words are read
    // back from it, and the toast says them (V-97). A project deleted while
    // its list is open is refused in the API's words.
    test("a refused export says why in the server's own words", async ({ page }, testInfo) => {
      test.setTimeout(180_000)
      const { asked } = await openList(page, testInfo, theme, undefined, { status: 404, msg: "Project not found" })
      await page.getByRole("button", { name: "Display" }).click()
      const exportButton = page.getByRole("button", { name: "Export CSV" })
      await expect(exportButton).toBeVisible({ timeout: 30_000 })
      await exportButton.click()
      await expect(page.getByText("Project not found", { exact: true })).toBeVisible({ timeout: 15_000 })
      await expect(page.getByText("Couldn't export the list", { exact: true })).toHaveCount(1)
      expect(asked).toHaveLength(1)
      await page.mouse.move(0, 0)
      await reviewShot(page, "csv-export-refused", theme)
    })
  })

  test.describe(`a task list's CSV on a phone (${theme})`, () => {
    test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: theme })
    test.beforeEach(() => test.skip(theme === "dark" && !process.env.SHOTS_DIR, "dark only for the review shots"))

    test("the sort and filter sheet's Export CSV saves the list, and a file of its first part says so", async ({ page }, testInfo) => {
      test.setTimeout(180_000)
      const { asked } = await openList(page, testInfo, theme, { total: 50_001, rows: 50_000 })
      await page.getByRole("button", { name: "Filter tasks" }).tap()
      const exportButton = page.getByRole("button", { name: "Export CSV" })
      await expect(exportButton).toBeInViewport({ timeout: 30_000 })
      await reviewShot(page, "csv-export-sheet", theme)
      const saving = page.waitForEvent("download")
      await exportButton.tap()
      expect((await saving).suggestedFilename()).toBe(NAME)
      expect(asked).toHaveLength(1)
      // Exact: while the toast opens, its screen-reader announcement
      // ("Notification Exported the first …") holds the same words.
      await expect(page.getByText("Exported the first 50,000 of 50,001 tasks", { exact: true })).toBeVisible()
      await expect(page.getByText("Filter the list to export the rest.", { exact: true })).toBeVisible()
    })

    test("the sheet's Export CSV, refused, says why in the server's own words", async ({ page }, testInfo) => {
      test.setTimeout(180_000)
      const { asked } = await openList(page, testInfo, theme, undefined, { status: 404, msg: "Project not found" })
      await page.getByRole("button", { name: "Filter tasks" }).tap()
      const exportButton = page.getByRole("button", { name: "Export CSV" })
      await expect(exportButton).toBeInViewport({ timeout: 30_000 })
      await exportButton.tap()
      const words = page.getByText("Project not found", { exact: true })
      await expect(words).toBeInViewport({ timeout: 15_000 })
      await expect(page.getByText("Couldn't export the list", { exact: true })).toHaveCount(1)
      expect(asked).toHaveLength(1)
      await reviewShot(page, "csv-export-refused-sheet", theme)
    })
  })
}
