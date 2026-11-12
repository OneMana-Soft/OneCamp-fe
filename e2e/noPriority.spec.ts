import { expect, test, type Page, type Request, type TestInfo } from "@playwright/test"

import { SAM, SHOT_THEMES, reviewShot, stubBackend } from "./stubbedApp"

// UX-PROJECTS-H1 (PROJECTS-14): "No priority" is a real choice, as Linear's.
// A new task has none until one is picked: the composer's chip says Priority,
// in the quiet ink, and the task is made with none (it was Medium). A row's
// No priority sticks: the server takes it now (UX-PROJECTS-H1-BE; it answered
// 400 to ""), and after a reload the row still shows none. The server here
// is a stateful stand-in that keeps the priority it is sent.

const P = "9e0a0000-0000-4000-8000-0000000000e1"
const NONE = "0001-01-01T00:00:00Z"
const ADMIN = { role: "admin", view: true, comment: true, create_tasks: true, edit_tasks: "all", delete_tasks: "all", log_time: true, post_updates: true, add_files: true, manage: true, manage_people: true, archive: true }
const project = { project_uuid: P, project_name: "Q4 launch", project_key: "Q4", project_is_admin: 1, project_is_member: 1, project_team: { team_name: "Product" }, project_members: [SAM], project_access: ADMIN }
const TASK = {
  task_uuid: "7a5c00e1-0000-4000-8000-000000000001",
  task_name: "Plan the webinar",
  task_status: "todo",
  task_label: "",
  task_due_date: "",
  task_start_date: "",
  task_created_at: "2026-10-01T09:00:00Z",
  task_status_since: "2026-10-01T09:00:00Z",
  task_deleted_at: NONE,
  task_sub_task_count: 0,
  task_comment_count: 0,
  task_assignee: SAM,
  task_project: { project_uuid: P, project_name: "Q4 launch" },
  task_access: { edit: true, delete: true, comment: true, log_time: true },
}

type Server = { priority: string; made: Record<string, unknown>[]; set: string[] }

const body = (request: Request) => request.postDataJSON() as Record<string, unknown>

