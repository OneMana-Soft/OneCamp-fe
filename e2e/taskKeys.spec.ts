import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test"

import { linkVendorDoc, linking, VENDOR_DOC } from "./entityLinking"
import { SAM, stubBackend, type Answers } from "./stubbedApp"

// Projects A8K (STEP4 #8): every task reads as its key ("Q4-12") on its list
// row, its board card and its panel, beside its type's glyph; the panel's
// previous and next walk the list it was opened from. With SHOTS_DIR set,
// each view is also saved for review, at the viewport and theme it ran in.

const P = "9e0a0000-0000-4000-8000-0000000000a8"
const NONE = "0001-01-01T00:00:00Z"
const id = (i: number) => `7a5c00a8-0000-4000-8000-${String(i + 1).padStart(12, "0")}`
const admin = { role: "admin", view: true, comment: true, create_tasks: true, edit_tasks: "all", delete_tasks: "all", log_time: true, post_updates: true, add_files: true, manage: true, manage_people: true, archive: true }
const project = { project_uuid: P, project_name: "Q4 launch", project_is_admin: 1, project_is_member: 1, project_members: [SAM], project_access: admin }
const type = (builtin: string, name: string) => ({ id: `t-${builtin}`, builtin, name, icon: builtin })

const TASKS = [
  { name: "Write the launch announcement", status: "inProgress", key: "Q4-12" },
  { name: "Review the pricing page copy", status: "todo", key: "Q4-9", type: type("approval", "Approval") },
  { name: "Launch day", status: "todo", key: "Q4-128", type: type("milestone", "Milestone") },
  { name: "Set up SSO for the pilot customer", status: "inProgress", key: "Q4-104", type: type("feature", "Feature"), blocked: 1 },
  { name: "Record the product walkthrough", status: "todo", key: "Q4-13" },
  { name: "Fix the signup confirmation email", status: "done", key: "Q4-7", type: type("bug", "Bug") },
].map((t, i) => ({
  task_uuid: id(i),
  task_name: t.name,
  task_status: t.status,
  task_priority: i % 3 ? "medium" : "high",
  task_label: i === 0 ? "copy, marketing" : "",
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
  task_key: t.key,
  task_work_type: t.type,
  task_blocked_open: t.blocked ?? 0,
}))

const column = (status: string) => TASKS.filter((t) => t.task_status === status)

