import { expect, test, type Page, type TestInfo } from "@playwright/test"

import { SAM, reviewShot, stubBackend } from "./stubbedApp"

// A project's time report as a CSV file, on a production build. The time
// dialog's Download CSV saves the report under the name the server gives,
// which the API exposes across origins. When the server refuses it, the toast
// says why in the server's own words: asked for as a file, a refusal comes
// back as one too, and its words are read back from it (V-97). With SHOTS_DIR
// set, each place is saved for review, light and dark.

const P = "9e0a0000-0000-4000-8000-0000000000f7"
const project = { project_uuid: P, project_name: "Spring fair", project_is_admin: 0, project_is_member: 1, project_members: [SAM] }
const task = {
  task_uuid: "7a5c00f7-0000-4000-8000-000000000001",
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
const report = {
  from: "2026-10-01T00:00:00Z",
  to: "2026-11-01T00:00:00Z",
  seconds: 5400,
  billable_seconds: 0,
  entries: 2,
  running: 0,
  by_person: [{ id: SAM.user_uuid, name: SAM.user_full_name, seconds: 5400, billable_seconds: 0 }],
  by_task: [{ id: task.task_uuid, name: task.task_name, seconds: 5400, billable_seconds: 0 }],
  truncated: false,
}
const NAME = "Spring fair time 2026-10-01 to 2026-10-31.csv"
/**
 * What the API says when the project went, or the reader's access to it did, while the dialog was open:
 * WorkAccess's refusal for a project they can't view (a 404). The dialog's ranges are a month or less, so
 * the range refusal ("A report covers a year at most.") can't reach it; projectTimeDialog.test holds that one.
 */
const WHY = "Project not found"

/** The project's list, its read and its time report answered; the report's CSV a file, or the server's refusal. */
async function openProject(page: Page, testInfo: TestInfo, theme: "light" | "dark", csv: "file" | "refused") {
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
    [`/project/${P}/time`]: { msg: "ok", data: report },
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
  // answers it, and a refusal as the API answers that, its words in JSON.
  // Its preflight is the stubs'.
  await page.route(
    (url) => url.pathname.endsWith(`/project/${P}/time`) && url.searchParams.get("format") === "csv",
    async (route) => {
      if (route.request().method() === "OPTIONS") return route.fallback()
      asked.push(new URL(route.request().url()))
      const cors = {
        "access-control-allow-origin": route.request().headers()["origin"] ?? "",
        "access-control-allow-credentials": "true",
        "access-control-expose-headers": "Content-Disposition",
      }
      if (csv === "refused") {
        await route.fulfill({ status: 404, headers: { ...cors, "content-type": "application/json" }, body: JSON.stringify({ msg: WHY }) })
        return
      }
      await route.fulfill({
        status: 200,
        headers: { ...cors, "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${NAME}"` },
        body: "﻿Date,Person,Task,Hours\n2026-10-02,Sam Rivera,Book the venue,1.50\n",
      })
    },
  )
  await page.goto(`/app/project/${P}?tab=list`, { waitUntil: "domcontentloaded", timeout: 120_000 })
  await expect(page.getByText("Book the venue").first()).toBeVisible({ timeout: 60_000 })
  return { asked }
}

for (const theme of ["light", "dark"] as const) {
  test.describe(`a project's time report as a file at 1280 (${theme})`, () => {
    test.use({ viewport: { width: 1280, height: 860 }, colorScheme: theme })
    test.beforeEach(() => test.skip(theme === "dark" && !process.env.SHOTS_DIR, "dark only for the review shots"))

    test("Download CSV saves the report under the server's name", async ({ page }, testInfo) => {
      test.setTimeout(180_000)
      const { asked } = await openProject(page, testInfo, theme, "file")
      await page.getByRole("button", { name: "Time logged on this project" }).click()
      const dialog = page.getByRole("dialog", { name: "Time on Spring fair" })
      const download = dialog.getByRole("button", { name: "Download CSV" })
      await expect(download).toBeEnabled({ timeout: 30_000 })
      const saving = page.waitForEvent("download")
      await download.click()
      expect((await saving).suggestedFilename()).toBe(NAME)
      expect(asked).toHaveLength(1)
      expect(asked[0].searchParams.get("tz")).not.toBe("")
      await expect(page.getByText("Couldn't download the report", { exact: true })).toHaveCount(0)
    })

    test("a refused download says why in the server's own words", async ({ page }, testInfo) => {
      test.setTimeout(180_000)
      const { asked } = await openProject(page, testInfo, theme, "refused")
      await page.getByRole("button", { name: "Time logged on this project" }).click()
      const download = page.getByRole("dialog", { name: "Time on Spring fair" }).getByRole("button", { name: "Download CSV" })
      await expect(download).toBeEnabled({ timeout: 30_000 })
      await download.click()
      // Exact: while the toast opens, its screen-reader announcement holds the same words.
      await expect(page.getByText(WHY, { exact: true })).toBeVisible({ timeout: 15_000 })
      await expect(page.getByText("Couldn't download the report", { exact: true })).toHaveCount(1)
      expect(asked).toHaveLength(1)
      await page.mouse.move(0, 0)
      await reviewShot(page, "time-download-refused", theme)
    })
  })

  test.describe(`a project's time report as a file on a phone (${theme})`, () => {
    test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: theme })
    test.beforeEach(() => test.skip(theme === "dark" && !process.env.SHOTS_DIR, "dark only for the review shots"))

    test("from the project's menu, a refused download says why in the server's own words", async ({ page }, testInfo) => {
      test.setTimeout(180_000)
      const { asked } = await openProject(page, testInfo, theme, "refused")
      await page.getByRole("button", { name: "Project actions" }).tap()
      await page.getByRole("menuitem", { name: "Time logged on this project" }).tap()
      const download = page.getByRole("dialog", { name: "Time on Spring fair" }).getByRole("button", { name: "Download CSV" })
      await expect(download).toBeEnabled({ timeout: 30_000 })
      await download.tap()
      await expect(page.getByText(WHY, { exact: true })).toBeInViewport({ timeout: 15_000 })
      await expect(page.getByText("Couldn't download the report", { exact: true })).toHaveCount(1)
      expect(asked).toHaveLength(1)
      await reviewShot(page, "time-download-refused-phone", theme)
    })
  })
}