async function stub(page: Page, testInfo: TestInfo, server: Server, extra: Record<string, unknown> = {}) {
  const task = () => ({ ...TASK, task_priority: server.priority })
  await stubBackend(page, testInfo, {
    "/project/projectListByAdminUID": { msg: "ok", data: [project] },
    "/project/forNewTask": { msg: "ok", data: [project] },
    [`/project/taskList/${P}`]: () => ({ msg: "ok", data: { ...project, project_task_count: 1, project_tasks: [task()] }, pageCount: 1 }),
    [`/project/info/${P}`]: { msg: "ok", data: project },
    [`/project/membersInfo/${P}`]: { msg: "ok", data: project },
    [`/project/${P}/statuses`]: { msg: "ok", data: null },
    [`/project/${P}/fields`]: { msg: "ok", data: { fields: [], can_edit: true } },
    [`/project/${P}/cycles`]: { msg: "ok", data: { cycles: [], can_edit: true } },
    [`/project/${P}/goals`]: { msg: "ok", data: { goals: [] } },
    [`/project/${P}/tags`]: { msg: "ok", data: [] },
    [`/project/${P}/types`]: { msg: "ok", data: [], icons: [] },
    [`/project/${P}/updates`]: { msg: "ok", data: { updates: [], can_post: true } },
    [`/project/${P}/task-templates`]: { msg: "ok", data: { templates: [], defaults: {}, can_manage: true } },
    // Once its priority is taken off, the task's history says so (as the server writes it: none next).
    "/task/info/": () => ({ msg: "ok", data: { ...task(), task_description: "", task_sub_tasks: [], task_comments: [], task_activities: server.set.includes("") ? [{ activity_uuid: "a-none", activity_type: "priorityUpdate", activity_prev_state: "high", activity_next_state: "", activity_time: "2026-11-10T09:00:00Z", activity_by: SAM }] : [], task_attachments: [], task_collaborators: [], task_blocked_by: [], task_blocks: [] } }),
    "/task/createTask": (_url: URL, request: Request) => {
      server.made.push(body(request))
      return { msg: "Created task!", data: { task_uuid: "7a5c00e1-0000-4000-8000-000000000002" } }
    },
    "/task/updateTaskPriority": (_url: URL, request: Request) => {
      const p = String(body(request).task_priority ?? "")
      server.set.push(p)
      server.priority = p
      return { msg: "Updated task priority!" }
    },
    // A row's (and the selection bar's) priority goes as one bulk write (lib/work/bulkApply).
    "/task/bulk": (_url: URL, request: Request) => {
      const b = body(request)
      if (b.op === "priority") {
        server.set.push(String(b.value ?? ""))
        server.priority = String(b.value ?? "")
      }
      return { msg: "ok", data: {} }
    },
    // What the list reads ahead: the board (board() answers it with its tasks) and the forecast.
    [`/project/taskListForKanban/${P}`]: { msg: "ok", data: { ...project, project_tasks_backlog: [], project_tasks_todo: [], project_tasks_in_progress: [], project_tasks_in_review: [], project_tasks_done: [], project_tasks_canceled: [], project_column_counts: {} } },
    // A project with nothing to go on yet: its header shows no forecast chip (a null answer left its grey slot, N4 of 3ef857030).
    [`/project/${P}/forecast`]: { msg: "ok", data: { project_uuid: P, state: "starting", date: null, optimistic: null, pessimistic: null, by_pace: null, by_links: null, open: 1, unit: "tasks", per_week: 0, weeks: 0, held_by: [], held_count: 0 } },
    // The task page's own reads, empty.
    [`/project/${P}/estimates`]: { msg: "ok", data: { scale: null, kinds: [], can_edit: true } },
    [`/project/${P}/milestones`]: { msg: "ok", data: { milestones: [], can_manage: true } },
    "/task/time/": { msg: "ok", data: null },
    "/task/recurrence/": { msg: "ok", data: null },
    "/task/clientReview/": { msg: "ok", data: null },
    "/task/cycle/": { msg: "ok", data: null },
    "/task/milestone/": { msg: "ok", data: null },
    "/user/assignedTaskList": { msg: "ok", pageCount: 1, data: { user_tasks: [] } },
    "/task/views": { msg: "ok", data: [] },
    "/user/dm-ai-targets": { msg: "ok", data: [] },
    "/notices": { msg: "ok", data: [] },
    "/approvals/waiting": { msg: "ok", data: { items: [] } },
    "/entities": { msg: "ok", data: [{ kind: "project", id: P, access: "view", data: { project_name: "Q4 launch" }, topic: `project/${P}` }] },
    ...extra,
  })
  // The keys tip would sit over the shots (onboarding/KeyboardTip).
  await page.addInitScript(() => localStorage.setItem("oc_keys_tip_seen", "1"))
}

const SIZES = [
  ["1280", { viewport: { width: 1280, height: 860 } }],
  ["390 touch", { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }],
] as const

