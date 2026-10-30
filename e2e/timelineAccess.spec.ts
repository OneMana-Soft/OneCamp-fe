import { expect, test, type Locator, type Page, type Request, type TestInfo } from "@playwright/test"

import { finger } from "./finger"
import { SAM, stubBackend } from "./stubbedApp"

// Audit A2-2, on a production build: in a project where members change only
// their own tasks, the timeline offers a member only their own to move. It
// offered every bar, handle and Unscheduled row on the project's can_edit,
// which is true for any member, and the server refused the rest. The moves
// are recorded as the server would take them: a drag of someone else's bar or
// row sends nothing, and the member's own sends its one move. A phone's
// timeline only reads, for everyone.

const P = "9e0a0000-0000-4000-8000-0000000000a2"
const BEN = { user_uuid: "7c1e2d3f-0000-4000-8000-0000000000b1", user_name: "ben", user_full_name: "Ben Ito" }
const MEMBER = { role: "member", view: true, comment: true, create_tasks: true, edit_tasks: "assigned", delete_tasks: "assigned", log_time: true, post_updates: true, add_files: true, manage: false, manage_people: false, archive: false }

/** A day relative to today, at 17:00, as the server sends a date. */
const day = (offset: number) => {
  const d = new Date()
  d.setHours(17, 0, 0, 0)
  d.setDate(d.getDate() + offset)
  return d.toISOString()
}

const MINE = { task_uuid: "7a5c00a2-0000-4000-8000-000000000001", task_name: "Write the launch post", task_status: "todo", task_start_date: day(-1), task_due_date: day(2), task_assignee: SAM }
const THEIRS = { task_uuid: "7a5c00a2-0000-4000-8000-000000000002", task_name: "Book the venue", task_status: "todo", task_start_date: day(3), task_due_date: day(6), task_assignee: BEN }
const LOOSE_MINE = { task_uuid: "7a5c00a2-0000-4000-8000-000000000003", task_name: "Pick the hosting", task_status: "todo", task_assignee: SAM }
const LOOSE_THEIRS = { task_uuid: "7a5c00a2-0000-4000-8000-000000000004", task_name: "Order the banners", task_status: "todo", task_assignee: BEN }
const TASKS = [MINE, THEIRS, LOOSE_MINE, LOOSE_THEIRS]

async function openTimeline(page: Page, testInfo: TestInfo) {
  const project = { project_uuid: P, project_name: "Spring fair", project_is_admin: 0, project_is_member: 1, project_members: [SAM, BEN], project_access: MEMBER }
  const moves: Array<{ task_uuid?: string }> = []
  await stubBackend(page, testInfo, {
    // The timeline reads the project's milestones beside its tasks: none here.
    [`/project/${P}/milestones`]: { msg: "ok", data: { milestones: [], can_manage: true } },
    [`/project/${P}/timeline`]: { msg: "ok", data: { tasks: TASKS, total: TASKS.length, can_edit: true, project_access: MEMBER } },
    "/task/updateTaskDates": (_url: URL, request: Request) => {
      moves.push(request.postDataJSON())
      return { msg: "ok", data: { shifted: [] } }
    },
    [`/project/taskListForKanban/${P}`]: {
      msg: "ok",
      data: {
        ...project,
        project_tasks_backlog: [],
        project_tasks_todo: TASKS,
        project_tasks_in_progress: [],
        project_tasks_in_review: [],
        project_tasks_done: [],
        project_tasks_canceled: [],
        project_tasks_done_count: 0,
        project_tasks_canceled_count: 0,
        project_column_counts: { backlog: 0, todo: TASKS.length, inProgress: 0, inReview: 0, done: 0, canceled: 0 },
      },
    },
    [`/project/info/${P}`]: { msg: "ok", data: project },
    [`/project/membersInfo/${P}`]: { msg: "ok", data: project },
    [`/project/${P}/updates`]: { msg: "ok", data: { updates: [], can_post: true } },
    [`/project/${P}/cycles`]: { msg: "ok", data: { cycles: [], can_edit: false } },
    [`/project/${P}/goals`]: { msg: "ok", data: { goals: [] } },
    [`/project/${P}/statuses`]: { msg: "ok", data: { built_in: [], custom: [], colors: [], max: 20 } },
    [`/project/${P}/fields`]: { msg: "ok", data: { fields: [], can_edit: false } },
    [`/project/${P}/tags`]: { msg: "ok", data: [] },
    [`/project/${P}/types`]: { msg: "ok", data: [], icons: [] },
    "/task/views": { msg: "ok", data: [] },
    "/user/dm-ai-targets": { msg: "ok", data: [] },
    "/notices": { msg: "ok", data: [] },
    "/entities": { msg: "ok", data: [{ kind: "project", id: P, access: "view", data: { project_name: "Spring fair" }, topic: `project/${P}` }] },
    "/task/info/": (url: URL) => {
      const t = TASKS.find((x) => url.pathname.endsWith(x.task_uuid)) ?? MINE
      return { msg: "ok", data: { ...t, task_description: "", task_sub_tasks: [], task_comments: [], task_activities: [], task_attachments: [], task_collaborators: [], task_blocked_by: [], task_blocks: [] } }
    },
  })
  await page.addInitScript(() => localStorage.setItem("oc_keys_tip_seen", "1"))
  await page.goto(`/app/project/${P}?tab=timeline`, { waitUntil: "domcontentloaded", timeout: 120_000 })
  await expect(bar(page, MINE.task_uuid)).toBeVisible({ timeout: 90_000 })
  return moves
}

