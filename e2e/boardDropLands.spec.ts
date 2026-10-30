import { expect, test, type Page, type Request, type TestInfo } from "@playwright/test"

import { contrastRatio, rgbToHex } from "../lib/color/oklch"
import { inkAndGround } from "./contrast"
import { finger } from "./finger"
import { SAM, reviewShot, stubBackend } from "./stubbedApp"

// A card dropped on the board flies to where it lands (owner, 26 Oct). The
// board has one shared drag source, bound to the pressed card's element; a
// card dropped into another column (or lane) is a new element there and the
// pressed one is gone, so the drop measured a detached element (all zeros)
// and flew the copy to the screen's top-left corner. The lifted copy is
// sampled every frame of the 200 ms drop: it never heads for the corner, and
// ends on the card's new slot. A drop within its own column is the control.
// With SHOTS_DIR set, the landed card is saved.
//
// One place to land, drawn once (owner, 27 Oct): a column's only card, lifted,
// drew two lines 5px apart (its own empty slot matched the line below the last
// card, beside the line an empty stack draws), and an empty column drew a line
// 16px above its "Drop tasks here" box. A held card shows one line, or over an
// empty column the box lit and no line.

const P = "9e0a0000-0000-4000-8000-0000000000d7"
const NONE = "0001-01-01T00:00:00Z"
const ADMIN = { role: "admin", view: true, comment: true, create_tasks: true, edit_tasks: "all", delete_tasks: "all", log_time: true, post_updates: true, add_files: true, manage: true, manage_people: true, archive: true }