for (const theme of SHOT_THEMES) {
  for (const [size, use] of SIZES) {
    test.describe(`no priority at ${size}, ${theme}`, () => {
      test.use({ ...use, colorScheme: theme })

      test("a new task has no priority: its chip says Priority, and it is made with none", async ({ page }, testInfo) => {
        test.setTimeout(180_000)
        const server: Server = { priority: "high", made: [], set: [] }
        await stub(page, testInfo, server)
        await page.goto(`/app/create/task?project=${P}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
        const chip = page.locator("[data-create-chips]").getByRole("button", { name: "Priority: No priority" })
        await expect(chip).toBeVisible({ timeout: 60_000 })
        await expect(chip).toHaveText("Priority")
        await chip.click()
        await expect(page.getByRole("option", { name: /No priority/ })).toBeVisible()
        await reviewShot(page, "composer-priority-menu", theme)
        await page.keyboard.press("Escape")
        await page.getByLabel("Task title").fill("Book the venue")
        await reviewShot(page, "composer-no-priority", theme)
        await page.getByRole("button", { name: "Create task" }).click()
        await expect.poll(() => server.made.length, { timeout: 20_000 }).toBe(1)
        expect(server.made[0].task_priority ?? "").toBe("")
      })
    })
  }

  test.describe(`the composer's priority from the keyboard at 1280, ${theme}`, () => {
    test.use({ viewport: { width: 1280, height: 860 }, colorScheme: theme })

    // F4c of 3ef857030: the chip's focus ring, and No priority under the keys in its menu.
    test("Tab reaches the Priority chip, and ArrowDown reaches No priority", async ({ page }, testInfo) => {
      test.setTimeout(180_000)
      await stub(page, testInfo, { priority: "", made: [], set: [] })
      await page.goto(`/app/create/task?project=${P}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
      const chip = page.locator("[data-create-chips]").getByRole("button", { name: "Priority: No priority" })
      await expect(chip).toBeVisible({ timeout: 60_000 })
      for (let i = 0; i < 30 && !(await chip.evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press("Tab")
      await expect(chip).toBeFocused()
      await reviewShot(page, "composer-priority-focus", theme)
      await page.keyboard.press("Enter")
      const none = page.getByRole("option", { name: /No priority/ })
      await expect(none).toBeVisible()
      for (let i = 0; i < 6 && (await none.getAttribute("data-selected")) !== "true"; i++) await page.keyboard.press("ArrowDown")
      await expect(none).toHaveAttribute("data-selected", "true")
      await reviewShot(page, "composer-no-priority-focus", theme)
    })
  })

  test.describe(`a row's No priority at 1280, ${theme}`, () => {
    test.use({ viewport: { width: 1280, height: 860 }, colorScheme: theme })

    test("sticks: the row shows none, and still none after a reload", async ({ page }, testInfo) => {
      test.setTimeout(180_000)
      const server: Server = { priority: "high", made: [], set: [] }
      await stub(page, testInfo, server)
      await page.goto(`/app/project/${P}?tab=list`, { waitUntil: "domcontentloaded", timeout: 120_000 })
      const row = page.locator(`[data-grouped-list] [data-task-id="${TASK.task_uuid}"]`)
      await expect(row).toBeVisible({ timeout: 60_000 })
      await expect(row.locator("[data-priority-level]").first()).toHaveAttribute("data-priority-level", "3")

      await row.getByRole("button", { name: "Priority of Plan the webinar" }).click()
      await page.getByRole("menuitem", { name: /No priority/ }).click()
      await expect.poll(() => server.set).toEqual([""])
      await expect(row.locator("[data-priority-level]").first()).toHaveAttribute("data-priority-level", "0")
      await reviewShot(page, "row-no-priority", theme)

      await page.reload({ waitUntil: "domcontentloaded" })
      await expect(row).toBeVisible({ timeout: 60_000 })
      await expect(row.locator("[data-priority-level]").first()).toHaveAttribute("data-priority-level", "0")
    })
  })

  for (const [size, use] of SIZES) {
    test.describe(`the task page's No priority at ${size}, ${theme}`, () => {
      test.use({ ...use, colorScheme: theme })

      // Its menu offered Low to Urgent only, and its write left "" unsent. At 390 the menu is a drawer (F4a of
      // 3ef857030); the history says the priority was removed (F4e); a phone's row then shows none (F4b).
      test("takes the priority off: the menu offers No priority and sends none", async ({ page }, testInfo) => {
        test.setTimeout(180_000)
        const server: Server = { priority: "high", made: [], set: [] }
        await stub(page, testInfo, server)
        await page.goto(`/app/task/${TASK.task_uuid}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
        const field = page.locator('[data-property="priority"]')
        await field.getByRole("button", { name: /^Priority: High/ }).click({ timeout: 60_000 })
        await reviewShot(page, "task-page-priority-menu", theme)
        await page.getByRole("option", { name: /No priority/ }).click()
        await expect.poll(() => server.set).toEqual([""])
        await expect(field.locator("[data-priority-level]").first()).toHaveAttribute("data-priority-level", "0")
        await reviewShot(page, "task-page-no-priority", theme)

        await page.reload({ waitUntil: "domcontentloaded" })
        const line = page.getByText(/removed the priority\./)
        await line.scrollIntoViewIfNeeded({ timeout: 60_000 })
        await expect(line).toBeVisible()
        await reviewShot(page, "task-page-history-no-priority", theme)

        if (size !== "1280") {
          // The phone's row draws a priority's glyph alone; none draws nothing there (TaskPriorityCell's tip).
          await page.goto(`/app/project/${P}?tab=list`, { waitUntil: "domcontentloaded", timeout: 120_000 })
          const row = page.locator(`[data-task-id="${TASK.task_uuid}"]`).first()
          await expect(row).toBeVisible({ timeout: 60_000 })
          await expect(row.locator("[data-priority-level]").first()).toHaveAttribute("data-priority-level", "0")
          await reviewShot(page, "phone-row-no-priority", theme)
        }
      })
    })
  }

  for (const [size, use] of SIZES) {
    test.describe(`the board and the overview at ${size}, ${theme}`, () => {
      test.use({ ...use, colorScheme: theme })

      // Lanes by priority end in No priority's lane, where a task with none sits (it sat under Medium).
      test("the board's lanes end in No priority, which holds a task with none", async ({ page }, testInfo) => {
        test.setTimeout(180_000)
        await board(page, testInfo, [{ ...TASK, task_priority: "high", task_uuid: "7a5c00e1-0000-4000-8000-000000000003", task_name: "Write the launch post" }, { ...TASK, task_priority: "" }])
        const cell = (lane: string) => page.locator(`[data-task-sequence] [data-column="${lane}\u241ftodo"]`)
        await expect(cell("none").getByText("Plan the webinar")).toBeVisible({ timeout: 60_000 })
        await expect(cell("high").getByText("Write the launch post")).toBeVisible()
        // The head's subject, the No priority lane, sits under the fold (F3 of 3ef857030).
        await cell("none").scrollIntoViewIfNeeded()
        await page.waitForTimeout(300)
        await reviewShot(page, "board-priority-lanes", theme)
      })

      test("an empty board offers New task", async ({ page }, testInfo) => {
        test.setTimeout(180_000)
        await board(page, testInfo, [])
        await expect(page.getByRole("heading", { name: "No tasks yet" })).toBeVisible({ timeout: 60_000 })
        await expect(page.getByRole("button", { name: "New task" }).last()).toBeVisible()
        await reviewShot(page, "board-empty", theme)
      })

      // One empty state on the list, the board and the phone's list (F2 of 3ef857030): Import for a workspace admin.
      for (const admin of [true, false]) {
        test(`an empty list ${admin ? "offers Import to a workspace admin" : "tells a member who can import"}`, async ({ page }, testInfo) => {
          test.setTimeout(180_000)
          await stub(page, testInfo, { priority: "", made: [], set: [] }, {
            [`/project/taskList/${P}`]: { msg: "ok", data: { ...project, project_task_count: 0, project_tasks: [] }, pageCount: 0 },
            "/user/profile": { msg: "ok", data: { ...SAM, user_is_admin: admin } },
          })
          await page.goto(`/app/project/${P}?tab=list`, { waitUntil: "domcontentloaded", timeout: 120_000 })
          await expect(page.getByRole("heading", { name: "No tasks yet" })).toBeVisible({ timeout: 60_000 })
          await expect(page.getByRole("button", { name: "Import" })).toHaveCount(admin ? 1 : 0)
          await expect(page.getByText(admin ? "Make the first one, or bring them in from Linear, Jira, Asana or Trello." : "Bring tasks in from Linear, Jira, Asana or Trello: a workspace admin can import them.")).toBeVisible()
          await reviewShot(page, `${size === "1280" ? "list" : "phone-list"}-empty-${admin ? "admin" : "member"}`, theme)
        })
      }

      if (size !== "1280") {
        // F4f of 3ef857030: a board card is selected by the keys (X, Shift+J/K) alone and draws no box, so a finger can't
        // select one: a tap opens it, and no selection bar comes.
        test("a card on a phone's board can't be selected, so no selection bar comes", async ({ page }, testInfo) => {
          test.setTimeout(180_000)
          await board(page, testInfo, [{ ...TASK, task_priority: "" }])
          const card = page.locator(`[data-task-sequence] [data-task-id="${TASK.task_uuid}"]`).first()
          await expect(card).toBeVisible({ timeout: 60_000 })
          await expect(card.getByRole("checkbox")).toHaveCount(0)
          await card.tap()
          await expect(page.getByRole("toolbar", { name: /selected/ })).toHaveCount(0)
        })
      }

      // Its second button opened the same dialog as New project (PROJECTS-24).
      test("the overview with no projects offers New project and Start from a template", async ({ page }, testInfo) => {
        test.setTimeout(180_000)
        await stubBackend(page, testInfo, { "/project/overview": { msg: "ok", data: { projects: [] } }, "/goal/list": { msg: "ok", data: { goals: [] } }, "/notices": { msg: "ok", data: [] } })
        await page.addInitScript(() => localStorage.setItem("oc_keys_tip_seen", "1"))
        await page.goto("/app/project", { waitUntil: "domcontentloaded", timeout: 120_000 })
        await expect(page.getByRole("button", { name: "Start from a template" })).toBeVisible({ timeout: 60_000 })
        await reviewShot(page, "overview-template-button", theme)
      })
    })
  }

  test.describe(`the selection bar's priorities at 1280, ${theme}`, () => {
    test.use({ viewport: { width: 1280, height: 860 }, colorScheme: theme })

    test("offers No priority beside the four", async ({ page }, testInfo) => {
      test.setTimeout(180_000)
      await stub(page, testInfo, { priority: "high", made: [], set: [] })
      await page.goto(`/app/project/${P}?tab=list`, { waitUntil: "domcontentloaded", timeout: 120_000 })
      // The row's box is drawn under the pointer (GroupedTaskList).
      const row = page.locator(`[data-grouped-list] [data-task-id="${TASK.task_uuid}"]`)
      await row.hover({ timeout: 60_000 })
      await row.getByRole("checkbox", { name: `Select ${TASK.task_name}` }).click()
      await page.getByRole("toolbar", { name: "1 task selected" }).getByRole("button", { name: /^Priority/ }).click()
      for (const name of ["Urgent", "High", "Medium", "Low", "No priority"]) await expect(page.getByRole("option", { name: new RegExp(name) })).toBeVisible()
      await reviewShot(page, "bulk-priority-picker", theme)
    })

    // F4d of 3ef857030: a mixed selection says how many the reader can't change, and its tip says why, by the project's rule.
    test("says how many of a mixed selection can't change, and why", async ({ page }, testInfo) => {
      test.setTimeout(180_000)
      const ADA = { ...SAM, user_uuid: "5d1e0000-0000-4000-8000-0000000000ad", user_name: "ada", user_full_name: "Ada Lovelace" }
      const member = { ...project, project_is_admin: 0, project_access: { ...ADMIN, role: "member", edit_tasks: "assigned", manage: false, manage_people: false, archive: false } }
      const mine = { ...TASK, task_priority: "high", task_access: undefined }
      const theirs = { ...mine, task_uuid: "7a5c00e1-0000-4000-8000-000000000004", task_name: "Draft the agenda", task_assignee: ADA }
      await stub(page, testInfo, { priority: "high", made: [], set: [] }, {
        [`/project/taskList/${P}`]: { msg: "ok", data: { ...member, project_task_count: 2, project_tasks: [mine, theirs] }, pageCount: 1 },
        [`/project/info/${P}`]: { msg: "ok", data: member },
      })
      await page.goto(`/app/project/${P}?tab=list`, { waitUntil: "domcontentloaded", timeout: 120_000 })
      for (const t of [mine, theirs]) {
        const row = page.locator(`[data-grouped-list] [data-task-id="${t.task_uuid}"]`)
        await row.hover({ timeout: 60_000 })
        await row.getByRole("checkbox", { name: `Select ${t.task_name}` }).click()
      }
      const words = page.getByRole("toolbar", { name: "2 tasks selected" }).getByText("· You can't change 1 of these")
      await expect(words).toBeVisible()
      await reviewShot(page, "bulk-read-only-words", theme)
      await words.hover()
      await expect(page.locator(".tip-chip")).toHaveText("In Q4 launch you change only tasks assigned to you.")
      await reviewShot(page, "bulk-read-only-tip", theme)
    })
  })
}

/** A project's board, its lanes by priority (lib/board/lanes), with these tasks in To do. */
async function board(page: Page, testInfo: TestInfo, todo: (typeof TASK & { task_priority: string })[]) {
  await stub(page, testInfo, { priority: "", made: [], set: [] }, {
    [`/project/taskListForKanban/${P}`]: {
      msg: "ok",
      data: {
        ...project,
        project_tasks_backlog: [],
        project_tasks_todo: todo,
        project_tasks_in_progress: [],
        project_tasks_in_review: [],
        project_tasks_done: [],
        project_tasks_canceled: [],
        project_tasks_done_count: 0,
        project_tasks_canceled_count: 0,
        project_column_counts: { backlog: 0, todo: todo.length, inProgress: 0, inReview: 0, done: 0, canceled: 0 },
      },
    },
  })
  await page.addInitScript((key) => localStorage.setItem(key, JSON.stringify("priority")), `oc_board_lanes:${P}`)
  await page.goto(`/app/project/${P}?tab=kanban`, { waitUntil: "domcontentloaded", timeout: 120_000 })
}
