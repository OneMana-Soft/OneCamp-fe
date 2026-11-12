import { expect, test, type Page, type TestInfo } from "@playwright/test"

import { SAM, stubBackend, withStatus } from "./stubbedApp"

// H3 (FLUIDITY-18, 6 Nov 2026): the task list draws only what changed. A kept
// tab's list keeps its rows as another tab hides it, J and K draw only the rows
// they move between, the first X draws no other row (the empty boxes beside
// the others are drawn by CSS), and the timeline's tool row stays as it
// scrolls. None of it may show: in a real browser the list opens grouped, keys,
// boxes and taps select, Show N more draws the rest, the tabs switch and come
// back, and an empty or failed read says so.

const P = "9e0a0000-0000-4000-8000-0000000000e3"
const NONE = "0001-01-01T00:00:00Z"
const ADMIN = { role: "admin", view: true, comment: true, create_tasks: true, edit_tasks: "all", delete_tasks: "all", log_time: true, post_updates: true, add_files: true, manage: true, manage_people: true, archive: true }
const PROJECT = { project_uuid: P, project_name: "Q4 launch", project_is_admin: 1, project_is_member: 1, project_members: [SAM], project_access: ADMIN }
const day = (d: number) => new Date(Date.UTC(2026, 10, 6 + d, 12)).toISOString()