/** ownRead is what each task's own read says on top of its row: a viewer's access, a status; extra, more answers. */
async function openProject(page: Page, testInfo: TestInfo, tab: "list" | "kanban", ownRead: Record<string, unknown> = {}, extra: Answers = {}) {
  const answers: Record<string, unknown> = {
    [`/project/taskList/${P}`]: { msg: "ok", data: { ...project, project_task_count: TASKS.length, project_tasks: TASKS }, pageCount: 1 },
    [`/project/taskListForKanban/${P}`]: {
      msg: "ok",
      data: {
        ...project,
        project_tasks_backlog: [],
        project_tasks_todo: column("todo"),
        project_tasks_in_progress: column("inProgress"),
        project_tasks_in_review: column("inReview"),
        project_tasks_done: column("done"),
        project_tasks_canceled: [],
        project_tasks_done_count: column("done").length,
        project_tasks_canceled_count: 0,
        project_column_counts: { backlog: 0, todo: 3, inProgress: 2, inReview: 0, done: 1, canceled: 0 },
      },
    },
    [`/project/info/${P}`]: { msg: "ok", data: project },
    [`/project/membersInfo/${P}`]: { msg: "ok", data: project },
    [`/project/${P}/updates`]: { msg: "ok", data: { updates: [], can_post: true } },
    [`/project/${P}/cycles`]: { msg: "ok", data: { cycles: [], can_edit: true } },
    [`/project/${P}/goals`]: { msg: "ok", data: { goals: [] } },
    "/link/source/task/": { msg: "ok", data: { docs: [], boards: [] } },
    "/user/dm-ai-targets": { msg: "ok", data: [] },
    "/notices": { msg: "ok", data: [] },
    [`/project/${P}/statuses`]: { msg: "ok", data: null },
    [`/project/${P}/fields`]: { msg: "ok", data: { fields: [], can_edit: true } },
    [`/project/${P}/tags`]: { msg: "ok", data: [] },
    [`/project/${P}/types`]: { msg: "ok", data: [type("task", "Task"), type("bug", "Bug"), type("feature", "Feature"), type("milestone", "Milestone"), type("approval", "Approval"), type("request", "Request")], icons: [] },
    "/task/views": { msg: "ok", data: [] },
    "/task/time/": { msg: "ok", data: null },
    "/task/recurrence/": { msg: "ok", data: null },
    "/task/cycle/": { msg: "ok", data: null },
    "/task/clientReview/": { msg: "ok", data: null },
  }
  for (const t of TASKS) {
    // Q4-104 is a sub-task, under a parent whose name is too long for the panel's path.
    const parent = t.task_uuid === id(3) ? { task_parent_task: { task_uuid: id(0), task_name: "Write the launch announcement for the pilot customers" } } : {}
    answers[`/task/info/${t.task_uuid}`] = {
      msg: "ok",
      data: { ...t, ...parent, ...ownRead, task_description: "<p>What it needs.</p>", task_project: { ...project }, task_sub_tasks: [], task_comments: [], task_activities: [], task_attachments: [], task_collaborators: [], task_blocked_by: [], task_blocks: [] },
    }
  }
  await stubBackend(page, testInfo, { ...answers, ...extra })
  await page.goto(`/app/project/${P}?tab=${tab}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
  // A desktop row or card carries its task's id; a phone row carries its key.
  await expect(page.locator("[data-task-id], [data-task-key]").first()).toBeVisible({ timeout: 60_000 })
}

/** The key in the panel's path is whole, and clear of Mark complete (STEP4 #8: it never truncates). */
async function keyStandsClear(panel: Locator) {
  const key = panel.locator("[data-crumb-key]")
  const k = await key.boundingBox()
  const c = await panel.locator("[data-complete-room] button").boundingBox()
  expect(k && c && k.x + k.width <= c.x + 0.5, `the key ends at ${k && k.x + k.width}, Mark complete starts at ${c?.x}`).toBe(true)
  expect(await key.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true)
}

/** Saved for review when SHOTS_DIR is set: name-<width>-<theme>.png. A shot
 *  is of the screen alone: no toast from a read this test didn't answer. */
async function shot(page: Page, name: string, theme: string) {
  const dir = process.env.SHOTS_DIR
  if (!dir) return
  await expect(page.getByText("Not in this test")).toHaveCount(0)
  await page.waitForTimeout(400)
  await page.screenshot({ path: `${dir}/${name}-${page.viewportSize()?.width}-${theme}.png` })
}

for (const theme of ["light", "dark"] as const) {
  test.describe(`keys at 1280, ${theme}`, () => {
    test.use({ viewport: { width: 1280, height: 860 }, colorScheme: theme })

    test("a list reads each task by its key, with its type, and the panel walks the list", async ({ page }, testInfo) => {
      test.setTimeout(180_000)
      await openProject(page, testInfo, "list")
      const first = page.locator(`[data-task-id="${id(0)}"]`)
      await expect(first.locator("[data-task-key]")).toHaveText("Q4-12")
      await expect(page.getByRole("img", { name: "Milestone" }).first()).toBeVisible()
      await shot(page, "list", theme)
      await first.getByText(TASKS[0].task_name, { exact: true }).click()
      const panel = page.locator("[data-task-panel]")
      await expect(panel.getByRole("button", { name: "Copy key Q4-12" })).toBeVisible({ timeout: 20_000 })
      await expect(panel.locator("[data-property=type]")).toContainText("Task")
      // In the 452 px panel the key stands clear, and Mark complete keeps its words:
      // Copy link and Open the full page fold into More, which offers both.
      await keyStandsClear(panel)
      expect((await panel.getByText("Mark complete", { exact: true }).boundingBox())!.width).toBeGreaterThan(40)
      await expect(panel.getByRole("link", { name: "Open the full page" })).toBeHidden()
      await panel.getByRole("button", { name: "More task actions" }).click()
      await expect(page.getByRole("menuitem", { name: "Open the full page" })).toHaveAttribute("href", "/app/task/Q4-12")
      await shot(page, "panel-more", theme)
      await page.keyboard.press("Escape")
      await expect(page.getByRole("menu")).toBeHidden()
      await shot(page, "panel", theme)
      // Next is the list's next row: a sub-task, whose long parent gives way to the key.
      await panel.getByRole("button", { name: "Next task (J)" }).click()
      await expect(panel.getByRole("button", { name: "Copy key Q4-104" })).toBeVisible({ timeout: 20_000 })
      // Its parent gives way first: a glyph, its name in the tip, leading into
      // the key; and Mark complete keeps words, not its 28 px glyph alone
      // (DESIGN-BUILD-10, 24 Oct; d5h1 found it a glyph here).
      const parentCrumb = panel.getByRole("button", { name: /the task this one is part of$/ })
      await expect(parentCrumb).toBeVisible()
      expect(await parentCrumb.locator("[data-crumb-name]").evaluate((el) => el.getBoundingClientRect().width)).toBeLessThanOrEqual(1)
      expect((await panel.locator("[data-complete-room] button").boundingBox())!.width).toBeGreaterThan(60)
      await keyStandsClear(panel)
      await shot(page, "panel-subtask", theme)
    })

    test("someone who can't edit keeps Completed in words, with Copy link and the full page in More", async ({ page }, testInfo) => {
      test.setTimeout(180_000)
      await openProject(page, testInfo, "list", { task_status: "done", task_access: { edit: false, delete: false, comment: true, log_time: false } })
      await page.locator(`[data-task-id="${id(0)}"]`).getByText(TASKS[0].task_name, { exact: true }).click()
      const panel = page.locator("[data-task-panel]")
      await expect(panel.getByRole("button", { name: "Copy key Q4-12" })).toBeVisible({ timeout: 20_000 })
      expect((await panel.getByText("Completed", { exact: true }).boundingBox())!.width).toBeGreaterThan(40)
      // What they can't change reads as text at full ink: no disabled title
      // field in placeholder ink, no assignee picker at half strength.
      await expect(panel.locator("textarea:disabled")).toHaveCount(0)
      await expect(panel.getByRole("combobox", { name: /^Assignee: / })).toHaveCount(0)
      await expect(panel.getByText(TASKS[0].task_name, { exact: true }).first()).toBeVisible()
      // The task's state, not a held button.
      await expect(panel.getByRole("button", { name: "Task completed" })).toHaveCount(0)
      await expect(panel.getByRole("button", { name: "Copy task link" })).toBeHidden()
      await expect(panel.getByRole("link", { name: "Open the full page" })).toBeHidden()
      await panel.getByRole("button", { name: "More task actions" }).click()
      await expect(page.getByRole("menuitem")).toHaveText(["Copy link", "Open the full page"])
      await shot(page, "panel-viewer-more", theme)
      await page.keyboard.press("Escape")
      await expect(page.getByRole("menu")).toBeHidden()
      await shot(page, "panel-viewer", theme)
    })

    test("a board card carries its key, its type and its lock on its top line", async ({ page }, testInfo) => {
      test.setTimeout(180_000)
      await openProject(page, testInfo, "kanban")
      const card = page.locator(`[data-board] [data-task-id="${id(3)}"]`)
      await expect(card.locator("[data-card-key]")).toContainText("Q4-104")
      await expect(card.locator("[data-card-key]").getByRole("img", { name: "Feature" })).toBeVisible()
      await shot(page, "board", theme)
    })
  })

  test.describe(`keys at 390, ${theme}`, () => {
    test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: theme })

    test("a phone's list and task page read the key", async ({ page }, testInfo) => {
      test.setTimeout(180_000)
      await openProject(page, testInfo, "list")
      await expect(page.locator("[data-task-key]").filter({ hasText: /^\s*Q4-12\s*$/ })).toBeVisible()
      await expect(page.locator("[data-task-key]").filter({ hasText: "Q4-104" }).getByRole("img", { name: "Feature" })).toBeVisible()
      await shot(page, "list", theme)
      await page.goto(`/app/task/${id(1)}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
      await expect(page.getByRole("button", { name: "Copy key Q4-9" })).toBeVisible({ timeout: 60_000 })
      // Once, as the path's last crumb, as in the panel.
      await expect(page.getByText("Q4-9", { exact: true })).toHaveCount(1)
      await shot(page, "task", theme)
    })
  })
}

