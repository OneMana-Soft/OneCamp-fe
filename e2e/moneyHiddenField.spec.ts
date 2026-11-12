import { expect, test, type Page, type TestInfo } from "@playwright/test"

import { SAM, TASK_PANEL_READS, expectEveryCallAnswered, reviewShot, stubBackend, withStatus } from "./stubbedApp"

// Money is for project admins only (V-698, V-698W): the server sends a
// project's money field to anyone not an admin of it marked hidden: true,
// with no value on any task, and refuses their write (403). The web takes its
// word: the panel says "Only project admins see money" with no box, the list's
// money column is a lock with those words, and the field is no filter, no
// ordering and no part of the CSV's read for them. A phone's list draws no
// custom field; its task page reads as the panel does, the task opened by a
// tap on its row. An admin's view is as ever: the value, and a box to change
// it. Every call the page makes is answered. With SHOTS_DIR set, each view is
// also saved for review, at the viewport and theme it ran in.

const P = "9e0a0000-0000-4000-8000-0000000000d8"
const NONE = "0001-01-01T00:00:00Z"
const WORDS = "Only project admins see money"
const id = (i: number) => `7a5c00d8-0000-4000-8000-${String(i + 1).padStart(12, "0")}`
const BUDGET = "f0a0d800-0000-4000-8000-000000000001"
const CHANNEL = "f0a0d800-0000-4000-8000-000000000002"
const BUDGET_FILTER = "field_f0a0d800000040008000000000000001"
const admin = { role: "admin", view: true, comment: true, create_tasks: true, edit_tasks: "all", delete_tasks: "all", log_time: true, post_updates: true, add_files: true, manage: true, manage_people: true, archive: true }
// A member who may change every task, but not the project's money.
const member = { ...admin, role: "member", delete_tasks: "own", manage: false, manage_people: false, archive: false }

type Reader = "admin" | "member"

const field = { project_id: P, position: 0, on_card: true }
const fieldsFor = (reader: Reader) => [
  { ...field, id: BUDGET, name: "Budget", type: "money", currency: "INR", options: [], filter_id: BUDGET_FILTER, hidden: reader === "member" },
  { ...field, id: CHANNEL, name: "Channel", type: "select", position: 1, options: [{ id: "o-email", label: "Email", color: "sky" }], filter_id: "field_f0a0d800000040008000000000000002", hidden: false },
]

const NAMES = ["Print the launch flyers", "Book the venue", "Write the launch announcement"]
function tasksFor(reader: Reader) {
  return NAMES.map((name, i) => ({
    task_uuid: id(i),
    task_name: name,
    task_status: i === 2 ? "inProgress" : "todo",
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
    task_created_by: SAM,
    task_project: { project_uuid: P, project_name: "Spring fair" },
    task_access: { edit: true, delete: true, comment: true, log_time: true },
    task_key: `SF-${i + 1}`,
    // The server lays no money value over a member's tasks (business/TaskField MergeFieldValuesFor).
    task_fields: { [CHANNEL]: "o-email", ...(reader === "admin" ? { [BUDGET]: 1250000 + i * 100000 } : {}) },
  }))
}

type Server = { writes: { field_id: string; value: unknown }[]; reads: string[]; csv: string[] }