// 70 open tasks (an open group shows its first sixty) and 8 done (Done shows its newest five).
const TASKS = Array.from({ length: 78 }, (_, i) => ({
  task_uuid: `7a5c00e3-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
  task_name: `Task ${i + 1}`,
  task_status: i < 70 ? "todo" : "done",
  task_priority: "medium",
  task_label: "",
  task_due_date: i % 4 === 0 ? day((i % 20) + 2) : "",
  task_start_date: i % 4 === 0 ? day(i % 20) : "",
  task_rank: (i + 1) * 1024,
  task_created_at: "2026-10-01T09:00:00Z",
  task_status_since: `2026-10-${String(1 + (i % 28)).padStart(2, "0")}T09:00:00Z`,
  task_deleted_at: NONE,
  task_sub_task_count: 0,
  task_comment_count: 0,
  task_assignee: SAM,
  task_project: { project_uuid: P, project_name: "Q4 launch" },
  task_access: { edit: true, delete: true, comment: true, log_time: true },
}))

type Server = { fail: boolean; tasks: typeof TASKS }

async function openList(page: Page, testInfo: TestInfo, server: Server, shown: string | null = "[data-grouped-list] [data-task-id]") {
  await page.addInitScript(() => localStorage.setItem("oc_keys_tip_seen", "1"))
  const column = (status: string) => server.tasks.filter((t) => t.task_status === status)
  await stubBackend(page, testInfo, {
    [`/project/taskList/${P}`]: () =>
      server.fail
        ? withStatus(500, { msg: "The server is having a moment." })
        : { msg: "ok", data: { ...PROJECT, project_task_count: server.tasks.length, project_tasks: server.tasks }, pageCount: 1 },
    [`/project/info/${P}`]: { msg: "ok", data: PROJECT },
    [`/project/membersInfo/${P}`]: { msg: "ok", data: PROJECT },
    [`/project/${P}/statuses`]: { msg: "ok", data: null },
    [`/project/${P}/fields`]: { msg: "ok", data: { fields: [], can_edit: true } },
    [`/project/${P}/cycles`]: { msg: "ok", data: { cycles: [], can_edit: true } },
    [`/project/${P}/goals`]: { msg: "ok", data: { goals: [] } },
    [`/project/${P}/tags`]: { msg: "ok", data: [] },
    [`/project/${P}/types`]: { msg: "ok", data: [], icons: [] },
    [`/project/${P}/updates`]: { msg: "ok", data: { updates: [], can_post: true } },
    [`/project/${P}/milestones`]: { msg: "ok", data: { milestones: [], can_manage: true } },
    [`/project/${P}/timeline`]: () => ({
      msg: "ok",
      data: {
        tasks: server.tasks.map((t) => ({ task_uuid: t.task_uuid, task_name: t.task_name, task_status: t.task_status, task_priority: "medium", task_start_date: t.task_start_date, task_due_date: t.task_due_date, task_created_at: t.task_created_at, task_assignee: SAM })),
        total: server.tasks.length,
        can_edit: true,
        project_access: ADMIN,
      },
    }),
    [`/project/taskListForKanban/${P}`]: () => ({
      msg: "ok",
      data: {
        ...PROJECT,
        project_tasks_backlog: [],
        project_tasks_todo: column("todo").slice(0, 20),
        project_tasks_in_progress: [],
        project_tasks_in_review: [],
        project_tasks_done: column("done"),
        project_tasks_canceled: [],
        project_tasks_done_count: column("done").length,
        project_tasks_canceled_count: 0,
        project_column_counts: { backlog: 0, todo: column("todo").length, inProgress: 0, inReview: 0, done: column("done").length, canceled: 0 },
      },
    }),
    "/task/info/": (url: URL) => {
      const t = server.tasks.find((x) => url.pathname.endsWith(x.task_uuid)) ?? server.tasks[0]
      return { msg: "ok", data: { ...t, task_project: { ...t.task_project, project_access: ADMIN } } }
    },
    "/task/views": { msg: "ok", data: [] },
    "/user/dm-ai-targets": { msg: "ok", data: [] },
    "/notices": { msg: "ok", data: [] },
    "/entities": { msg: "ok", data: [{ kind: "project", id: P, access: "view", data: { project_name: "Q4 launch" }, topic: `project/${P}` }] },
  })
  await page.goto(`/app/project/${P}?tab=list`, { waitUntil: "domcontentloaded", timeout: 120_000 })
  if (shown) await expect(page.locator(shown).first()).toBeVisible({ timeout: 60_000 })
}

/** Saved for review when SHOTS_DIR is set: name-<width>.png. */
async function shot(page: Page, name: string) {
  const dir = process.env.SHOTS_DIR
  if (!dir) return
  await page.waitForTimeout(400)
  await page.screenshot({ path: `${dir}/${name}-${page.viewportSize()?.width}.png` })
}

const rows = (page: Page) => page.locator("[data-grouped-list] [data-task-id]")
const rowOf = (page: Page, i: number) => page.locator(`[data-grouped-list] [data-task-id="${TASKS[i].task_uuid}"]`)
const bulk = (page: Page, n: number) => page.getByRole("toolbar", { name: `${n} ${n === 1 ? "task" : "tasks"} selected` })
// A row's select box as a screen reader finds it: by its role and the row's name (the tree a browser builds, CSS applied).
const boxOf = (page: Page, i: number) => rowOf(page, i).getByRole("checkbox", { name: `Select ${TASKS[i].task_name}` })

/** The select slot's box on a row: its size and whether it draws a ring or a fill (an empty box, or the Checkbox). */
const slotLook = (page: Page, i: number) =>
  rowOf(page, i).evaluate((row) => {
    const slot = row.querySelector<HTMLElement>("span.w-4")
    const box = slot?.firstElementChild as HTMLElement | null
    if (!slot || !box) return null
    const r = box.getBoundingClientRect()
    const s = getComputedStyle(box)
    return { w: Math.round(r.width), h: Math.round(r.height), shown: getComputedStyle(slot).opacity === "1", drawn: s.boxShadow !== "none" || s.borderStyle !== "none" }
  })

test.describe("the task list on a computer, by the keyboard", () => {
  test.use({ viewport: { width: 1280, height: 860 } })

  test("opens grouped: an open group's first sixty and Done's newest five, and Show N more draws the rest", async ({ page }, testInfo) => {
    await openList(page, testInfo, { fail: false, tasks: TASKS })
    await expect(page.locator("[data-grouped-list] [data-group-header]")).toHaveCount(2)
    await expect(rows(page)).toHaveCount(65)
    await page.getByRole("button", { name: "Show 10 more" }).click()
    await expect(rows(page)).toHaveCount(75)
    await page.getByRole("button", { name: "Show 3 more" }).click()
    await expect(rows(page)).toHaveCount(78)
    await shot(page, "h3-list-open")
  })

  test("J and K move the highlight, X and Shift+J select, the others show an empty box, and a box under the pointer adds its row", async ({ page }, testInfo) => {
    await openList(page, testInfo, { fail: false, tasks: TASKS })
    await rowOf(page, 0).focus()
    await page.keyboard.press("j")
    await expect(rowOf(page, 1)).toHaveAttribute("data-highlighted", "true")
    await page.keyboard.press("j")
    await page.keyboard.press("k")
    await expect(rowOf(page, 1)).toHaveAttribute("data-highlighted", "true")
    await expect(rowOf(page, 2)).not.toHaveAttribute("data-highlighted", "true")
    await expect(page.locator("[data-grouped-list][data-any-selected]")).toHaveCount(0)
    // No selection: a row not reached has no box in the tree.
    await page.mouse.move(1270, 850)
    await expect(boxOf(page, 6)).toHaveCount(0)

    await page.keyboard.press("x")
    await expect(rowOf(page, 1)).toHaveAttribute("data-state", "selected")
    await expect(bulk(page, 1)).toBeVisible()
    await expect(page.locator("[data-grouped-list][data-any-selected]")).toHaveCount(1)
    // A selection: a screen reader finds every row's box by its name, picked or not.
    for (let i = 0; i < 9; i++) await expect(boxOf(page, i), `row ${i}'s box`).toHaveCount(1)
    await expect(boxOf(page, 1)).toBeChecked()
    await expect(boxOf(page, 6)).not.toBeChecked()
    // The selected row's Checkbox, and another row's empty box: the same 16px box, both shown.
    await page.mouse.move(1270, 850)
    const real = await slotLook(page, 1)
    const empty = await slotLook(page, 6)
    expect(real).toMatchObject({ w: 16, h: 16, shown: true, drawn: true })
    expect(empty).toMatchObject({ w: 16, h: 16, shown: true, drawn: true })
    await shot(page, "h3-select-box")

    await page.keyboard.press("Shift+j")
    await expect(bulk(page, 2)).toBeVisible()
    await rowOf(page, 5).hover()
    await rowOf(page, 5).getByRole("checkbox", { name: "Select Task 6" }).click()
    await expect(bulk(page, 3)).toBeVisible()
    await expect(rowOf(page, 5)).toHaveAttribute("data-state", "selected")
    await page.keyboard.press("Escape")
    await expect(page.locator("[data-grouped-list][data-any-selected]")).toHaveCount(0)
    await expect(boxOf(page, 7)).toHaveCount(0)
  })

  test("List, Board, Timeline and back: the list keeps its rows and its selection, and the timeline's tools work as it scrolls", async ({ page }, testInfo) => {
    await openList(page, testInfo, { fail: false, tasks: TASKS })
    await rowOf(page, 2).focus()
    await page.keyboard.press("x")
    await expect(bulk(page, 1)).toBeVisible()

    await page.getByRole("tab", { name: "Board" }).click()
    await expect(page.getByRole("tab", { name: "Board" })).toHaveAttribute("aria-selected", "true")
    await expect(rowOf(page, 0)).toBeHidden()

    await page.getByRole("tab", { name: "Timeline" }).click()
    const display = page.getByRole("button", { name: "Display" })
    await expect(display).toBeVisible({ timeout: 30_000 })
    const grid = page.locator("[data-timeline] [data-scroll-lead]")
    await grid.hover()
    for (let i = 0; i < 4; i++) await page.mouse.wheel(240, 160)
    await expect(display).toBeVisible()
    await display.click()
    await page.getByRole("menuitemcheckbox", { name: "Show weekends" }).click()
    await expect(page.getByRole("menu")).toBeHidden()
    await display.click()
    await expect(page.getByRole("menuitemcheckbox", { name: "Show weekends" })).toHaveAttribute("aria-checked", "false")
    await page.keyboard.press("Escape")
    await shot(page, "h3-timeline-tools")

    await page.getByRole("tab", { name: "List" }).click()
    await expect(rows(page)).toHaveCount(65)
    await expect(rowOf(page, 2)).toHaveAttribute("data-state", "selected")
    await expect(bulk(page, 1)).toBeVisible()
  })

  test("an empty project says so, and a failed read says so and comes back with Try again", async ({ page }, testInfo) => {
    const server: Server = { fail: true, tasks: [] }
    await openList(page, testInfo, server, null)
    await expect(page.getByText("Couldn't load this project's tasks")).toBeVisible({ timeout: 60_000 })
    server.fail = false
    await page.getByRole("button", { name: "Try again" }).click()
    await expect(page.getByRole("heading", { name: "No tasks yet" })).toBeVisible()
    await shot(page, "h3-list-empty")
  })
})