// A task's Link a doc or board (components/entityLink/LinkedItemsSection),
// whose search is a chunk of its own, loaded as its trigger is pointed at or
// pressed: in the panel at 1280 and on the task page at 390, by touch.
test.describe("linking a doc at 1280", () => {
  test.use({ viewport: { width: 1280, height: 860 } })
  test("the panel's Link a doc or board finds a doc through the workspace search and links it", async ({ page }, testInfo) => {
    test.setTimeout(180_000)
    const { sent, answers } = linking()
    await openProject(page, testInfo, "list", {}, answers)
    await page.locator(`[data-task-id="${id(0)}"]`).getByText(TASKS[0].task_name, { exact: true }).click()
    const panel = page.locator("[data-task-panel]")
    await linkVendorDoc(page, panel.getByRole("button", { name: "Link a doc or board" }), false)
    await expect.poll(() => sent).toEqual([{ source_type: "task", source_uuid: id(0), ref_type: "doc", ref_uuid: VENDOR_DOC.doc_uuid }])
    await expect(panel.getByText(VENDOR_DOC.doc_title)).toBeVisible()
  })
})

test.describe("linking a doc at 390", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  test("the task page's Link a doc or board finds a doc by touch and links it", async ({ page }, testInfo) => {
    test.setTimeout(180_000)
    const { sent, answers } = linking()
    await openProject(page, testInfo, "list", {}, answers)
    await page.goto(`/app/task/${id(1)}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
    const trigger = page.getByRole("button", { name: "Link a doc or board" })
    await expect(trigger).toBeAttached({ timeout: 60_000 })
    await linkVendorDoc(page, trigger, true)
    await expect.poll(() => sent).toEqual([{ source_type: "task", source_uuid: id(1), ref_type: "doc", ref_uuid: VENDOR_DOC.doc_uuid }])
    await expect(page.getByText(VENDOR_DOC.doc_title)).toBeVisible()
  })
})
