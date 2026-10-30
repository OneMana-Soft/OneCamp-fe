import { expect, test, type Page, type TestInfo } from "@playwright/test"

import { SAM, stubBackend } from "./stubbedApp"

// fluid-17 (21 Oct 2026): a phone's task list gives virtua one row height,
// and each row shows as soon as it is placed. A row once cleared its own
// visibility instead of saying "visible", so it inherited virtua's hidden box:
// the list drew nothing and a tap opened nothing. Both phone task lists, at
// 390: the project's list and My Tasks.

const P = "9e0a0000-0000-4000-8000-0000000000e1"
const NONE = "0001-01-01T00:00:00Z"
const ADMIN = { role: "admin", view: true, comment: true, create_tasks: true, edit_tasks: "all", delete_tasks: "all", log_time: true, post_updates: true, add_files: true, manage: true, manage_people: true, archive: true }
const PROJECT = { project_uuid: P, project_name: "Q4 launch", project_is_admin: 1, project_is_member: 1, project_members: [SAM], project_access: ADMIN }

const TASKS = Array.from({ length: 40 }, (_, i) => ({
  task_uuid: `7a5c00e1-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
  task_name: `Phone task ${i + 1}`,
  task_status: "todo",
  task_priority: "medium",
  task_label: "",
  task_due_date: "",
  task_start_date: "",
  task_rank: (i + 1) * 1024,
  task_created_at: "2026-10-01T09:00:00Z",
  task_status_since: "2026-10-01T09:00:00Z",
  task_deleted_at: NONE,
  task_sub_task_count: 0,
  task_comment_count: 0,
  task_assignee: SAM,
  task_project: { project_uuid: P, project_name: "Q4 launch" },
  task_access: { edit: true, delete: true, comment: true, log_time: true },
}))

/** The task page a tap opens, enough of it to answer. */
const taskInfo = (url: URL) => {
  const t = TASKS.find((x) => url.pathname.endsWith(x.task_uuid)) ?? TASKS[0]
  return { msg: "ok", data: { ...t, task_description: "", task_sub_tasks: [], task_comments: [], task_activities: [], task_attachments: [], task_collaborators: [], task_blocked_by: [], task_blocks: [] } }
}

async function openProjectList(page: Page, testInfo: TestInfo) {
  await stubBackend(page, testInfo, {
    [`/project/taskList/${P}`]: { msg: "ok", data: { ...PROJECT, project_task_count: TASKS.length, project_tasks: TASKS }, pageCount: 1 },
    [`/project/info/${P}`]: { msg: "ok", data: PROJECT },
    [`/project/membersInfo/${P}`]: { msg: "ok", data: PROJECT },
    [`/project/${P}/statuses`]: { msg: "ok", data: null },
    [`/project/${P}/fields`]: { msg: "ok", data: { fields: [], can_edit: true } },
    [`/project/${P}/cycles`]: { msg: "ok", data: { cycles: [], can_edit: true } },
    [`/project/${P}/goals`]: { msg: "ok", data: { goals: [] } },
    [`/project/${P}/tags`]: { msg: "ok", data: [] },
    [`/project/${P}/types`]: { msg: "ok", data: [], icons: [] },
    [`/project/${P}/updates`]: { msg: "ok", data: { updates: [], can_post: true } },
    "/task/info/": taskInfo,
    "/task/views": { msg: "ok", data: [] },
    "/user/dm-ai-targets": { msg: "ok", data: [] },
    "/notices": { msg: "ok", data: [] },
    "/entities": { msg: "ok", data: [{ kind: "project", id: P, access: "view", data: { project_name: "Q4 launch" }, topic: `project/${P}` }] },
  })
  await page.addInitScript(() => localStorage.setItem("oc_keys_tip_seen", "1"))
  await page.goto(`/app/project/${P}?tab=list`, { waitUntil: "domcontentloaded", timeout: 120_000 })
}

async function openMyTasks(page: Page, testInfo: TestInfo) {
  await stubBackend(page, testInfo, {
    "/user/assignedTaskList": { msg: "ok", pageCount: 1, data: { user_tasks: TASKS } },
    "/task/info/": taskInfo,
  })
  await page.goto("/app/myTask", { waitUntil: "domcontentloaded", timeout: 120_000 })
}

/** Each placed row's computed visibility, with its virtua row's and virtua's box's. */
const placed = (page: Page) =>
  page.locator("[data-phone-task-row]").evaluateAll((els) =>
    els.map((el) => {
      const item = el.parentElement!.parentElement!
      return { id: el.getAttribute("data-task-id"), row: getComputedStyle(el).visibility, item: getComputedStyle(item).visibility, box: getComputedStyle(item.parentElement!).visibility }
    }),
  )

/** Every row placed is seen: the row and its virtua row say visible, inside virtua's hidden box. */
async function expectRowsShown(page: Page) {
  const rows = await placed(page)
  expect(rows.length).toBeGreaterThan(5)
  for (const r of rows) {
    expect(r, `row ${r.id}`).toMatchObject({ row: "visible", item: "visible" })
    // virtua hides its own box, so a row that says nothing shows nothing.
    expect(r.box, `virtua's box around ${r.id}`).toBe("hidden")
  }
}

/** The list's scroller, found from a row. */
const scrollBy = (page: Page, dy: number) =>
  page.locator("[data-phone-task-row]").first().evaluate((el, d) => {
    let s = el.parentElement
    while (s && !(s.scrollHeight > s.clientHeight + 4 && /(auto|scroll)/.test(getComputedStyle(s).overflowY))) s = s.parentElement
    s!.scrollTop += d
  }, dy)

const LISTS = [
  { name: "the project's list", open: openProjectList },
  { name: "My Tasks", open: openMyTasks },
]

test.describe("a phone's task rows (fluid-17)", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })

  for (const list of LISTS) {
    test(`${list.name}: a row is seen as soon as it is placed, and as the list scrolls`, async ({ page }, testInfo) => {
      await list.open(page, testInfo)
      await expect(page.locator(`[data-task-id="${TASKS[0].task_uuid}"][data-phone-task-row]`)).toBeVisible({ timeout: 60_000 })
      await expectRowsShown(page)
      const shot = (when: string) => process.env.SHOTS_DIR && page.screenshot({ path: `${process.env.SHOTS_DIR}/phone-${list.name.replace(/\W+/g, "-")}-${when}.png` })
      await shot("placed")
      // Rows placed by a scroll show too.
      await scrollBy(page, 900)
      await expect(page.locator(`[data-task-id="${TASKS[20].task_uuid}"][data-phone-task-row]`)).toBeVisible()
      await expectRowsShown(page)
      await shot("scrolled")
    })

    test(`${list.name}: a tap on a row opens its task`, async ({ page }, testInfo) => {
      await list.open(page, testInfo)
      const row = page.locator(`[data-task-id="${TASKS[2].task_uuid}"][data-phone-task-row]`)
      await expect(row).toBeVisible({ timeout: 60_000 })
      await row.getByText(TASKS[2].task_name).tap()
      await page.waitForURL(new RegExp(`/app/task/${TASKS[2].task_uuid}`), { timeout: 30_000 })
    })
  }
})
