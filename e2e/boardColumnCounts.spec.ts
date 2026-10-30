import { expect, test } from "@playwright/test"

import { SAM, stubBackend } from "./stubbedApp"

// PROJ-BUG-8. Dgraph cut every sorted read at 1,000, and open columns had no
// page and no count: a To do of 2,500 showed 1,000 cards and said nothing. The
// server now sends each open column's first part and every column's count; a
// column says its real total, which part it shows, and asks for more.

const P = "9e0a0000-0000-4000-8000-0000000000b8"
const card = (i: number, status: string) => ({
  task_uuid: `7a5c00b8-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
  task_name: `${status} ${i + 1}`,
  task_status: status,
  task_priority: "medium",
  task_label: "",
  task_due_date: "",
  task_created_at: "2026-10-01T09:00:00Z",
  task_status_since: "2026-10-01T09:00:00Z",
  task_deleted_at: "0001-01-01T00:00:00Z",
  task_sub_task_count: 0,
  task_comment_count: 0,
  task_assignee: SAM,
  task_project: { project_uuid: P, project_name: "Imports" },
})

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })

test("an open column of 2,500 says so, and Show more asks for that column's next page", async ({ page }, testInfo) => {
  test.setTimeout(150_000)
  const asked: string[] = []
  const board = (url: URL) => {
    asked.push(url.search)
    // A small first page stands for the server's first part of the column.
    const shown = url.searchParams.get("openLimit") ? 24 : 12
    const project = { project_uuid: P, project_name: "Imports", project_is_admin: 1, project_is_member: 1, project_members: [SAM] }
    return {
      msg: "ok",
      data: {
        ...project,
        project_tasks_backlog: [],
        project_tasks_todo: Array.from({ length: shown }, (_, i) => card(i, "todo")),
        project_tasks_in_progress: Array.from({ length: 5 }, (_, i) => card(100 + i, "inProgress")),
        project_tasks_in_review: [],
        project_tasks_done: Array.from({ length: 6 }, (_, i) => card(200 + i, "done")),
        project_tasks_canceled: [],
        project_tasks_done_count: 6,
        project_tasks_canceled_count: 0,
        project_column_counts: { backlog: 0, todo: 2500, inProgress: 5, inReview: 0, done: 6, canceled: 0 },
      },
    }
  }
  await stubBackend(page, testInfo, {
    [`/project/taskListForKanban/${P}`]: board,
    [`/project/info/${P}`]: { msg: "ok", data: { project_uuid: P, project_name: "Imports", project_is_admin: 1, project_is_member: 1, project_members: [SAM] } },
    [`/project/${P}/statuses`]: { msg: "ok", data: null },
    [`/project/${P}/fields`]: { msg: "ok", data: { fields: [], can_edit: true } },
    [`/project/${P}/tags`]: { msg: "ok", data: [] },
    // The board holds a part of the project, so the glance's dates come from
    // the server, exact (PR1).
    [`/project/${P}/glance`]: { msg: "ok", data: { open: 2505, done: 6, overdue: 37, due_this_week: 112 } },
  })
  await page.goto(`/app/project/${P}?tab=kanban`, { waitUntil: "domcontentloaded", timeout: 120_000 })
  const todo = page.locator('[data-board] [data-column="todo"]')
  await expect(todo.getByLabel("2500 tasks")).toBeVisible({ timeout: 60_000 })
  // The glance counts the server's open tasks, not the cards loaded.
  await expect(page.locator("[data-glance]")).toContainText("2,505 open")
  // Its dates are the server's count over every open task, not "at least".
  await expect(page.locator("[data-glance]")).toContainText("37 overdue")
  await expect(page.locator("[data-glance]")).toContainText("112 due this week")
  await expect(page.locator("[data-glance]")).not.toContainText("+")
  if (process.env.SHOTS_DIR) {
    // The board's other reads this test leaves unanswered say so in a toast; the shot waits it out.
    await expect(page.getByText("Not in this test")).toHaveCount(0, { timeout: 15_000 })
    await page.screenshot({ path: `${process.env.SHOTS_DIR}/glance-exact-390-light.png` })
  }
  // At the column's foot: which part it shows, and the next page.
  await todo.locator("[data-board-scroll]").evaluate((el) => el.scrollTo(0, el.scrollHeight))
  await expect(todo.getByText("The first 12 of 2500.")).toBeVisible()
  await todo.getByRole("button", { name: "Show 1000 more" }).tap()
  await expect(todo.getByText("The first 24 of 2500.")).toBeVisible({ timeout: 30_000 })
  expect(asked.at(-1)).toContain("openLimit=2000")
  // Done keeps its own page and words.
  expect(asked.some((q) => q.includes("closedLimit"))).toBe(false)
})