async function openProject(page: Page, testInfo: TestInfo, reader: Reader, address = "") {
  const server: Server = { writes: [], reads: [], csv: [] }
  const tasks = tasksFor(reader)
  const project = { project_uuid: P, project_name: "Spring fair", project_is_admin: reader === "admin" ? 1 : 0, project_is_member: 1, project_members: [SAM], project_access: reader === "admin" ? admin : member }
  const answers: Record<string, unknown> = {
    ...TASK_PANEL_READS,
    [`/project/taskList/${P}`]: (url: URL) => {
      if (url.searchParams.get("format") === "csv") {
        server.csv.push(url.search)
        return { msg: "ok", data: "Task,Status\n" }
      }
      server.reads.push(url.search)
      return { msg: "ok", data: { ...project, project_task_count: tasks.length, project_tasks: tasks }, pageCount: 1 }
    },
    [`/project/info/${P}`]: { msg: "ok", data: project },
    // The board's read the list warms ahead (the same tasks, by column), no forecast yet, and the project's live topic.
    [`/project/taskListForKanban/${P}`]: {
      msg: "ok",
      data: { ...project, project_tasks_todo: tasks.filter((t) => t.task_status === "todo"), project_tasks_in_progress: tasks.filter((t) => t.task_status === "inProgress"), project_tasks_done_count: 0 },
    },
    [`/project/${P}/forecast`]: { msg: "ok", data: null },
    // A task's own reads beside the panel's: hours, no milestones.
    [`/project/${P}/estimates`]: { msg: "ok", data: { scale: null, kinds: [], can_edit: reader === "admin" } },
    [`/project/${P}/milestones`]: { msg: "ok", data: { milestones: [], can_manage: reader === "admin" } },
    "/task/milestone/": { msg: "ok", data: null },
    "/entities": { msg: "ok", data: [{ kind: "project", id: P, access: "view", data: { project_name: "Spring fair" }, topic: `project/${P}` }] },
    [`/project/membersInfo/${P}`]: { msg: "ok", data: project },
    [`/project/memberWithAdminFlag/${P}`]: { msg: "ok", data: project },
    [`/project/${P}/updates`]: { msg: "ok", data: { updates: [], can_post: true } },
    [`/project/${P}/cycles`]: { msg: "ok", data: { cycles: [], can_edit: reader === "admin" } },
    [`/project/${P}/goals`]: { msg: "ok", data: { goals: [] } },
    "/link/source/task/": { msg: "ok", data: { docs: [], boards: [] } },
    "/user/dm-ai-targets": { msg: "ok", data: [] },
    "/notices": { msg: "ok", data: [] },
    [`/project/${P}/statuses`]: { msg: "ok", data: null },
    [`/project/${P}/fields`]: { msg: "ok", data: { fields: fieldsFor(reader), can_edit: reader === "admin" } },
    [`/project/${P}/tags`]: { msg: "ok", data: [] },
    [`/project/${P}/types`]: { msg: "ok", data: [], icons: [] },
    "/task/views": { msg: "ok", data: [] },
    "/restriction": { msg: "ok", data: { restricted: false, people: [], can_change: reader === "admin" } },
    // A value's save: the server takes an admin's, and refuses a member's money in words (V-698).
    "/task/field": (_url: URL, request: { postDataJSON: () => { field_id: string; value: unknown } }) => {
      const body = request.postDataJSON()
      server.writes.push({ field_id: body.field_id, value: body.value })
      if (reader !== "admin" && body.field_id === BUDGET) return withStatus(403, { msg: "Only project admins can set money fields." })
      return { msg: "ok", data: { value: body.value } }
    },
  }
  for (const t of tasks) {
    answers[`/task/info/${t.task_uuid}`] = {
      msg: "ok",
      data: { ...t, task_description: "<p>What it needs.</p>", task_project: { ...project }, task_sub_tasks: [], task_comments: [], task_activities: [], task_attachments: [], task_collaborators: [], task_blocked_by: [], task_blocks: [] },
    }
  }
  await stubBackend(page, testInfo, answers)
  await page.addInitScript(() => {
    localStorage.setItem("oc_keys_tip_seen", "1")
    localStorage.setItem("onecamp:demo-lead-dismissed", "1")
  })
  await page.goto(`/app/project/${P}?tab=list${address}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
  await expect(page.locator(`[data-task-id="${id(0)}"]`).first()).toBeVisible({ timeout: 60_000 })
  return server
}

/** Saved for review when SHOTS_DIR is set (money-<name>-<width>-<theme>.png), still and with no stub's toast. */
const shot = (page: Page, name: string, theme: string) => reviewShot(page, `money-${name}`, theme)

/** Display's Budget property on, so the list draws the field's column, and Display closed again. */
async function showBudget(page: Page) {
  await page.getByRole("button", { name: "Display" }).click()
  const menu = page.locator("[data-display-menu]")
  await menu.getByRole("button", { name: "Budget", exact: true }).click()
  await expect(menu.getByRole("button", { name: "Budget", exact: true })).toHaveAttribute("aria-pressed", "true")
  await page.keyboard.press("Escape")
  await expect(menu).toHaveCount(0)
}

const moneyCell = (page: Page, i: number) => page.locator(`[data-task-id="${id(i)}"] [data-field-cell="money"]`).first()

for (const theme of ["light", "dark"] as const) {
  test.describe(`money fields at 1280, ${theme}`, () => {
    test.use({ viewport: { width: 1280, height: 860 }, colorScheme: theme })

    test("a member sees the words in the list and the panel, no box, no filter, ordering or CSV of it, and sends nothing", async ({ page }, testInfo) => {
      test.setTimeout(180_000)
      // A link (or a saved view an admin made) that filters on the money field: its filter goes for the member.
      const address = `&filters=${encodeURIComponent(JSON.stringify([{ id: BUDGET_FILTER, value: ["any"] }]))}`
      const server = await openProject(page, testInfo, "member", address)
      await expect.poll(() => server.reads.at(-1) ?? "").not.toContain(BUDGET_FILTER)

      await showBudget(page)
      const cell = moneyCell(page, 0)
      await expect(cell.locator("[data-field-hidden]")).toBeVisible()
      await expect(cell).toHaveAttribute("data-field-cell", "money")
      await expect(cell.locator("[data-field-hidden]")).toHaveAttribute("title", WORDS)
      await expect(page.getByText(/12,500/)).toHaveCount(0)
      await shot(page, "member-list", theme)

      // No filter of it: the Fields filter offers the channel alone.
      await page.getByRole("button", { name: /Fields/ }).click()
      const filter = page.locator("[cmdk-root]")
      await expect(filter.getByRole("option", { name: /Email/ })).toBeVisible()
      await expect(filter.getByText("Channel", { exact: true })).toBeVisible()
      await expect(filter.getByText("Budget", { exact: true })).toHaveCount(0)
      await page.keyboard.press("Escape")
      await expect(filter).toHaveCount(0)

      // No ordering by it, and the CSV is read with no filter of it.
      await page.getByRole("button", { name: "Display" }).click()
      const menu = page.locator("[data-display-menu]")
      await menu.getByRole("combobox", { name: "Ordering" }).click()
      await expect(page.getByRole("option", { name: "Due date" })).toBeVisible()
      await expect(page.getByRole("option", { name: /Budget/ })).toHaveCount(0)
      await page.keyboard.press("Escape")
      await expect(page.getByRole("option", { name: "Due date" })).toHaveCount(0)
      if (!(await menu.isVisible())) await page.getByRole("button", { name: "Display" }).click()
      await menu.getByRole("button", { name: "Export CSV" }).click()
      await expect.poll(() => server.csv.length).toBe(1)
      expect(server.csv[0]).not.toContain(BUDGET_FILTER)
      await page.keyboard.press("Escape")

      // The panel: the words in place of a value, no box or button for it.
      await page.locator(`[data-task-id="${id(0)}"]`).first().getByText(NAMES[0], { exact: true }).click()
      const panel = page.locator("[data-task-panel]")
      const row = panel.locator("[data-field-hidden-row]")
      await expect(row).toContainText("Budget", { timeout: 20_000 })
      await expect(row).toContainText(WORDS)
      await expect(row.locator("input, button, [role=combobox]")).toHaveCount(0)
      await expect(panel.getByLabel("Budget", { exact: true })).toHaveCount(0)
      await shot(page, "member-panel", theme)
      expect(server.writes).toEqual([])
      await expectEveryCallAnswered(page)
    })

    test("an admin sees each value in the list and the panel, and changes one", async ({ page }, testInfo) => {
      test.setTimeout(180_000)
      const server = await openProject(page, testInfo, "admin")
      await showBudget(page)
      await expect(moneyCell(page, 0)).toContainText(/12,500/)
      await expect(page.locator("[data-field-hidden]")).toHaveCount(0)
      await shot(page, "admin-list", theme)

      await page.locator(`[data-task-id="${id(0)}"]`).first().getByText(NAMES[0], { exact: true }).click()
      const panel = page.locator("[data-task-panel]")
      await expect(panel.getByLabel("Budget", { exact: true })).toBeVisible({ timeout: 20_000 })
      await expect(panel.getByText(WORDS)).toHaveCount(0)
      await panel.getByLabel("Budget", { exact: true }).click()
      const box = panel.getByLabel("Budget", { exact: true })
      await expect(box).toHaveJSProperty("tagName", "INPUT")
      await box.fill("9,900.50")
      await box.blur()
      await expect.poll(() => server.writes).toEqual([{ field_id: BUDGET, value: 990050 }])
      await expect(panel.getByLabel("Budget", { exact: true })).toContainText("9900.50")
      await shot(page, "admin-panel", theme)
      await expectEveryCallAnswered(page)
    })
  })

  test.describe(`money fields at 390, ${theme}`, () => {
    test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: theme })

    test("a member's phone: no money in the list, and the task's words with no box", async ({ page }, testInfo) => {
      test.setTimeout(180_000)
      const server = await openProject(page, testInfo, "member")
      // A phone's list rows draw no custom field (taskListTask): no value of it, and nothing to hide.
      const first = page.locator(`[data-task-id="${id(0)}"]`).first()
      await expect(first).toContainText(NAMES[0])
      await expect(page.locator("[data-field-cell], [data-field-hidden]")).toHaveCount(0)
      await expect(page.getByText(/12,500/)).toHaveCount(0)
      await shot(page, "member-list", theme)

      // The task, as a tap on its row opens it: its own page on a phone.
      await first.getByText(NAMES[0], { exact: true }).tap()
      await expect(page).toHaveURL(new RegExp(`/app/task/${id(0)}`), { timeout: 60_000 })
      const row = page.locator("[data-field-hidden-row]")
      await expect(row).toContainText(WORDS, { timeout: 60_000 })
      // The lock is drawn, not only the words' line.
      expect((await row.locator("svg").boundingBox())!.width).toBeGreaterThanOrEqual(12)
      await expect(row.locator("input, button, [role=combobox]")).toHaveCount(0)
      await expect(page.getByLabel("Budget", { exact: true })).toHaveCount(0)
      // A phone's task page puts its properties below the description: the shot shows the row.
      await row.scrollIntoViewIfNeeded()
      await shot(page, "member-panel", theme)
      expect(server.writes).toEqual([])
      await expectEveryCallAnswered(page)
    })

    test("an admin's phone: the value, and a box to change it", async ({ page }, testInfo) => {
      test.setTimeout(180_000)
      const server = await openProject(page, testInfo, "admin")
      await page.locator(`[data-task-id="${id(0)}"]`).first().getByText(NAMES[0], { exact: true }).tap()
      await expect(page).toHaveURL(new RegExp(`/app/task/${id(0)}`), { timeout: 60_000 })
      const value = page.getByLabel("Budget", { exact: true })
      await expect(value).toContainText(/12,?500/, { timeout: 60_000 })
      await expect(page.getByText(WORDS)).toHaveCount(0)
      await value.tap()
      const box = page.getByLabel("Budget", { exact: true })
      await expect(box).toHaveJSProperty("tagName", "INPUT")
      await box.fill("9900.5")
      await box.blur()
      await expect.poll(() => server.writes).toEqual([{ field_id: BUDGET, value: 990050 }])
      await page.getByLabel("Budget", { exact: true }).scrollIntoViewIfNeeded()
      await shot(page, "admin-panel", theme)
      await expectEveryCallAnswered(page)
    })
  })
}