const bar = (page: Page, id: string) => page.locator(`[data-bar="${id}"]`)
const row = (page: Page, name: string) => page.locator("[data-unscheduled]").getByRole("button", { name: new RegExp(name) })

/** Holds `from` with the mouse and carries it `dx` px right (or onto `to`'s middle), then lets go. */
async function carry(page: Page, from: Locator, to: { dx: number } | Locator) {
  const a = (await from.boundingBox())!
  const x = a.x + a.width / 2
  const y = a.y + a.height / 2
  const b = "dx" in to ? { x: x + to.dx, y } : await to.boundingBox().then((box) => ({ x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 }))
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + 8, y, { steps: 2 })
  await page.mouse.move(b.x, b.y, { steps: 6 })
  await page.mouse.up()
}

test.describe("a member who changes only their own tasks, on a computer", () => {
  test.use({ viewport: { width: 1280, height: 860 } })

  test("moves their own bar and Unscheduled task, and not another's", async ({ page }, testInfo) => {
    test.setTimeout(180_000)
    const moves = await openTimeline(page, testInfo)
    await expect(bar(page, THEIRS.task_uuid)).not.toHaveAttribute("aria-describedby", /.+/)
    await expect(bar(page, MINE.task_uuid)).toHaveAttribute("aria-describedby", /.+/)
    // Another's bar: carried two weeks' worth, it sends nothing. The member's
    // own move after it is the first the server hears.
    await carry(page, bar(page, THEIRS.task_uuid), { dx: 48 })
    await carry(page, bar(page, MINE.task_uuid), { dx: 48 })
    await expect.poll(() => moves.length).toBe(1)
    expect(moves[0].task_uuid).toBe(MINE.task_uuid)
    // Unscheduled, open on a computer until someone closes it: another's task
    // stays put; the member's own lands on a day. A row that can't move still
    // opens its task, so it is a plain button, not a disabled one.
    await expect(page.getByRole("complementary", { name: "Tasks with no dates" })).toBeVisible()
    await expect(row(page, LOOSE_MINE.task_name)).toHaveAttribute("aria-roledescription", "draggable task")
    await expect(row(page, LOOSE_THEIRS.task_name)).not.toHaveAttribute("aria-roledescription", /.+/)
    await carry(page, row(page, LOOSE_THEIRS.task_name), bar(page, THEIRS.task_uuid))
    await carry(page, row(page, LOOSE_MINE.task_name), bar(page, THEIRS.task_uuid))
    await expect.poll(() => moves.length).toBe(2)
    expect(moves[1].task_uuid).toBe(LOOSE_MINE.task_uuid)
  })
})

test.describe("a member who changes only their own tasks, on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })

  test("reads their tasks, and offers none to move: a phone's timeline only reads", async ({ page }, testInfo) => {
    test.setTimeout(180_000)
    await openTimeline(page, testInfo)
    for (const t of [MINE, THEIRS]) await expect(bar(page, t.task_uuid)).not.toHaveAttribute("aria-describedby", /.+/)
    await page.getByRole("button", { name: /^Unscheduled/ }).tap()
    await expect(page.getByRole("complementary", { name: "Tasks with no dates" })).toBeVisible()
    for (const t of [LOOSE_MINE, LOOSE_THEIRS]) await expect(row(page, t.task_name)).not.toHaveAttribute("aria-roledescription", /.+/)
    await expect(page.getByText("Drag a task onto a day to make it due then.")).toHaveCount(0)
  })
})

