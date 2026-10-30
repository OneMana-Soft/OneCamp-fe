import { expect, test, type Page, type TestInfo } from "@playwright/test"

import { SAM, stubBackend } from "./stubbedApp"

// A phone list sorted and filtered in its sheet, then searched, on a
// production build at 390 with touch: a project's list and My Tasks. The
// search's read left the sort and filters out, so the list came back in the
// server's order with every task; it asks for all three now.

const P = "9e0a0000-0000-4000-8000-0000000000f3"
const project = { project_uuid: P, project_name: "Spring fair", project_is_admin: 1, project_is_member: 1, project_members: [SAM] }
const task = {
  task_uuid: "7a5c00f3-0000-4000-8000-000000000001",
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

/** What a list read asked for: its sort, its filters and its term. */
type Read = { sorting: unknown; filters: unknown; search: string | null }
const readOf = (url: URL): Read => ({
  sorting: JSON.parse(url.searchParams.get("sorting") ?? "null"),
  filters: JSON.parse(url.searchParams.get("filters") ?? "null"),
  search: url.searchParams.get("taskSearchString"),
})

const LISTS = [
  {
    name: "a project's list",
    path: `/app/project/${P}?tab=list`,
    list: `/project/taskList/${P}`,
    answer: { msg: "ok", data: { ...project, project_task_count: 1, project_tasks: [task] }, pageCount: 1 },
    stubs: {
      [`/project/info/${P}`]: { msg: "ok", data: project },
      [`/project/membersInfo/${P}`]: { msg: "ok", data: project },
      [`/project/${P}/statuses`]: { msg: "ok", data: null },
      [`/project/${P}/fields`]: { msg: "ok", data: { fields: [], can_edit: true } },
      [`/project/${P}/cycles`]: { msg: "ok", data: { cycles: [], can_edit: false } },
      [`/project/${P}/tags`]: { msg: "ok", data: [] },
      [`/project/${P}/types`]: { msg: "ok", data: [], icons: [] },
      [`/project/${P}/updates`]: { msg: "ok", data: { updates: [], can_post: true } },
      [`/project/${P}/goals`]: { msg: "ok", data: { goals: [] } },
    },
  },
  {
    name: "My Tasks",
    path: "/app/myTask",
    list: "/user/assignedTaskList",
    answer: { msg: "ok", data: { user_tasks: [task] }, pageCount: 1 },
    stubs: {},
  },
] as const

async function openList(page: Page, testInfo: TestInfo, l: (typeof LISTS)[number]) {
  const reads: Read[] = []
  await page.addInitScript(() => localStorage.setItem("oc_keys_tip_seen", "1"))
  await stubBackend(page, testInfo, {
    ...l.stubs,
    [l.list]: (url: URL) => {
      reads.push(readOf(url))
      return l.answer
    },
    "/task/views": { msg: "ok", data: [] },
    "/user/dm-ai-targets": { msg: "ok", data: [] },
    "/notices": { msg: "ok", data: [] },
  })
  await page.goto(l.path, { waitUntil: "domcontentloaded", timeout: 120_000 })
  await expect(page.getByText("Book the venue").first()).toBeVisible({ timeout: 60_000 })
  return reads
}

test.describe("a phone list's search keeps its sort and filters", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })

  for (const l of LISTS) {
    test(`${l.name}: sorted and filtered in the sheet, then searched`, async ({ page }, testInfo) => {
      test.setTimeout(180_000)
      const reads = await openList(page, testInfo, l)
      const sort = [{ id: "task_due_date", desc: true }]
      const status = { id: "task_status", value: ["todo"] }

      await page.getByRole("button", { name: "Filter tasks" }).tap()
      const sheet = page.getByRole("dialog", { name: "Sort and filter" })
      await expect(sheet).toBeVisible()
      await sheet.getByText("Sort", { exact: true }).tap()
      await sheet.getByRole("radio", { name: "Due date, latest first" }).tap()
      await sheet.getByText("Status", { exact: true }).tap()
      await sheet.getByLabel("To do", { exact: true }).tap()
      await sheet.getByRole("button", { name: "Apply" }).tap()
      await expect(sheet).toBeHidden()
      await expect.poll(() => reads.at(-1)?.sorting).toEqual(sort)
      expect(reads.at(-1)?.filters).toContainEqual(status)

      await page.getByRole("searchbox", { name: "Search tasks" }).fill("venue")
      await expect.poll(() => reads.at(-1)?.search).toBe("venue")
      expect(reads.at(-1)?.sorting).toEqual(sort)
      expect(reads.at(-1)?.filters).toContainEqual(status)
    })
  }
})