test.describe("the task list on a computer, by a mouse", () => {
  test.use({ viewport: { width: 1280, height: 860 } })

  // A pointer that arrives on a box and presses at once (a quick move and click, voice control, a switch): the box
  // it lands on takes the click. Its arrival used to swap the box for the Checkbox inside the click, so the click
  // was lost and the selection stayed at one.
  test("with one task picked, a click that arrives on another row's box adds it", async ({ page }, testInfo) => {
    await openList(page, testInfo, { fail: false, tasks: TASKS })
    await rowOf(page, 1).focus()
    await page.keyboard.press("x")
    await expect(bulk(page, 1)).toBeVisible()
    // No hover first: the click's own move brings the pointer onto the box.
    await page.mouse.move(1270, 850)
    await boxOf(page, 6).click()
    await expect(bulk(page, 2)).toBeVisible()
    await expect(rowOf(page, 6)).toHaveAttribute("data-state", "selected")
    await expect(rowOf(page, 6), "the click opened nothing").not.toHaveAttribute("data-opened", "true")
    await shot(page, "h3-select-box-mouse")
  })
})

// The computer list draws from a tablet's width up (context/MediaQueryContext isDesktop, 640px): a finger at both widths.
async function tapAddsARow(page: Page, testInfo: TestInfo, name: string) {
  await openList(page, testInfo, { fail: false, tasks: TASKS })
  await expect(boxOf(page, 4)).toHaveCount(0)
  await rowOf(page, 0).focus()
  await page.keyboard.press("x")
  await expect(bulk(page, 1)).toBeVisible()
  // A screen reader finds every row's box by its name while the list holds a selection.
  for (let i = 1; i < 7; i++) await expect(boxOf(page, i), `row ${i}'s box`).toHaveCount(1)
  const box = await boxOf(page, 0).boundingBox()
  const row = await rowOf(page, 4).boundingBox()
  expect(box && row).toBeTruthy()
  await page.touchscreen.tap(box!.x + box!.width / 2, row!.y + row!.height / 2)
  await expect(bulk(page, 2)).toBeVisible()
  await expect(rowOf(page, 4)).toHaveAttribute("data-state", "selected")
  await expect(boxOf(page, 4)).toBeChecked()
  await expect(rowOf(page, 4), "the tap opened nothing").not.toHaveAttribute("data-opened", "true")
  await shot(page, name)
}

