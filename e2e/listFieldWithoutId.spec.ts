import { expect, test } from "@playwright/test"

import { SAM, SHOT_THEMES, stubBackend } from "./stubbedApp"

// One field without a usable id never takes down a project's page (main, 2 Nov).
// The list and the board key each field's column by the field's filter id,
// which the server always sends; on 2 Nov a stub's field without one put the
// whole page in the error boundary at 1280. Such a field's column is left out
// and the page says so once in the console; the view draws its tasks, and the
// list's Fields filter offers the fields it can key.
// A phone's list draws cards and builds no columns, so it never said anything:
// the phone's leg opens the board, whose filters keep the list's columns
// (hooks/useProjectTaskColumn, the one builder of both).

const P = "9e0a0000-0000-4000-8000-0000000000f7"
const project = { project_uuid: P, project_name: "Website relaunch", project_is_admin: 1, project_is_member: 1, project_members: [SAM] }
const task = {
  task_uuid: "7a5c00f7-0000-4000-8000-000000000001",
  task_name: "Write the launch post",
  task_status: "todo",
  task_priority: "medium",
  task_label: "",
  task_due_date: "",
  task_start_date: "",
  task_created_at: "2026-10-01T09:00:00Z",
  task_status_since: "2026-10-01T09:00:00Z",
  task_deleted_at: "0001-01-01T00:00:00Z",
  task_sub_task_count: 0,
  task_comment_count: 0,
  task_assignee: SAM,
  task_project: { project_uuid: P, project_name: "Website relaunch" },
}
const field = { project_id: P, on_card: false }
const fields = [
  { ...field, id: "f1", name: "Channel", type: "select", position: 0, filter_id: "field_f1", options: [{ id: "o1", label: "Blog", color: "violet" }] },
  // As E2E-4's stub sent it: no filter_id.
  { ...field, id: "f2", name: "Area", type: "multi_select", position: 1, options: [{ id: "o2", label: "Data loss", color: "red" }] },
]
const board = {
  ...project,
  project_tasks_backlog: [],
  project_tasks_todo: [task],
  project_tasks_in_progress: [],
  project_tasks_in_review: [],
  project_tasks_done: [],
  project_tasks_canceled: [],
  project_tasks_done_count: 0,
  project_tasks_canceled_count: 0,
  project_column_counts: { backlog: 0, todo: 1, inProgress: 0, inReview: 0, done: 0, canceled: 0 },
}

for (const theme of SHOT_THEMES) {
  for (const [label, view, use] of [
    ["at 1280", "list", { viewport: { width: 1280, height: 860 } }],
    ["on a phone", "board", { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }],
  ] as const) {
    test.describe(`A project's ${view} with a field that came without its filter id, ${label}, ${theme}`, () => {
      test.use({ ...use, colorScheme: theme })

      const does = view === "list" ? "draws its tasks, says once that the field's column is left out, and filters on the fields it can key" : "draws its cards and says once that the field's column is left out"
      test(does, async ({ page }, testInfo) => {
        await page.addInitScript((t) => localStorage.setItem("ui-theme", t), theme)
        const said: string[] = []
        page.on("console", (m) => {
          if (m.type() === "warning" && m.text().includes("Area")) said.push(m.text())
        })
        await stubBackend(page, testInfo, {
          [`/project/taskList/${P}`]: { msg: "ok", data: { ...project, project_task_count: 1, project_tasks: [task] }, pageCount: 1 },
          [`/project/taskListForKanban/${P}`]: { msg: "ok", data: board },
          [`/project/info/${P}`]: { msg: "ok", data: project },
          [`/project/${P}/statuses`]: { msg: "ok", data: null },
          [`/project/${P}/fields`]: { msg: "ok", data: { fields, can_edit: false } },
          [`/project/${P}/tags`]: { msg: "ok", data: [] },
          "/task/views": { msg: "ok", data: [] },
        })
        await page.goto(`/app/project/${P}?tab=${view === "list" ? "list" : "kanban"}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
        const drawn = view === "list" ? page.getByText("Write the launch post").first() : page.locator('[data-board] [data-column="todo"]').getByText("Write the launch post")
        await expect(drawn).toBeVisible({ timeout: 60_000 })
        // Said when the fields come, which may be after the tasks; once, however often the view draws.
        await expect.poll(() => said.length, { timeout: 30_000 }).toBe(1)
        if (view === "list") {
          await page.getByRole("button", { name: /^Fields/ }).click()
          await expect(page.getByText("Blog", { exact: true })).toBeVisible({ timeout: 30_000 })
          await expect(page.getByText("Data loss", { exact: true })).toHaveCount(0)
        }
        // Still once, after the view has drawn again.
        expect(said).toHaveLength(1)
      })
    })
  }
}
