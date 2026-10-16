import { expect, test, type Page, type TestInfo } from "@playwright/test"

import { SAM, stubBackend } from "./stubbedApp"

// A project's board on a phone (390 x 844, touch), as the owner asked: "verify
// how kanban works in mobile view". Each test is a fault the board had there:
// - a tapped card took the "opened" ring and nothing opened (the panel it
//   opened is not drawn on a phone);
// - the card's "Move to…" was a dropdown whose side menu ran off the screen,
//   and a tap on the scrim of the sheet that replaced it opened the task;
// - a column filled the screen, so nothing said the board went on, and the
//   last column stopped 12px off the margin the others keep;
// - a quick swipe flew past a column, from To do to Done;
// - back from a task, or a return to the Board tab, showed the first column
//   at its top;
// - a card held at the screen's edge flew past every column to the last;
// - the lifted card shrank to 280px as it was picked up;
// - the card's menu and the column's "+" took only a 24px touch;
// - the Display menu ran off a short phone, its last rows out of reach.

const P = "5a1e7c2d-0b3f-4d6a-8e9c-1f2a3b4c5d6e"
const NONE = "0001-01-01T00:00:00Z"
const NAMES = ["Draft launch email", "Fix login redirect on Safari", "Review pricing page copy", "Plan Q4 roadmap review", "Update onboarding checklist", "Write release notes", "Design empty state", "Audit tap targets"]
const card = (i: number, status: string) => ({
  task_uuid: `00000000-0000-4000-8000-${({ todo: "1", inProgress: "2", done: "3" } as Record<string, string>)[status]}${String(i).padStart(11, "0")}`,
  task_name: `${status === "todo" ? "" : `${status} `}${NAMES[i % NAMES.length]}`,
  task_status: status,
  task_priority: "medium",
  task_label: "",
  task_due_date: NONE,
  task_start_date: NONE,
  task_created_at: "2026-10-01T09:00:00Z",
  task_status_since: "2026-10-01T09:00:00Z",
  task_deleted_at: NONE,
  task_sub_task_count: 0,
  task_comment_count: 0,
  task_assignee: SAM,
  task_project: { project_uuid: P, project_name: "Website relaunch", project_is_admin: true },
})
const project = { project_uuid: P, project_name: "Website relaunch", project_is_admin: 1, project_is_member: 1, project_members: [SAM] }
const columns = {
  project_tasks_backlog: [],
  project_tasks_todo: NAMES.map((_, i) => card(i, "todo")),
  // Longer than the screen, so its cards scroll.
  project_tasks_in_progress: Array.from({ length: 10 }, (_, i) => card(i, "inProgress")),
  project_tasks_in_review: [],
  project_tasks_done: [0, 1, 2].map((i) => card(i, "done")),
  project_tasks_canceled: [],
  project_tasks_done_count: 3,
}

/** The board, its reads answered here; returns the moves it sends. */
async function openBoard(page: Page, testInfo: TestInfo) {
  const all = [...columns.project_tasks_todo, ...columns.project_tasks_in_progress, ...columns.project_tasks_done]
  const answers: Record<string, unknown> = {
    [`/project/taskListForKanban/${P}`]: { msg: "ok", data: { ...project, ...columns } },
    [`/project/info/${P}`]: { msg: "ok", data: project },
    [`/project/${P}/statuses`]: { msg: "ok", data: null },
    [`/project/${P}/fields`]: { msg: "ok", data: { fields: [], can_edit: true } },
    [`/project/${P}/tags`]: { msg: "ok", data: [] },
    "/task/moveTask": { msg: "ok", data: {} },
    "/task/time/": { msg: "ok", data: null },
    "/task/recurrence/": { msg: "ok", data: null },
    "/task/cycle/": { msg: "ok", data: null },
  }
  for (const t of all) {
    answers[`/task/info/${t.task_uuid}`] = {
      msg: "ok",
      data: { ...t, task_project: { ...project }, task_description: "<p>What it needs.</p>", task_sub_tasks: [], task_comments: [], task_activities: [], task_attachments: [], task_blocked_by: [], task_blocks: [] },
    }
  }
  await stubBackend(page, testInfo, answers)
  const moves: { task_status: string; task_uuid: string }[] = []
  page.on("request", (r) => {
    if (r.method() === "POST" && r.url().includes("/task/moveTask")) moves.push(JSON.parse(r.postData() ?? "{}"))
  })
  await page.goto(`/app/project/${P}?tab=kanban`, { waitUntil: "domcontentloaded", timeout: 120_000 })
  await expect(page.locator("[data-board] [data-task-id]").first()).toBeVisible({ timeout: 60_000 })
  return moves
}

/** A finger, as a phone sends it: down, held, moved, up. */
async function finger(page: Page) {
  const cdp = await page.context().newCDPSession(page)
  const at = (x: number, y: number) => [{ x, y, id: 1, radiusX: 4, radiusY: 4, force: 1 }]
  return {
    down: (x: number, y: number) => cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: at(x, y) }),
    move: (x: number, y: number) => cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: at(x, y) }),
    up: () => cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }),
  }
}