test.describe("the task list on a computer, by touch", () => {
  test.use({ viewport: { width: 1280, height: 860 }, hasTouch: true })

  test("with one task picked, a tap on another row's box adds it", async ({ page }, testInfo) => {
    await tapAddsARow(page, testInfo, "h3-select-box-touch")
  })
})

test.describe("the task list on a tablet, by touch", () => {
  test.use({ viewport: { width: 800, height: 1100 }, hasTouch: true })

  test("with one task picked, a tap on another row's box adds it", async ({ page }, testInfo) => {
    await tapAddsARow(page, testInfo, "h3-select-box-tablet")
  })
})

test.describe("the task list on a phone, by a finger", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })

  test("opens, Select picks all and clears, and Board and back keep the list", async ({ page }, testInfo) => {
    await openList(page, testInfo, { fail: false, tasks: TASKS }, "[data-phone-task-row]")
    // At 390 the project's list is the phone list (the computer list's slot is not drawn here): its boxes take a tap.
    await page.getByRole("button", { name: "Select", exact: true }).tap()
    await expect(page.getByRole("checkbox", { name: "Select Task 1" })).toBeVisible()
    await page.getByRole("checkbox", { name: "Select Task 2" }).tap()
    await expect(page.getByRole("checkbox", { name: "Select Task 2" })).toBeChecked()
    await page.getByRole("button", { name: "Select all" }).tap()
    await expect(page.getByRole("checkbox", { name: "Select Task 1" })).toBeChecked()
    await shot(page, "h3-phone-select-all")
    await page.getByRole("button", { name: "Clear selection" }).tap()
    await expect(page.getByRole("checkbox", { name: "Select Task 1" })).not.toBeChecked()

    await page.getByRole("tab", { name: "Board" }).tap()
    await expect(page.getByRole("tab", { name: "Board" })).toHaveAttribute("aria-selected", "true")
    await page.getByRole("tab", { name: "Tasks" }).tap()
    await expect(page.locator("[data-phone-task-row]").first()).toBeVisible()
  })

  test("an empty project says so, and a failed read says so and comes back with Try again", async ({ page }, testInfo) => {
    const server: Server = { fail: true, tasks: [] }
    await openList(page, testInfo, server, null)
    await expect(page.getByText(/Couldn.t load/).first()).toBeVisible({ timeout: 60_000 })
    server.fail = false
    await page.getByRole("button", { name: "Try again" }).first().tap()
    await expect(page.getByText(/No tasks/).first()).toBeVisible()
    await shot(page, "h3-phone-empty")
  })
})
