import { expect, test, type Page, type Request, type TestInfo } from "@playwright/test"

import { SAM, stubBackend } from "./stubbedApp"

// L-1, the owner: "why users can't rearrange tasks by dragging and dropping
// in list ... Asana gives those options". A project's list is in the
// project's one manual order (task_rank, the board's order too) unless
// another sort is picked; a row dragged by its grip lands between two
// others, and is saved as POST /task/moveTask with the tasks above and
// below it and no status (the Task Writer's rank op).

const P = "9e0a0000-0000-4000-8000-0000000000d1"
const NONE = "0001-01-01T00:00:00Z"
const ADMIN = { role: "admin", view: true, comment: true, create_tasks: true, edit_tasks: "all", delete_tasks: "all", log_time: true, post_updates: true, add_files: true, manage: true, manage_people: true, archive: true }
const MEMBER = { ...ADMIN, role: "member", edit_tasks: "none", delete_tasks: "none", create_tasks: false, manage: false, manage_people: false, archive: false }

const TASKS = ["Write the launch announcement", "Review the pricing page copy", "Record the product walkthrough", "Plan the webinar"].map((name, i) => ({
  task_uuid: `7a5c00d1-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
  task_name: name,
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
}))

type Server = { moves: Record<string, unknown>[]; sorts: (string | null)[]; refuse: boolean }

function cors(request: Request) {
  return {
    "access-control-allow-origin": request.headers()["origin"] || "*",
    "access-control-allow-credentials": "true",
    "access-control-allow-headers": request.headers()["access-control-request-headers"] || "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
  }
}

async function openList(page: Page, testInfo: TestInfo, access: typeof ADMIN, server: Server, tasks = TASKS, shown = "[data-grouped-list] [data-task-id]") {
  const project = { project_uuid: P, project_name: "Q4 launch", project_is_admin: access.manage ? 1 : 0, project_is_member: 1, project_members: [SAM], project_access: access }
  const edit = access.edit_tasks === "all"
  await stubBackend(page, testInfo, {
    [`/project/taskList/${P}`]: (url: URL) => {
      server.sorts.push(url.searchParams.get("sorting"))
      return { msg: "ok", data: { ...project, project_task_count: tasks.length, project_tasks: tasks.map((t) => ({ ...t, task_access: { edit, delete: edit, comment: true, log_time: true } })) }, pageCount: 1 }
    },
    [`/project/info/${P}`]: { msg: "ok", data: project },
    [`/project/membersInfo/${P}`]: { msg: "ok", data: project },
    [`/project/${P}/statuses`]: { msg: "ok", data: null },
    [`/project/${P}/fields`]: { msg: "ok", data: { fields: [], can_edit: true } },
    [`/project/${P}/cycles`]: { msg: "ok", data: { cycles: [], can_edit: true } },
    [`/project/${P}/goals`]: { msg: "ok", data: { goals: [] } },
    [`/project/${P}/tags`]: { msg: "ok", data: [] },
    [`/project/${P}/types`]: { msg: "ok", data: [], icons: [] },
    [`/project/${P}/updates`]: { msg: "ok", data: { updates: [], can_post: true } },
    // The task a pointer rests on is read ahead (KeyboardList's prefetch).
    "/task/info/": (url: URL) => {
      const t = tasks.find((x) => url.pathname.endsWith(x.task_uuid)) ?? tasks[0]
      return { msg: "ok", data: { ...t, task_description: "", task_sub_tasks: [], task_comments: [], task_activities: [], task_attachments: [], task_collaborators: [], task_blocked_by: [], task_blocks: [] } }
    },
    "/task/views": { msg: "ok", data: [] },
    "/user/dm-ai-targets": { msg: "ok", data: [] },
    "/notices": { msg: "ok", data: [] },
    "/entities": { msg: "ok", data: [{ kind: "project", id: P, access: "view", data: { project_name: "Q4 launch" }, topic: `project/${P}` }] },
  })
  await page.route(/\/task\/moveTask$/, async (route) => {
    const request = route.request()
    const headers = cors(request)
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers })
    server.moves.push(request.postDataJSON() as Record<string, unknown>)
    if (server.refuse) return route.fulfill({ status: 403, headers, json: { msg: "Only the project's admins can move its tasks." } })
    return route.fulfill({ status: 200, headers, json: { msg: "Moved task" } })
  })
  await page.addInitScript(() => localStorage.setItem("oc_keys_tip_seen", "1"))
  await page.goto(`/app/project/${P}?tab=list`, { waitUntil: "domcontentloaded", timeout: 120_000 })
  await expect(page.locator(shown).first()).toBeVisible({ timeout: 60_000 })
}

const order = (page: Page) => page.locator("[data-grouped-list] [data-task-id]").evaluateAll((els) => els.map((el) => el.getAttribute("data-task-id")))
const rowOf = (page: Page, i: number) => page.locator(`[data-grouped-list] [data-task-id="${TASKS[i].task_uuid}"]`)

/**
 * Picks a row up by its grip and carries it onto row `onto`, its middle over
 * that row's: the row there and the ones past it make room under the lifted
 * copy (it will land before `onto`), and the line marks the slot. Lets go.
 */
async function dragRow(page: Page, from: number, onto: number) {
  await rowOf(page, from).hover()
  const grip = page.getByRole("button", { name: `Move ${TASKS[from].task_name}` })
  await expect(grip).toBeVisible({ timeout: 15_000 })
  const g = (await grip.boundingBox())!
  const target = (await rowOf(page, onto).boundingBox())!
  const start = { x: g.x + g.width / 2, y: g.y + g.height / 2 }
  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.mouse.move(start.x + 4, start.y + 8, { steps: 3 })
  await page.mouse.move(start.x + 20, target.y + target.height / 2, { steps: 16 })
  await expect(page.locator("[data-drop-line]")).toBeVisible()
  await expect(page.locator("[data-reorder-lift]")).toBeVisible()
  await expect(rowOf(page, onto)).toHaveAttribute("data-room-shift", "")
  await page.mouse.up()
}

test.describe("the list's drag to reorder (L-1)", () => {
  test("is in manual order by default, and a dragged row saves its new neighbours", async ({ page }, testInfo) => {
    const server: Server = { moves: [], sorts: [], refuse: false }
    await openList(page, testInfo, ADMIN, server)
    expect(server.sorts[0]).toBe(JSON.stringify([{ id: "task_rank", desc: false }]))
    await dragRow(page, 0, 3)
    await expect.poll(() => server.moves.length).toBe(1)
    expect(server.moves[0]).toEqual({ task_uuid: TASKS[0].task_uuid, before_task_uuid: TASKS[2].task_uuid, after_task_uuid: TASKS[3].task_uuid })
    await expect.poll(() => order(page)).toEqual([TASKS[1], TASKS[2], TASKS[0], TASKS[3]].map((t) => t.task_uuid))
    // The room closes, and a mouse's drag leaves no keyboard ring on any row.
    await expect(page.locator("[data-room-shift]")).toHaveCount(0)
    await expect(page.locator("[data-grouped-list] [data-kbd-cursor]:visible")).toHaveCount(0)
    // Undo puts it back between its old neighbours.
    await page.getByRole("button", { name: "Undo" }).click()
    await expect.poll(() => server.moves.length).toBe(2)
    expect(server.moves[1]).toEqual({ task_uuid: TASKS[0].task_uuid, before_task_uuid: "", after_task_uuid: TASKS[1].task_uuid })
  })

  test("Alt+↓ moves the highlighted row one place", async ({ page }, testInfo) => {
    const server: Server = { moves: [], sorts: [], refuse: false }
    await openList(page, testInfo, ADMIN, server)
    await expect(page.locator("[data-reorder-grip]").first()).toBeAttached({ timeout: 15_000 })
    await rowOf(page, 1).focus()
    await page.keyboard.press("Alt+ArrowDown")
    await expect.poll(() => server.moves.length).toBe(1)
    expect(server.moves[0]).toEqual({ task_uuid: TASKS[1].task_uuid, before_task_uuid: TASKS[2].task_uuid, after_task_uuid: TASKS[3].task_uuid })
  })

  test("a refused move goes back and says why", async ({ page }, testInfo) => {
    const server: Server = { moves: [], sorts: [], refuse: true }
    await openList(page, testInfo, ADMIN, server)
    await dragRow(page, 3, 0)
    await expect(page.getByText("Only the project's admins can move its tasks.")).toBeVisible()
    await expect.poll(() => order(page)).toEqual(TASKS.map((t) => t.task_uuid))
  })

  test("its code comes beside the list: a row, the keys' focus and a “+” field's words stay as they were", async ({ page }, testInfo) => {
    // The page's quiet moments are the test's: what waits for one (the drag's code) comes when it says.
    await page.addInitScript(() => {
      const w = window as unknown as { __idle: IdleRequestCallback[] }
      w.__idle = []
      window.requestIdleCallback = (cb) => w.__idle.push(cb)
      window.cancelIdleCallback = () => undefined
    })
    const server: Server = { moves: [], sorts: [], refuse: false }
    await openList(page, testInfo, ADMIN, server)
    await expect(page.locator("[data-reorder-grip]")).toHaveCount(0)
    await rowOf(page, 0).evaluate((el) => ((el as HTMLElement & { kept?: boolean }).kept = true))
    await page.locator("[data-group-header]").first().hover()
    await page.getByRole("button", { name: /^New task in / }).first().click()
    const field = page.getByRole("textbox", { name: /^New task in / })
    await field.fill("Half a thought")
    await rowOf(page, 1).focus()
    await page.evaluate(() => (window as unknown as { __idle: IdleRequestCallback[] }).__idle.splice(0).forEach((cb) => cb({ didTimeout: false, timeRemaining: () => 50 })))
    await expect(page.locator("[data-reorder-grip]").first()).toBeAttached({ timeout: 15_000 })
    expect(await rowOf(page, 0).evaluate((el) => (el as HTMLElement & { kept?: boolean }).kept === true), "the same row").toBe(true)
    await expect(field).toHaveValue("Half a thought")
    await expect(rowOf(page, 1)).toBeFocused()
  })

  test("a reader who can't change tasks gets no grip", async ({ page }, testInfo) => {
    const server: Server = { moves: [], sorts: [], refuse: false }
    await openList(page, testInfo, MEMBER, server)
    await rowOf(page, 0).hover()
    await page.waitForTimeout(2000)
    await expect(page.locator("[data-reorder-grip]")).toHaveCount(0)
  })
})

// A phone's rows have no grip: a row held still for 250 ms lifts. The page
// mustn't scroll under the finger that carries it, and, with no row held, a
// swipe scrolls the list as in any other sort (nothing keeps a touchmove
// listener that isn't passive on the window: FLUID17-P2).
test.describe("the list's drag on a phone (L-1)", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })

  const LONG = Array.from({ length: 30 }, (_, i) => ({ ...TASKS[0], task_uuid: `7a5c00d1-0000-4000-8000-${String(100 + i).padStart(12, "0")}`, task_name: `Phone task ${i + 1}`, task_rank: (i + 1) * 1024 }))
  const phoneRow = (page: Page, i: number) => page.locator(`[data-phone-task-row][data-task-id="${LONG[i].task_uuid}"]`)

  /** The list's scroller, found once from a row (a windowed list drops rows that scroll away) and marked. */
  const scrollTopOf = async (page: Page) => {
    if (!(await page.locator("[data-e2e-scroller]").count()))
      await phoneRow(page, 0).evaluate((el) => {
        let s = el.parentElement
        while (s && !(s.scrollHeight > s.clientHeight + 4 && /(auto|scroll)/.test(getComputedStyle(s).overflowY))) s = s.parentElement
        s?.setAttribute("data-e2e-scroller", "")
      })
    return page.locator("[data-e2e-scroller]").evaluate((s) => s.scrollTop)
  }
  const touchAt = (x: number, y: number) => [{ x, y, id: 1, radiusX: 4, radiusY: 4, force: 1 }]

  test("a swipe scrolls the list: nothing on it holds a touch scroll back while no row is held", async ({ page }, testInfo) => {
    const server: Server = { moves: [], sorts: [], refuse: false }
    await openList(page, testInfo, ADMIN, server, LONG, "[data-phone-task-row]")
    // The drag's chunk is in (the layer listens), and the rows have no grip.
    await expect(page.locator("[data-reorder-grip]")).toHaveCount(0)
    await page.waitForTimeout(1500)
    const before = await scrollTopOf(page)
    expect(before).toBeGreaterThanOrEqual(0)
    const b = (await phoneRow(page, 3).boundingBox())!
    const cdp = await page.context().newCDPSession(page)
    // A finger's flick up from a row's title: the list moves down.
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: touchAt(b.x + b.width * 0.55, b.y + b.height / 2) })
    for (let k = 1; k <= 12; k++) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: touchAt(b.x + b.width * 0.55, b.y + b.height / 2 - k * 20) })
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
    await expect.poll(() => scrollTopOf(page), { timeout: 5000 }).toBeGreaterThan(before)
    expect(server.moves).toHaveLength(0)
  })

  test("a held row lifts and is carried without the list scrolling under it", async ({ page }, testInfo) => {
    const server: Server = { moves: [], sorts: [], refuse: false }
    await openList(page, testInfo, ADMIN, server, LONG, "[data-phone-task-row]")
    await expect(page.locator("[data-reorder-grip]")).toHaveCount(0)
    const cdp = await page.context().newCDPSession(page)
    const b = (await phoneRow(page, 1).boundingBox())!
    // On its title, clear of the check (whose own long press opens the status picker).
    const x = b.x + b.width * 0.55
    const y = b.y + b.height / 2
    const before = await scrollTopOf(page)
    expect(before).toBeGreaterThanOrEqual(0)
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: touchAt(x, y) })
    await page.waitForTimeout(450)
    await expect(page.locator("[data-reorder-lift]")).toBeVisible()
    for (let k = 1; k <= 10; k++) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: touchAt(x + 4, y + k * 15) })
    await expect(page.locator("[data-room-shift]").first()).toBeAttached()
    expect(await scrollTopOf(page)).toBe(before)
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
    await expect.poll(() => server.moves.length).toBe(1)
    expect(server.moves[0].task_uuid).toBe(LONG[1].task_uuid)
    await expect(page.locator("[data-reorder-lift]")).toHaveCount(0)
  })
})