// A2-1: the grid took no drop from a mouse or a finger, so the member's own
// task carried from Unscheduled always went back; then, counted as the grid
// under the panel drawn over it, a task let go there was "Dropped" though
// nothing moved. It lands on the day under the pointer or the finger,
// scrolled or not, and goes back from the panel; from the keyboard, Space
// lifts it, each arrow moves it a day, and Space lands it there.
const said = (page: Page) => page.locator("[data-announce]")

/**
 * Scrolls the timeline eight days on (MINE's bar is four days wide), so a
 * point on screen is days from the same point on the grid as it opened, and
 * gives the middle of yesterday, the first of MINE's days.
 */
async function yesterdayScrolled(page: Page) {
  const first = (await bar(page, MINE.task_uuid).boundingBox())!
  await page.getByRole("region", { name: "Timeline" }).evaluate((el, by) => {
    el.scrollLeft += by
  }, first.width * 2)
  const b = (await bar(page, MINE.task_uuid).boundingBox())!
  return { x: b.x + b.width / 8, y: b.y + b.height / 2 }
}

/** The ghost bar shows the day under x. */
const ghostUnder = (page: Page, x: number) =>
  expect.poll(async () => page.locator("[data-drop-ghost]").boundingBox().then((g) => !!g && g.x <= x && x < g.x + g.width)).toBe(true)

test.describe("a task from Unscheduled, carried on a computer", () => {
  test.use({ viewport: { width: 1280, height: 860 } })

  test("lands on the day under the mouse, and goes back when let go over the panel", async ({ page }, testInfo) => {
    test.setTimeout(180_000)
    const moves = await openTimeline(page, testInfo)
    await carry(page, row(page, LOOSE_MINE.task_name), { dx: -24 })
    await expect(said(page)).toHaveText(`Cancelled. ${LOOSE_MINE.task_name} is back in Unscheduled.`)
    const to = await yesterdayScrolled(page)
    const from = (await row(page, LOOSE_MINE.task_name).boundingBox())!
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
    await page.mouse.down()
    await page.mouse.move(from.x + from.width / 2 + 8, from.y + from.height / 2, { steps: 2 })
    await page.mouse.move(to.x, to.y, { steps: 6 })
    await ghostUnder(page, to.x)
    await page.mouse.up()
    await expect.poll(() => moves.length).toBe(1)
    expect(moves[0]).toMatchObject({ task_uuid: LOOSE_MINE.task_uuid, task_due_date: day(-1) })
  })

  test("from the keyboard: Space lifts it, each arrow moves it a day, and Space lands it", async ({ page }, testInfo) => {
    test.setTimeout(180_000)
    const moves = await openTimeline(page, testInfo)
    await row(page, LOOSE_MINE.task_name).focus()
    await page.keyboard.press("Space")
    await expect(said(page)).toHaveText(`Picked up ${LOOSE_MINE.task_name}. Unscheduled.`)
    // The first arrow brings it onto today, and each after moves it a day on.
    for (let i = 0; i < 3; i++) await page.keyboard.press("ArrowRight")
    await page.keyboard.press("Space")
    await expect.poll(() => moves.length).toBe(1)
    expect(moves[0]).toMatchObject({ task_uuid: LOOSE_MINE.task_uuid, task_due_date: day(2) })
  })
})

// A touch screen wider than a phone's drags as a computer does, the finger
// held a beat first (lib/ui/pressLift); only a phone's timeline reads.
test.describe("a task from Unscheduled, carried by a finger on a tablet", () => {
  test.use({ viewport: { width: 1024, height: 768 }, hasTouch: true })

  test("lands on the day under the finger", async ({ page }, testInfo) => {
    test.setTimeout(180_000)
    const moves = await openTimeline(page, testInfo)
    const to = await yesterdayScrolled(page)
    const from = row(page, LOOSE_MINE.task_name)
    const a = (await from.boundingBox())!
    const at = { x: a.x + a.width / 2, y: a.y + a.height / 2 }
    const f = await finger(page)
    await f.down(at.x, at.y)
    // Held a beat, it lifts: its row is the slot it left.
    await expect(page.locator("[data-unscheduled] [data-drag-state=placeholder]")).toBeVisible()
    for (let i = 1; i <= 6; i++) await f.move(at.x + ((to.x - at.x) * i) / 6, at.y + ((to.y - at.y) * i) / 6)
    await ghostUnder(page, to.x)
    await f.up()
    await expect.poll(() => moves.length).toBe(1)
    expect(moves[0]).toMatchObject({ task_uuid: LOOSE_MINE.task_uuid, task_due_date: day(-1) })
  })
})