const columnLefts = (page: Page) =>
  page.evaluate(() => [...document.querySelectorAll<HTMLElement>("[data-board] [data-column]")].map((c) => Math.round(c.getBoundingClientRect().left)))

/** Where the board is: the column at the 16px margin, and how far down In progress's cards are. */
const place = (page: Page) =>
  page.evaluate(() => {
    const at = [...document.querySelectorAll<HTMLElement>("[data-board] [data-column]")].find((c) => Math.round(c.getBoundingClientRect().left) === 16)
    const cards = document.querySelector<HTMLElement>('[data-board] [data-column="inProgress"] [data-board-scroll]')
    return { column: at?.dataset.column, top: Math.round(cards?.scrollTop ?? -1) }
  })

test.describe("the board on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })

  test("a tapped card opens its task", async ({ page }, testInfo) => {
    test.setTimeout(120_000)
    await openBoard(page, testInfo)
    await page.locator('[data-column="todo"] [data-task-id]').nth(1).tap()
    await page.waitForURL(/\/app\/task\/00000000-0000-4000-8000-100000000001/, { timeout: 30_000 })
    await expect(page.locator("[data-task-panel]").getByText(NAMES[1]).first()).toBeVisible({ timeout: 30_000 })
  })

  test("a card's menu is a sheet: open it, or move it to another column", async ({ page }, testInfo) => {
    test.setTimeout(120_000)
    const moves = await openBoard(page, testInfo)
    const first = page.locator('[data-column="todo"] [data-task-id]').first()
    // On touch the card itself opens the task; no second button covers its title.
    await expect(first.getByRole("button", { name: "Open task" })).toBeHidden()
    await first.getByRole("button", { name: "Card actions" }).tap()
    const sheet = page.locator("[data-card-sheet]")
    await expect(sheet.getByRole("button", { name: "Open task" })).toBeVisible()
    await expect(sheet.locator('[aria-current="true"]')).toHaveText("To do")
    const box = (await sheet.boundingBox())!
    expect(box.x).toBe(0)
    expect(box.width).toBe(390)
    await sheet.getByRole("button", { name: "Done" }).tap()
    await expect.poll(() => moves.map((m) => m.task_status)).toEqual(["done"])
    await expect(page.locator('[data-column="done"] [data-task-id="00000000-0000-4000-8000-100000000000"]')).toBeVisible()
  })

  test("on a board of people, the sheet's rows wear each column's own mark, not a status's", async ({ page }, testInfo) => {
    test.setTimeout(120_000)
    await openBoard(page, testInfo)
    await page.getByRole("button", { name: "Display" }).tap()
    await page.getByRole("menuitemcheckbox", { name: "Assignee" }).first().tap()
    await expect(page.locator('[data-board] [data-column="none"]')).toBeVisible()
    await page.locator("[data-board] [data-task-id]").first().getByRole("button", { name: "Card actions" }).tap()
    const sheet = page.locator("[data-card-sheet]")
    // "No assignee" has the dashed ring its column's header has (a to-do ring said a status).
    await expect(sheet.getByRole("button", { name: "No assignee" }).locator('[data-column-mark="none"]')).toHaveCount(1)
  })

  test("a tap outside the card's sheet closes it and opens nothing", async ({ page }, testInfo) => {
    test.setTimeout(120_000)
    await openBoard(page, testInfo)
    const opened: string[] = []
    page.on("request", (r) => {
      if (r.url().includes("/app/task/")) opened.push(r.url())
    })
    await page.locator('[data-column="todo"] [data-task-id]').first().getByRole("button", { name: "Card actions" }).tap()
    const sheet = page.locator("[data-card-sheet]")
    await expect(sheet).toBeVisible()
    await page.waitForTimeout(500)
    // The scrim, above the sheet.
    await page.touchscreen.tap(195, 120)
    await expect(sheet).toBeHidden()
    await page.waitForTimeout(1000)
    expect(opened).toEqual([])
    expect(new URL(page.url()).pathname).toBe(`/app/project/${P}`)
  })

  test("one column per screen with the next peeking in, each on the 16px margin, the last too", async ({ page }, testInfo) => {
    test.setTimeout(120_000)
    await openBoard(page, testInfo)
    const [todo, next] = await columnLefts(page)
    expect(todo).toBe(16)
    expect(390 - next).toBeGreaterThanOrEqual(24)
    await page.locator("[data-board]").evaluate((b) => (b.scrollLeft = b.scrollWidth))
    await expect.poll(async () => (await columnLefts(page)).at(-1)).toBe(16)
  })

  test("a quick swipe turns the board one column, never two", async ({ page }, testInfo) => {
    test.setTimeout(120_000)
    await openBoard(page, testInfo)
    // Each column stops a swipe (scroll-snap-stop), however quick.
    expect(await page.locator('[data-board] [data-column="todo"]').evaluate((c) => getComputedStyle(c).scrollSnapStop)).toBe("always")
    const f = await finger(page)
    const box = (await page.locator('[data-column="todo"] [data-task-id]').nth(1).boundingBox())!
    const y = box.y + box.height / 2
    await f.down(330, y)
    for (let i = 1; i <= 8; i++) {
      await f.move(330 - i * 30, y)
      await page.waitForTimeout(16)
    }
    await f.up()
    await expect.poll(async () => (await columnLefts(page))[1]).toBe(16)
  })

  test("back from a task, and a return to the Board tab, keep the column and how far down it was", async ({ page }, testInfo) => {
    test.setTimeout(150_000)
    await openBoard(page, testInfo)
    await page.locator("[data-board]").evaluate((b) => {
      const c = b.querySelector<HTMLElement>('[data-column="inProgress"]')!
      b.scrollLeft += c.getBoundingClientRect().left - b.getBoundingClientRect().left - 16
    })
    await page.locator('[data-board] [data-column="inProgress"] [data-board-scroll]').evaluate((e) => (e.scrollTop = 120))
    await expect.poll(() => place(page)).toEqual({ column: "inProgress", top: 120 })
    await page.locator('[data-column="inProgress"] [data-task-id]').nth(3).tap()
    await page.waitForURL(/\/app\/task\//, { timeout: 30_000 })
    await page.goBack()
    await expect(page.locator("[data-board] [data-task-id]").first()).toBeVisible({ timeout: 60_000 })
    await expect.poll(() => place(page)).toEqual({ column: "inProgress", top: 120 })
    await page.getByRole("tab", { name: "Tasks" }).tap()
    await expect(page.locator("[data-board]")).toHaveCount(0)
    await page.getByRole("tab", { name: "Board" }).tap()
    await expect(page.locator("[data-board] [data-task-id]").first()).toBeVisible({ timeout: 60_000 })
    await expect.poll(() => place(page)).toEqual({ column: "inProgress", top: 120 })
  })

  test("a card held at the edge turns the board one column, and lands there", async ({ page }, testInfo) => {
    test.setTimeout(120_000)
    // The turn is then a jump, so the board is still while the finger waits.
    await page.emulateMedia({ reducedMotion: "reduce" })
    const moves = await openBoard(page, testInfo)
    const f = await finger(page)
    const box = (await page.locator('[data-column="todo"] [data-task-id]').nth(1).boundingBox())!
    const x0 = box.x + 60
    const y0 = box.y + box.height / 2
    await f.down(x0, y0)
    await page.waitForTimeout(300)
    for (let i = 1; i <= 12; i++) {
      await f.move(x0 + ((384 - x0) * i) / 12, y0)
      await page.waitForTimeout(16)
    }
    // Held at the edge: one turn after 350ms; the finger leaves before the next, 750ms on.
    await expect.poll(async () => (await columnLefts(page))[1], { intervals: [40] }).toBe(16)
    for (let i = 1; i <= 8; i++) {
      await f.move(384 - (189 * i) / 8, y0)
      await page.waitForTimeout(16)
    }
    expect((await columnLefts(page))[1]).toBe(16)
    // The lifted card keeps the card's width (318px), not 280px.
    const lifted = await page.locator(".work-drag-overlay [data-cypress]").evaluate((e) => e.getBoundingClientRect().width)
    expect(lifted).toBeGreaterThanOrEqual(Math.floor(box.width))
    await f.up()
    await expect.poll(() => moves.map((m) => m.task_status)).toEqual(["inProgress"])
  })

  test("the card's menu and the column's new task take a touch past their 24px", async ({ page }, testInfo) => {
    test.setTimeout(120_000)
    await openBoard(page, testInfo)
    const taken = await page.evaluate(() => {
      // A touch 6px below the button lands on it.
      const below = (el: Element | null) => {
        if (!el) return false
        const b = el.getBoundingClientRect()
        const at = document.elementFromPoint(b.left + b.width / 2, b.bottom + 6)
        return at === el || el.contains(at)
      }
      return {
        menu: below(document.querySelector('[data-board] [data-column="todo"] [data-task-id] [aria-label="Card actions"]')),
        add: below(document.querySelector('[data-board] [aria-label="New task in To do"]')),
      }
    })
    expect(taken).toEqual({ menu: true, add: true })
  })
})

test.describe("on a short phone", () => {
  test.use({ viewport: { width: 360, height: 640 }, isMobile: true, hasTouch: true })

  test("the Display menu stays on the screen and every row can be reached", async ({ page }, testInfo) => {
    test.setTimeout(120_000)
    await openBoard(page, testInfo)
    await page.getByRole("button", { name: "Display" }).tap()
    const menu = page.getByRole("menu")
    await expect(menu).toBeVisible()
    const box = (await menu.boundingBox())!
    expect(box.y + box.height).toBeLessThanOrEqual(640)
    const last = page.getByRole("menuitemcheckbox", { name: "Cancelled" })
    await last.scrollIntoViewIfNeeded()
    const row = (await last.boundingBox())!
    expect(row.y + row.height).toBeLessThanOrEqual(640)
  })
})