const TASKS = [
  ["Write the launch announcement", "inProgress", "high"],
  ["Review the pricing page copy", "todo", "medium"],
  ["Record the product walkthrough", "todo", "medium"],
  ["Set up SSO for the pilot customer", "inProgress", "medium"],
  ["Plan the webinar", "todo", "medium"],
  ["Fix the signup confirmation email", "done", "medium"],
].map(([name, status, priority], i) => ({
  task_uuid: `7a5c00d7-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
  task_name: name,
  task_status: status,
  task_priority: priority,
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
}))
const column = (status: string) => TASKS.filter((t) => t.task_status === status)
// Done's one card.
const ONLY = "Fix the signup confirmation email"

function cors(request: Request) {
  return {
    "access-control-allow-origin": request.headers()["origin"] || "*",
    "access-control-allow-credentials": "true",
    "access-control-allow-headers": request.headers()["access-control-request-headers"] || "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
  }
}

async function openBoard(page: Page, testInfo: TestInfo, opts: { lanes?: "priority"; theme?: string; show?: string[] } = {}) {
  const project = { project_uuid: P, project_name: "Q4 launch", project_is_admin: 1, project_is_member: 1, project_members: [SAM], project_access: ADMIN }
  await stubBackend(page, testInfo, {
    [`/project/taskListForKanban/${P}`]: {
      msg: "ok",
      data: {
        ...project,
        project_tasks_backlog: [],
        project_tasks_todo: column("todo"),
        project_tasks_in_progress: column("inProgress"),
        project_tasks_in_review: [],
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
    [`/project/${P}/statuses`]: { msg: "ok", data: { built_in: [], custom: [], colors: [], max: 20 } },
    [`/project/${P}/fields`]: { msg: "ok", data: { fields: [], can_edit: true } },
    [`/project/${P}/tags`]: { msg: "ok", data: [] },
    [`/project/${P}/types`]: { msg: "ok", data: [], icons: [] },
    "/task/views": { msg: "ok", data: [] },
    "/user/dm-ai-targets": { msg: "ok", data: [] },
    "/notices": { msg: "ok", data: [] },
    "/task/info/": (url: URL) => {
      const t = TASKS.find((x) => url.pathname.endsWith(x.task_uuid)) ?? TASKS[0]
      return { msg: "ok", data: { ...t, task_description: "", task_sub_tasks: [], task_comments: [], task_activities: [], task_attachments: [], task_collaborators: [], task_blocked_by: [], task_blocks: [] } }
    },
    "/entities": { msg: "ok", data: [{ kind: "project", id: P, access: "view", data: { project_name: "Q4 launch" }, topic: `project/${P}` }] },
  })
  await page.route(/\/task\/(moveTask|updateTaskPriority|updateTaskStatus)$/, async (route) => {
    const request = route.request()
    const headers = cors(request)
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers })
    return route.fulfill({ status: 200, headers, json: { msg: "ok", data: {} } })
  })
  await page.addInitScript(
    ({ lanes, key, theme, show }) => {
      localStorage.setItem("oc_keys_tip_seen", "1")
      if (theme) localStorage.setItem("ui-theme", theme)
      if (lanes) localStorage.setItem(key, JSON.stringify(lanes))
      // Columns the board hides at first, shown as its Show does (hooks/useBoardColumns: a cookie).
      if (show.length) document.cookie = `onecamp-sidebar-sections=${encodeURIComponent(JSON.stringify(Object.fromEntries(show.map((s) => [`board-column:${s}`, true]))))}; path=/`
    },
    { lanes: opts.lanes, key: `oc_board_lanes:${P}`, theme: opts.theme, show: opts.show ?? [] },
  )
  await page.goto(`/app/project/${P}?tab=kanban`, { waitUntil: "domcontentloaded", timeout: 120_000 })
  await expect(page.locator('[data-task-sequence] [data-column$="todo"] [data-task-id]').first()).toBeVisible({ timeout: 60_000 })
}

/** Records the lifted copy's place on every frame until it is gone. */
async function recordDrop(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __drop: [number, number][]; __dropDone: boolean }
    w.__drop = []
    w.__dropDone = false
    const tick = () => {
      const o = document.querySelector(".work-drag-overlay")
      if (!o) {
        w.__dropDone = true
        return
      }
      const r = o.getBoundingClientRect()
      w.__drop.push([r.left, r.top])
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
}

/** The copy's path during the drop, and where the card is once it has landed. */
async function dropPath(page: Page, name: string) {
  await expect.poll(() => page.evaluate(() => (window as unknown as { __dropDone: boolean }).__dropDone), { timeout: 5_000 }).toBe(true)
  const path = await page.evaluate(() => (window as unknown as { __drop: [number, number][] }).__drop)
  const card = page.locator("[data-task-sequence] [data-task-id]").filter({ hasText: name })
  const landed = await card.evaluate((e) => {
    const r = e.getBoundingClientRect()
    return [r.left, r.top] as [number, number]
  })
  return { path, landed }
}

function expectLanded({ path, landed }: { path: [number, number][]; landed: [number, number] }) {
  expect(path.length, "the drop was sampled").toBeGreaterThan(0)
  const corner = path.filter(([x, y]) => Math.hypot(x, y) < 60)
  expect(corner, `the copy headed for the top-left corner: ${JSON.stringify(path)}`).toEqual([])
  const [x, y] = path[path.length - 1]
  expect(Math.abs(x - landed[0]), `ended at ${x},${y}; the card is at ${landed}`).toBeLessThanOrEqual(2.5)
  expect(Math.abs(y - landed[1]), `ended at ${x},${y}; the card is at ${landed}`).toBeLessThanOrEqual(2.5)
}

/** Saved for review when SHOTS_DIR is set, once nothing moves (reviewShot): name-<width>-<theme>.png. */
const shot = reviewShot

const columnOf = (page: Page, status: string) => page.locator(`[data-task-sequence] [data-column="${status}"]`)

/** The drop lines on the board, or in one column. */
const lines = (page: Page, status?: string) => (status ? columnOf(page, status) : page.locator("[data-task-sequence]")).locator("[data-drop-line]")

/** The mouse lifts the card and holds it over a point. */
async function mouseHold(page: Page, name: string, to: { x: number; y: number }) {
  const from = (await page.locator("[data-task-sequence] [data-task-id]").filter({ hasText: name }).boundingBox())!
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
  await page.mouse.down()
  await page.mouse.move(from.x + from.width / 2 + 12, from.y + from.height / 2 + 4, { steps: 3 })
  await page.mouse.move(to.x, to.y, { steps: 16 })
  await expect(page.locator(".work-drag-overlay")).toBeVisible()
}

/** Lets the held card go; the drop is recorded. */
async function mouseRelease(page: Page) {
  await recordDrop(page)
  await page.mouse.up()
}

/** A mouse drag from the card to a point; the drop is recorded. */
async function mouseDrag(page: Page, name: string, to: { x: number; y: number }) {
  await mouseHold(page, name, to)
  await mouseRelease(page)
}

/** An empty column under the held card: its box lit where the card will land, level with another column's first card, and no line anywhere. */
async function expectBoxLit(page: Page, status: string, beside: string) {
  const box = columnOf(page, status).locator("[data-drop-slot]")
  await expect(box).toHaveAttribute("data-drop", "valid")
  await expect(lines(page)).toHaveCount(0)
  const at = (await box.boundingBox())!
  const first = (await columnOf(page, beside).locator("[data-task-id]").first().boundingBox())!
  expect(Math.abs(at.y - first.y), `the box is at y ${at.y}; ${beside}'s first card is at ${first.y}`).toBeLessThanOrEqual(2.5)
  // Its words read at AA on the ground drawn under them: the column's hue, lit by the drop twice.
  const { ink, ground } = await inkAndGround(page, box)
  expect(contrastRatio(ink, ground), `"Drop tasks here" ${rgbToHex(ink)} on ${rgbToHex(ground)}`).toBeGreaterThanOrEqual(4.5)
}

/** The card landed at the top of its column, level with the first card of another (not lower). */
async function expectAtTop(page: Page, landed: [number, number], beside: string) {
  const first = (await columnOf(page, beside).locator("[data-task-id]").first().boundingBox())!
  expect(Math.abs(landed[1] - first.y), `landed at y ${landed[1]}; ${beside}'s first card is at ${first.y}`).toBeLessThanOrEqual(2.5)
}

const THEMES = process.env.SHOTS_DIR ? (["light", "dark"] as const) : (["light"] as const)

for (const theme of THEMES) {
  test.describe(`at 1280 with the mouse, ${theme}`, () => {
    test.use({ viewport: { width: 1280, height: 860 }, colorScheme: theme })

    test("a card dropped into another column flies to its new slot, never the corner", async ({ page }, testInfo) => {
      test.setTimeout(180_000)
      await openBoard(page, testInfo, { theme })
      const to = (await page.locator('[data-task-sequence] [data-column="inProgress"]').boundingBox())!
      await mouseHold(page, "Review the pricing page copy", { x: to.x + to.width / 2, y: to.y + 120 })
      // Control for the line's count: over a column of cards, one line, in that column.
      await expect(lines(page)).toHaveCount(1)
      await expect(lines(page, "inProgress")).toHaveCount(1)
      await mouseRelease(page)
      await expect(page.locator('[data-task-sequence] [data-column="inProgress"] [data-task-id]').filter({ hasText: "Review the pricing page copy" })).toBeVisible()
      expectLanded(await dropPath(page, "Review the pricing page copy"))
      await shot(page, "drop-landed", theme)
    })

    test("control: a card dropped lower in its own column lands too", async ({ page }, testInfo) => {
      test.setTimeout(180_000)
      await openBoard(page, testInfo, { theme })
      const last = (await page.locator('[data-task-sequence] [data-column="todo"] [data-task-id]').last().boundingBox())!
      await mouseDrag(page, "Review the pricing page copy", { x: last.x + last.width / 2, y: last.y + last.height - 4 })
      expectLanded(await dropPath(page, "Review the pricing page copy"))
    })

    test("with lanes: a card dropped into another column of its lane, and into another lane, lands", async ({ page }, testInfo) => {
      test.setTimeout(180_000)
      // Every lane clear of the board's auto-scroll edges (AUTO_SCROLL, 10% of its height): at 860 the Medium
      // lane's cells reached into the bottom edge, so a busy run scrolled Low under the held card and it landed there.
      await page.setViewportSize({ width: 1280, height: 1200 })
      await openBoard(page, testInfo, { lanes: "priority", theme })
      const cell = (lane: string, col: string) => page.locator(`[data-task-sequence] [data-column="${lane}␟${col}"]`)
      await expect(cell("medium", "todo")).toBeVisible()
      // Same lane, another column.
      let to = (await cell("medium", "inProgress").boundingBox())!
      await mouseDrag(page, "Review the pricing page copy", { x: to.x + to.width / 2, y: to.y + to.height / 2 })
      await expect(cell("medium", "inProgress").locator("[data-task-id]").filter({ hasText: "Review the pricing page copy" })).toBeVisible()
      expectLanded(await dropPath(page, "Review the pricing page copy"))
      // Another lane.
      to = (await cell("high", "inProgress").boundingBox())!
      await mouseDrag(page, "Plan the webinar", { x: to.x + to.width / 2, y: to.y + to.height / 2 })
      await expect(cell("high", "inProgress").locator("[data-task-id]").filter({ hasText: "Plan the webinar" })).toBeVisible()
      expectLanded(await dropPath(page, "Plan the webinar"))
      await shot(page, "drop-landed-lanes", theme)
    })

    test("a column's only card, lifted, draws one line, in its column, and lands back", async ({ page }, testInfo) => {
      test.setTimeout(180_000)
      await openBoard(page, testInfo, { theme })
      const only = (await columnOf(page, "done").locator("[data-task-id]").boundingBox())!
      // Held well below its slot, so the lifted copy leaves the line in sight.
      await mouseHold(page, ONLY, { x: only.x + only.width / 2, y: only.y + only.height + 90 })
      await expect(lines(page, "done")).toHaveCount(1)
      await expect(lines(page)).toHaveCount(1)
      await shot(page, "drop-line-only-card", theme)
      await mouseRelease(page)
      expectLanded(await dropPath(page, ONLY))
    })

    test("an empty column under the card is lit whole, draws no line, and the card lands at its top", async ({ page }, testInfo) => {
      test.setTimeout(180_000)
      await openBoard(page, testInfo, { theme, show: ["inReview"] })
      const to = (await columnOf(page, "inReview").boundingBox())!
      // Held low in the column, so the lifted copy leaves the box at its top in sight.
      await mouseHold(page, "Review the pricing page copy", { x: to.x + to.width / 2, y: to.y + 300 })
      await expectBoxLit(page, "inReview", "inProgress")
      await shot(page, "drop-empty-column", theme)
      await mouseRelease(page)
      await expect(columnOf(page, "inReview").locator("[data-task-id]").filter({ hasText: "Review the pricing page copy" })).toBeVisible()
      const drop = await dropPath(page, "Review the pricing page copy")
      expectLanded(drop)
      await expectAtTop(page, drop.landed, "inProgress")
    })
  })
}

for (const theme of THEMES) {
  test.describe(`at 390 by touch, ${theme}`, () => {
    test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: theme })

    test("a card held to the edge, turned into the next column and dropped, flies to its new slot", async ({ page }, testInfo) => {
      test.setTimeout(180_000)
      // The board's turn is then a jump, so it is still while the finger waits.
      await page.emulateMedia({ reducedMotion: "reduce" })
      await openBoard(page, testInfo, { theme })
      const f = await finger(page)
      const box = (await page.locator('[data-column="todo"] [data-task-id]').filter({ hasText: "Review the pricing page copy" }).boundingBox())!
      const x0 = box.x + 60
      const y0 = box.y + box.height / 2
      await f.down(x0, y0)
      await page.waitForTimeout(300)
      for (let i = 1; i <= 12; i++) {
        await f.move(x0 + ((384 - x0) * i) / 12, y0)
        await page.waitForTimeout(16)
      }
      await expect.poll(async () => page.locator('[data-task-sequence] [data-column="inProgress"]').evaluate((e) => Math.round(e.getBoundingClientRect().left)), { intervals: [40] }).toBe(16)
      for (let i = 1; i <= 8; i++) {
        await f.move(384 - (189 * i) / 8, y0)
        await page.waitForTimeout(16)
      }
      await expect(page.locator(".work-drag-overlay")).toBeVisible()
      await recordDrop(page)
      await f.up()
      await expect(page.locator('[data-task-sequence] [data-column="inProgress"] [data-task-id]').filter({ hasText: "Review the pricing page copy" })).toBeVisible()
      expectLanded(await dropPath(page, "Review the pricing page copy"))
      await shot(page, "drop-landed-phone", theme)
    })

    test("a column's only card, held, draws one line; turned into an empty column, its box is lit with no line, and it lands at the top", async ({ page }, testInfo) => {
      test.setTimeout(180_000)
      await page.emulateMedia({ reducedMotion: "reduce" })
      await openBoard(page, testInfo, { theme, show: ["inReview"] })
      // Done, the last column, holds the one card.
      await columnOf(page, "done").evaluate((e) => e.scrollIntoView({ inline: "start", block: "nearest" }))
      await expect.poll(async () => columnOf(page, "done").evaluate((e) => Math.round(e.getBoundingClientRect().left)), { intervals: [40] }).toBe(16)
      const f = await finger(page)
      const box = (await columnOf(page, "done").locator("[data-task-id]").boundingBox())!
      const x0 = box.x + 60
      const y0 = box.y + box.height / 2
      await f.down(x0, y0)
      await page.waitForTimeout(300)
      // Held well below its slot, so the lifted copy leaves the line, and then the box, in sight.
      for (let i = 1; i <= 4; i++) {
        await f.move(x0 + 4 * i, y0 + 40 * i)
        await page.waitForTimeout(16)
      }
      await expect(page.locator(".work-drag-overlay")).toBeVisible()
      await expect(lines(page, "done")).toHaveCount(1)
      await expect(lines(page)).toHaveCount(1)
      await shot(page, "drop-line-only-card-phone", theme)
      // Held at the left edge, the board turns back one column, to In review, which is empty.
      for (let i = 1; i <= 12; i++) {
        await f.move(x0 + 16 - ((x0 + 10) * i) / 12, y0 + 160)
        await page.waitForTimeout(16)
      }
      await expect.poll(async () => columnOf(page, "inReview").evaluate((e) => Math.round(e.getBoundingClientRect().left)), { intervals: [40] }).toBe(16)
      for (let i = 1; i <= 8; i++) {
        await f.move(6 + (189 * i) / 8, y0 + 160)
        await page.waitForTimeout(16)
      }
      await expectBoxLit(page, "inReview", "todo")
      await shot(page, "drop-empty-column-phone", theme)
      await recordDrop(page)
      await f.up()
      await expect(columnOf(page, "inReview").locator("[data-task-id]").filter({ hasText: ONLY })).toBeVisible()
      const drop = await dropPath(page, ONLY)
      expectLanded(drop)
      await expectAtTop(page, drop.landed, "todo")
    })
  })
}
