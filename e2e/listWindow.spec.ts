import { expect, test, type Page, type Request, type TestInfo } from "@playwright/test"

import { P as BOARD, openBoard } from "./projectBoard"
import { SAM, SHOT_THEMES, appOrigin, expectEveryCallAnswered, reviewShot, stubBackend, untilStill, withStatus } from "./stubbedApp"

// A long list draws only near the screen (components/task/listWindow, 22 Oct
// 2026). In a real browser: at 2,000 tasks the project list draws a window,
// every place a scroll reaches shows its rows, and J past the window brings its
// row into view. On a phone, a finger's scroll (CDP touch events: a synthesized
// scroll gesture moves 0 px) moves the list and leaves rows on the screen.
// What a windowed list keeps (PROJ-LEAD-212's conditions, 6 Nov): Show N more
// and the groups' headers, select-all by a Shift-click run over rows not drawn,
// a drag carried past the window's edge, and the failed and empty reads.
// With SHOTS_DIR set, the J head's look is shot for design review (DESIGN-BUILD-143, 12 Nov): the keys' highlight and
// Tab's grip and box, a row's menus on their first open, rows with marks beside rows with none, the board's faces, a phone's
// tap, picker and failed read, and the empty project; each frame comes right after the lines that check what it shows.

const P = "9e0a0000-0000-4000-8000-0000000000e2"
const NONE = "0001-01-01T00:00:00Z"
const ADMIN = { role: "admin", view: true, comment: true, create_tasks: true, edit_tasks: "all", delete_tasks: "all", log_time: true, post_updates: true, add_files: true, manage: true, manage_people: true, archive: true }
const task = (i: number, status = "todo") => ({
  task_uuid: `00000000-0000-4000-8000-2${String(i).padStart(11, "0")}`,
  task_name: `Task ${i}`,
  task_status: status,
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
  task_project: { project_uuid: P, project_name: "Big launch" },
  task_access: { edit: true, delete: true, comment: true, log_time: true },
})

/**
 * The project's read: `fail` answers 500 till it is cleared; `moves` keeps each move the list saves; `marks` adds to
 * a task (a lock, badges, a due date); `taskPage` answers a task's reads: the keys' prefetch, and the page a phone's tap opens.
 */
type Server = { fail?: boolean; moves?: Record<string, unknown>[]; marks?: (i: number) => Record<string, unknown>; taskPage?: boolean }

function cors(request: Request) {
  return {
    "access-control-allow-origin": request.headers()["origin"] || "*",
    "access-control-allow-credentials": "true",
    "access-control-allow-headers": request.headers()["access-control-request-headers"] || "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
  }
}

async function openList(page: Page, testInfo: TestInfo, count: number, server: Server = {}, status: (i: number) => string = () => "todo") {
  await page.addInitScript(() => localStorage.setItem("oc_keys_tip_seen", "1"))
  const tasks = Array.from({ length: count }, (_, i) => ({ ...task(i, status(i)), ...server.marks?.(i) }))
  const project = { project_uuid: P, project_name: "Big launch", project_is_admin: 1, project_is_member: 1, project_members: [SAM], project_access: ADMIN }
  await stubBackend(page, testInfo, {
    [`/project/taskList/${P}`]: () =>
      server.fail
        ? withStatus(500, { msg: "The server is having a moment." })
        : { msg: "ok", data: { ...project, project_task_count: tasks.length, project_tasks: tasks }, pageCount: 1 },
    [`/project/info/${P}`]: { msg: "ok", data: project },
    [`/project/membersInfo/${P}`]: { msg: "ok", data: project },
    [`/project/${P}/statuses`]: { msg: "ok", data: null },
    [`/project/${P}/fields`]: { msg: "ok", data: { fields: [], can_edit: true } },
    [`/project/${P}/cycles`]: { msg: "ok", data: { cycles: [], can_edit: true } },
    [`/project/${P}/goals`]: { msg: "ok", data: { goals: [] } },
    [`/project/${P}/tags`]: { msg: "ok", data: [] },
    [`/project/${P}/types`]: { msg: "ok", data: [], icons: [] },
    [`/project/${P}/updates`]: { msg: "ok", data: { updates: [], can_post: true } },
    [`/project/${P}/milestones`]: { msg: "ok", data: { milestones: [], can_manage: true } },
    // The phone's page reads the board's columns and the forecast too (DB-127 N2's toast; e2e/boardPhone's answers).
    [`/project/taskListForKanban/${P}`]: () => ({
      msg: "ok",
      data: { ...project, project_tasks_backlog: [], project_tasks_todo: [], project_tasks_in_progress: [], project_tasks_in_review: [], project_tasks_done: [], project_tasks_canceled: [], project_tasks_done_count: 0 },
    }),
    [`/project/${P}/forecast`]: { msg: "ok", data: null },
    "/task/views": { msg: "ok", data: [] },
    "/notices": { msg: "ok", data: [] },
    // A phone's page asks these too: unanswered, the stub's "Not in this test" toast covered the list's foot (DB-127 N2).
    "/user/dm-ai-targets": { msg: "ok", data: [] },
    "/entities": { msg: "ok", data: [{ kind: "project", id: P, access: "view", data: { project_name: "Big launch" }, topic: `project/${P}` }] },
    // The task's page a tap opens, enough of it to answer (e2e/taskFieldInput's and phoneTaskRows' reads).
    ...(server.taskPage
      ? {
          "/task/info/": (url: URL) => ({
            msg: "ok",
            data: {
              ...(tasks.find((t) => url.pathname.endsWith(t.task_uuid)) ?? tasks[0]),
              task_project: { ...project },
              task_description: "",
              task_sub_tasks: [],
              task_comments: [],
              task_activities: [],
              task_attachments: [],
              task_collaborators: [],
              task_blocked_by: [],
              task_blocks: [],
            },
          }),
          "/task/time/": { msg: "ok", data: null },
          "/task/recurrence/": { msg: "ok", data: null },
          "/task/cycle/": { msg: "ok", data: null },
          "/task/clientReview/": { msg: "ok", data: null },
          "/task/milestone/": { msg: "ok", data: null },
        }
      : {}),
  })
  const moves = server.moves
  if (moves)
    await page.route(/\/task\/moveTask$/, async (route) => {
      const request = route.request()
      const headers = cors(request)
      if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers })
      moves.push(request.postDataJSON() as Record<string, unknown>)
      return route.fulfill({ status: 200, headers, json: { msg: "Moved task" } })
    })
  await page.goto(`/app/project/${P}?tab=list`, { waitUntil: "domcontentloaded", timeout: 120_000 })
}

const drawn = (page: Page) => page.locator("[data-grouped-list] [data-task-id]").count()
const rowOf = (page: Page, i: number) => page.locator(`[data-grouped-list] [data-task-id="${task(i).task_uuid}"]`)
const phoneRowOf = (page: Page, i: number) => page.locator(`[data-phone-task-row][data-task-id="${task(i).task_uuid}"]`)
/**
 * Every other row carries marks and the rest none, so titles and right edges are seen side by side: a lock and a due
 * date; blocked, subtasks and comments; a past due date; all of them.
 */
const MARKS = (i: number): Record<string, unknown> =>
  [
    { task_restricted: true, task_due_date: "2026-12-15T09:00:00Z" },
    {},
    { task_blocked_open: 2, task_sub_task_count: 3, task_comment_count: 5 },
    {},
    { task_due_date: "2026-10-20T09:00:00Z" },
    {},
    { task_restricted: true, task_blocked_open: 1, task_sub_task_count: 1, task_comment_count: 12, task_due_date: "2026-12-15T09:00:00Z" },
    {},
  ][i % 8]
/** The page as it is for a reader whose system is set to `theme` (the app follows the system while they've picked none). */
async function inTheme(page: Page, theme: "light" | "dark") {
  await page.emulateMedia({ colorScheme: theme })
  await expect(page.locator("html"), `the page is ${theme}`).toHaveClass(new RegExp(`(^|\\s)${theme}(\\s|$)`))
}
/** The places (aria-posinset) of the rows drawn now, read in one go as the window may be moving. */
const places = (page: Page) =>
  page.locator("[data-grouped-list] [data-task-id]").evaluateAll((rows) => rows.map((r) => Number(r.getAttribute("aria-posinset"))))
/** Whether a row sits at the screen's middle, as a scroll's every stop should show one. */
const rowAtMiddle = (page: Page) => page.evaluate(() => document.elementFromPoint(640, 500)?.closest("[data-task-id]") !== null)
/**
 * The rows' grips come with the drag's layer, a chunk of its own fetched once the page is idle (components/task/
 * reorderSlot), which lends every row the reader may change its grip in one draw. On a busy machine it lands after the
 * rows (V-1101: a grip read the moment row 59 came found none), so a grip's read, or a key that goes to one, waits for it.
 */
const gripsCame = (page: Page) =>
  expect(page.locator("[data-grouped-list] [data-reorder-grip]").first(), "the drag's layer lent the rows their grips").toBeAttached({ timeout: 15_000 })
/**
 * A group's 640 rows windowed: its first sixty, then Show 580 more. The press leaves the page where it was (at the
 * button, the sixtieth row: F1), so it then scrolls back to the list's top, where Task 0 is drawn again.
 */
async function windowed(page: Page, group = "todo") {
  await page.getByRole("button", { name: "Show 580 more" }).click({ timeout: 60_000 })
  await expect(page.locator(`[data-group='${group}'] > [role=list]`)).toHaveAttribute("data-rows", "640", { timeout: 15_000 })
  await expect.poll(() => drawn(page)).toBeLessThan(90)
  await page.locator("[data-list-scroller]").first().evaluate((el) => el.scrollTo({ top: 0 }))
  await expect(rowOf(page, 0)).toBeVisible({ timeout: 15_000 })
}

test.describe("a long list on a computer", () => {
  test.use({ viewport: { width: 1280, height: 860 } })

  test("draws a window at 2,000 tasks, rows wherever the page scrolls, and J brings a row past it into view", async ({ page }, testInfo) => {
    test.setTimeout(150_000)
    await openList(page, testInfo, 2000)
    await page.getByRole("button", { name: "Show 1940 more" }).click({ timeout: 60_000 })
    const list = page.locator("[data-group='todo'] > [role=list]")
    await expect(list).toHaveAttribute("data-rows", "2000", { timeout: 15_000 })
    await expect.poll(() => drawn(page)).toBeLessThan(90)
    const perRow = await page.locator("[data-grouped-list] [data-task-id]").first().evaluate((r) => r.querySelectorAll("*").length + 1)
    console.log(`W2DIAG elements in a row: ${perRow}; rows drawn: ${await drawn(page)}; elements on the page: ${await page.evaluate(() => document.querySelectorAll("*").length)}`)

    // Halfway down and at the end: the rows at the screen's middle are drawn there.
    const scroller = page.locator("[data-list-scroller]").first()
    for (const at of [0.5, 1]) {
      await scroller.evaluate((el, f) => el.scrollTo({ top: (el.scrollHeight - el.clientHeight) * f }), at)
      await expect
        .poll(() => page.evaluate(() => document.elementFromPoint(640, 500)?.closest("[data-task-id]")?.getAttribute("data-task-id") ?? null))
        .not.toBeNull()
      expect(await drawn(page)).toBeLessThan(90)
    }

    // Back to the top, the keys on the last drawn row, then J: the next row is drawn, focused and in view.
    await scroller.evaluate((el) => el.scrollTo({ top: 0 }))
    await expect.poll(() => page.evaluate(() => document.elementFromPoint(640, 500)?.closest("[data-task-id]") !== null)).toBe(true)
    // The last row drawn, focused and read in one go: the window may still be settling after the scroll, and a
    // locator read twice can find two different last rows.
    const pos = await page.evaluate(() => {
      const rows = document.querySelectorAll<HTMLElement>("[data-grouped-list] [data-task-id]")
      const last = rows[rows.length - 1]
      last.focus()
      return Number(last.getAttribute("aria-posinset"))
    })
    for (let i = 0; i < 3; i++) await page.keyboard.press("j")
    const target = page.locator(`[data-task-id="${task(pos - 1 + 3).task_uuid}"]`)
    await expect(target).toBeFocused()
    await expect(target).toBeInViewport()
  })

  // The J key path (FLUIDITY-24): the keys' place is painted, and the window holds its rows while the screen stays inside them.
  test("20 J move the highlight with its row in view; Tab and Shift+Tab reach its box; X picks it and Enter opens it; a fling and End reach the end with rows drawn", async ({ page }, testInfo) => {
    test.setTimeout(150_000)
    await openList(page, testInfo, 2000)
    await page.getByRole("button", { name: "Show 1940 more" }).click({ timeout: 60_000 })
    await expect(page.locator("[data-group='todo'] > [role=list]")).toHaveAttribute("data-rows", "2000", { timeout: 15_000 })
    const scroller = page.locator("[data-list-scroller]").first()
    await scroller.evaluate((el) => el.scrollTo({ top: 0 }))
    await rowOf(page, 0).evaluate((r: HTMLElement) => r.focus())
    for (let i = 1; i <= 20; i++) {
      await page.keyboard.press("j")
      await page.waitForTimeout(80)
    }
    const row = rowOf(page, 20)
    await expect(row).toBeFocused()
    await expect(row).toHaveAttribute("data-highlighted", "true")
    await expect(row).toBeInViewport()
    await expect(page.locator("[data-grouped-list] [data-task-id][data-highlighted]")).toHaveCount(1)
    // The keys' marks, read from the row by its children (globals.css kbd-lit, kbd-box): the cursor and the light box
    // on the keys' row, and on no other.
    await expect(row.locator("[data-kbd-cursor]")).toBeVisible()
    await expect(row.locator("[data-row-box]")).toBeVisible()
    await expect(page.locator("[data-grouped-list] [data-kbd-cursor]:visible")).toHaveCount(1)
    await expect(rowOf(page, 19).locator("[data-row-box]")).toBeHidden()
    // Tab goes through the row's controls in order: its grip (a project's list in its manual order), then its select
    // box; Shift+Tab from the next control lands back on the box.
    await gripsCame(page)
    await page.keyboard.press("Tab")
    await expect(row.getByRole("button", { name: "Move Task 20" })).toBeFocused()
    await page.keyboard.press("Tab")
    const box = row.getByRole("checkbox", { name: "Select Task 20" })
    await expect(box).toBeFocused()
    await page.keyboard.press("Tab")
    await expect(box).not.toBeFocused()
    await page.keyboard.press("Shift+Tab")
    await expect(box).toBeFocused()
    await row.evaluate((r: HTMLElement) => r.focus())
    await page.keyboard.press("x")
    await expect(row).toHaveAttribute("data-state", "selected")
    await page.keyboard.press("Enter")
    await expect(row).toHaveAttribute("data-opened", "true")
    await page.keyboard.press("Escape")
    // A fling by the wheel, then End: every stop shows rows across the screen, never a blank one. Rows are read under
    // whatever floats over them (X's pick shows the selection's bar over the 90% point), so a point reads every layer.
    const filled = () =>
      page.evaluate(() => {
        const sc = document.querySelector<HTMLElement>("[data-list-scroller]")!.getBoundingClientRect()
        const ys = [0.3, 0.5, 0.7, 0.9].map((f) => sc.top + (sc.bottom - sc.top) * f)
        return ys.every((y) => document.elementsFromPoint(640, y).some((el) => !!el.closest("[data-task-id]")))
      })
    await page.mouse.move(640, 500)
    for (let i = 0; i < 6; i++) await page.mouse.wheel(0, 4000)
    await expect.poll(filled, { timeout: 5_000 }).toBe(true)
    expect(await drawn(page)).toBeLessThan(90)
    // The fling left row 0 far above the rows drawn (fewer than 90), so End goes from the row at the screen's middle.
    await page.evaluate(() => {
      const sc = document.querySelector<HTMLElement>("[data-list-scroller]")!.getBoundingClientRect()
      const at = document.elementsFromPoint(640, (sc.top + sc.bottom) / 2).map((el) => el.closest<HTMLElement>("[data-task-id]"))
      at.find((r) => !!r)!.focus()
    })
    await expect(page.locator("[data-grouped-list] [data-task-id]:focus")).toHaveCount(1)
    await page.keyboard.press("End")
    await expect.poll(filled, { timeout: 5_000 }).toBe(true)
    await scroller.evaluate((el) => el.scrollTo({ top: el.scrollHeight }))
    await expect.poll(filled, { timeout: 5_000 }).toBe(true)
    await expect(rowOf(page, 1999)).toBeInViewport()
    expect(await drawn(page)).toBeLessThan(90)
  })

  // Rows the page moves under a resting pointer (fluid-19, 13 Nov). The browser's hover update sends pointerover and
  // pointerenter where the pointer already was, with no pointermove. A J's scroll sends it in its own frame, before the
  // scroll event, so the scroll settle (lib/ui/scrollState) covered it only when the J before was within 150 ms: the
  // 20 J test above lit row 20 under the mouse resting where it clicked Show 1940 more (3 of 7 runs on fluid-19's
  // tip), its Checkbox in place of the keys' box. A draw that moves rows has no scroll at all. Only a move lights a row.
  test("rows the keys or a draw carry under a resting mouse stay unlit, and the mouse's move lights the row under it", async ({ page }, testInfo) => {
    test.setTimeout(150_000)
    await openList(page, testInfo, 60)
    await expect(rowOf(page, 59)).toBeAttached({ timeout: 60_000 })
    const lit = page.locator("[data-grouped-list] [data-task-id] [role=checkbox]:not([data-row-box])")
    const sc = (await page.locator("[data-list-scroller]").first().boundingBox())!
    const first = (await rowOf(page, 0).boundingBox())!
    const x = Math.round(first.x + first.width / 2)
    const y = Math.round(Math.min(sc.y + sc.height, 860) - 30)
    const under = () =>
      page.evaluate(([x, y]) => {
        const r = document.elementFromPoint(x, y)?.closest("[data-task-id]")
        return r ? { i: Number(r.getAttribute("data-task-id")!.slice(-11)), hover: r.matches(":hover") } : null
      }, [x, y])
    // The mouse comes to rest on a row near the screen's foot: its move lights that row.
    await page.mouse.move(x, y)
    const start = (await under())!
    expect(start, "a row under the mouse").not.toBeNull()
    await expect(rowOf(page, start.i).getByRole("checkbox", { name: `Select Task ${start.i}` })).toHaveCount(1)
    await expect(lit).toHaveCount(1)
    // The keys carry rows under it, a press a little slower than the scroll settle: each scroll's hover update comes
    // with no scroll in the 150 ms before it.
    await rowOf(page, 0).evaluate((r: HTMLElement) => r.focus())
    for (let i = 0; i < start.i + 4; i++) {
      await page.keyboard.press("j")
      await page.waitForTimeout(250)
    }
    const carried = (await under())!
    expect(carried.i, "the keys' scroll carried other rows under the mouse").toBeGreaterThan(start.i)
    expect(carried.hover, "the browser moved its hover to the row now under the mouse").toBe(true)
    await expect(lit, "no row lit by the keys' scroll under a resting mouse").toHaveCount(0)
    await expect(rowOf(page, carried.i).locator("[data-row-box]")).toHaveCount(1)
    // A draw moves the rows down two places under it, with no scroll (the scroller's anchoring off, so it holds still).
    await rowOf(page, 0).evaluate((r) => {
      r.closest<HTMLElement>("[data-list-scroller]")!.style.overflowAnchor = "none"
      r.closest<HTMLElement>("[data-grouped-list]")!.style.paddingTop = "80px"
    })
    await page.waitForTimeout(300)
    const drawnUnder = (await under())!
    expect(drawnUnder.i, "the draw moved other rows under the mouse").toBe(carried.i - 2)
    expect(drawnUnder.hover, "the browser moved its hover to the row now under the mouse").toBe(true)
    await expect(lit, "no row lit by a draw under a resting mouse").toHaveCount(0)
    // The mouse's own move, by a pixel, lights the row under it.
    await page.mouse.move(x, y + 1)
    await expect(rowOf(page, drawnUnder.i).getByRole("checkbox", { name: `Select Task ${drawnUnder.i}` })).toHaveCount(1)
    await expect(lit).toHaveCount(1)
  })

  test("a row the keys carry under a resting mouse shows no hover, neither its tint nor its grip; a 2 px move brings both back at once", async ({ page }, testInfo) => {
    test.setTimeout(150_000)
    await openList(page, testInfo, 60)
    await expect(rowOf(page, 59)).toBeAttached({ timeout: 60_000 })
    await gripsCame(page)
    const sc = (await page.locator("[data-list-scroller]").first().boundingBox())!
    const first = (await rowOf(page, 0).boundingBox())!
    const x = Math.round(first.x + first.width / 2)
    // The mouse rests mid-list; the keys' cursor starts on the row at the list's foot, so each J scrolls a row.
    const foot = Math.round(Math.min(sc.y + sc.height, 860) - 30)
    const y = Math.round((sc.y + Math.min(sc.y + sc.height, 860)) / 2)
    // The row at the mouse's place: which, whether hovered, its background and its grip's opacity, as the page styles them.
    const under = (dy = 0) =>
      page.evaluate(([x, y]) => {
        const r = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-task-id]")
        const grip = r?.querySelector("[data-reorder-grip]")
        return r && grip ? { i: Number(r.getAttribute("data-task-id")!.slice(-11)), hover: r.matches(":hover"), bg: getComputedStyle(r).backgroundColor, grip: getComputedStyle(grip).opacity } : null
      }, [x, y + dy])
    // At rest, before the mouse comes: the row's own colour, its grip hidden.
    const rest = (await under())!
    expect(rest, "a row with a grip at the mouse's place").not.toBeNull()
    expect(rest.grip).toBe("0")
    // A real hover tints the row and shows its grip (past their 140 ms fade).
    await page.mouse.move(x, y)
    await page.waitForTimeout(300)
    const hovered = (await under())!
    expect(hovered.hover).toBe(true)
    expect(hovered.bg, "a hovered row is tinted").not.toBe(rest.bg)
    expect(hovered.grip).toBe("1")
    // The keys' cursor on the row at the foot, then J x5: each J scrolls the list a row under the resting mouse.
    const atFoot = await page.evaluate(([x, y]) => Number(document.elementFromPoint(x, y)!.closest("[data-task-id]")!.getAttribute("data-task-id")!.slice(-11)), [x, foot])
    await rowOf(page, atFoot).evaluate((r: HTMLElement) => r.focus())
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press("j")
      await page.waitForTimeout(250)
    }
    const carried = (await under())!
    expect(carried.i, "the keys' scroll carried other rows under the mouse").toBeGreaterThan(hovered.i)
    await expect(rowOf(page, carried.i), "the row under the mouse is not the keys' cursor").not.toHaveAttribute("data-highlighted", /.*/)
    expect(carried.hover, "the browser moved its hover to the row now under the mouse").toBe(true)
    expect(carried.bg, "the row the keys carried under a resting mouse keeps its rest colour").toBe(rest.bg)
    expect(carried.grip, "and its grip stays hidden").toBe("0")
    // The mouse's own move, by 2 px, brings the row's hover back at once.
    await page.mouse.move(x, y + 2)
    await expect.poll(async () => (await under(2))!.grip, { timeout: 1_000 }).toBe("1")
    await expect.poll(async () => (await under(2))!.bg, { timeout: 1_000 }).toBe(hovered.bg)
    // J again, then a click with no move: the press lands on the row under the mouse, as a click always does.
    await page.keyboard.press("j")
    await page.waitForTimeout(250)
    const again = (await under(2))!
    expect(again.grip).toBe("0")
    await page.mouse.down()
    await page.mouse.up()
    await expect(rowOf(page, again.i)).toHaveAttribute("data-highlighted", /.*/)
    await expect(page.locator("[data-kbd-nav]")).toHaveCount(0)
  })

  test("J x3, X and J x2 paint the highlight with the picked row and its bar in view, and Tab then reaches the highlighted row's box", async ({ page }, testInfo) => {
    test.setTimeout(150_000)
    await page.emulateMedia({ colorScheme: "light" })
    await openList(page, testInfo, 2000, { taskPage: true })
    await page.getByRole("button", { name: "Show 1940 more" }).click({ timeout: 60_000 })
    await expect(page.locator("[data-group='todo'] > [role=list]")).toHaveAttribute("data-rows", "2000", { timeout: 15_000 })
    await page.locator("[data-list-scroller]").first().evaluate((el) => el.scrollTo({ top: 0 }))
    await rowOf(page, 0).evaluate((r: HTMLElement) => r.focus())
    for (const key of ["j", "j", "j", "x", "j", "j"]) {
      await page.keyboard.press(key)
      await page.waitForTimeout(80)
    }
    const row = rowOf(page, 5)
    await expect(row).toBeFocused()
    await expect(row).toHaveAttribute("data-highlighted", "true")
    await expect(page.locator("[data-grouped-list] [data-task-id][data-highlighted]")).toHaveCount(1)
    await expect(rowOf(page, 3)).toHaveAttribute("data-state", "selected")
    await expect(page.getByRole("toolbar", { name: "1 task selected" })).toBeVisible()
    await expect(row).toBeInViewport()
    await expect(rowOf(page, 3)).toBeInViewport()
    await inTheme(page, "light")
    await settledFrame(page, "jkey-highlight", "light")
    // Tab, as the J path's: the row's grip (a project's list in its manual order), then its select box.
    await inTheme(page, "dark")
    await gripsCame(page)
    await page.keyboard.press("Tab")
    await expect(row.getByRole("button", { name: "Move Task 5" })).toBeFocused()
    // The grip's own ring, with the row's cursor still drawn for the keys' focus in it (globals.css kbd-lit).
    await expect(row.locator("[data-kbd-cursor]")).toBeVisible()
    await settledFrame(page, "jkey-grip", "dark")
    await page.keyboard.press("Tab")
    await expect(row.getByRole("checkbox", { name: "Select Task 5" })).toBeFocused()
    await expect(row).toHaveAttribute("data-highlighted", "true")
    await settledFrame(page, "jkey-tab", "dark")
  })

  test("a row's priority menu opens on its first press, and A opens the row's assignee picker on its first press", async ({ page }, testInfo) => {
    test.setTimeout(150_000)
    await page.emulateMedia({ colorScheme: "light" })
    await openList(page, testInfo, 640, { taskPage: true })
    await windowed(page)
    // The priority menu joins the page on its first press (components/ui/menuOnDemand).
    await rowOf(page, 0).getByRole("button", { name: "Priority of Task 0" }).click()
    await expect(page.getByRole("menu")).toBeVisible()
    await expect(page.getByRole("menuitem", { name: /Medium/ })).toHaveAttribute("aria-current", "true")
    await inTheme(page, "light")
    await settledFrame(page, "row-menu-first", "light")
    await page.keyboard.press("Escape")
    await expect(page.getByRole("menu")).toHaveCount(0)
    // A row has no assignee button: A on the row the keys are on picks it and opens the bar's assignee picker.
    await inTheme(page, "dark")
    await rowOf(page, 0).evaluate((r: HTMLElement) => r.focus())
    await page.keyboard.press("j")
    const row = rowOf(page, 1)
    await expect(row).toHaveAttribute("data-highlighted", "true")
    await page.keyboard.press("a")
    await expect(row).toHaveAttribute("data-state", "selected")
    // The picker names a person as the app does everywhere (displayNameOf: Sam's user name).
    await expect(page.getByRole("option", { name: /\bsam$/ })).toBeVisible()
    await expect(page.getByRole("option", { name: /No one/ })).toBeVisible()
    await settledFrame(page, "row-menu-first", "dark")
    await page.keyboard.press("Escape")
  })

  test("rows with a lock, badges and a due date line up with rows that have none", async ({ page }, testInfo) => {
    await page.emulateMedia({ colorScheme: "light" })
    await openList(page, testInfo, 12, { marks: MARKS })
    const marked = rowOf(page, 0)
    await expect(marked).toBeVisible({ timeout: 60_000 })
    await expect(marked.locator("[data-restricted-mark]")).toBeVisible()
    await expect(marked.getByText("15 Dec", { exact: true })).toBeVisible()
    await expect(rowOf(page, 2).getByText("Blocked by 2 tasks")).toBeAttached()
    await expect(rowOf(page, 4).getByText("20 Oct", { exact: true })).toBeVisible()
    await expect(rowOf(page, 6).locator("[data-restricted-mark]")).toBeVisible()
    const plain = rowOf(page, 1)
    await expect(plain).toBeVisible()
    await expect(plain.locator("[data-restricted-mark]")).toHaveCount(0)
    await expect(plain.getByText(/^\d+ (Dec|Oct)$/)).toHaveCount(0)
    await inTheme(page, "light")
    await settledFrame(page, "marks-mixed", "light")
  })

  test("the board's cards show their assignees' faces, and initials for one with none", async ({ page }, testInfo) => {
    test.setTimeout(150_000)
    await page.route(/\/__faces\//, (route) => route.fulfill({ status: 200, contentType: "image/png", headers: { "cache-control": "max-age=3600" }, body: FACE }))
    const maya = { user_uuid: "6c1d2e3f-4a5b-4c6d-8e7f-0a1b2c3d4e51", user_name: "maya", user_full_name: "Maya Chen", user_email_id: "maya@example.com", user_profile_object_key: new URL("/__faces/maya.png", appOrigin(testInfo)).href }
    const jo = { user_uuid: "6c1d2e3f-4a5b-4c6d-8e7f-0a1b2c3d4e52", user_name: "jo", user_full_name: "Jo Tanaka", user_email_id: "jo@example.com" }
    const project = { project_uuid: BOARD, project_name: "Website relaunch", project_is_admin: 1, project_is_member: 1, project_members: [SAM, maya, jo] }
    const card = (i: number, name: string, status: string, who: object) => ({
      ...task(i, status),
      task_uuid: `00000000-0000-4000-8000-4${String(i).padStart(11, "0")}`,
      task_name: name,
      task_assignee: who,
      task_project: { project_uuid: BOARD, project_name: "Website relaunch", project_is_admin: true },
    })
    await openBoard(page, testInfo, "dark", {
      [`/project/taskListForKanban/${BOARD}`]: {
        msg: "ok",
        data: {
          ...project,
          project_tasks_backlog: [],
          project_tasks_todo: [card(0, "Draft launch email", "todo", maya), card(1, "Fix login redirect on Safari", "todo", jo), card(2, "Review pricing page copy", "todo", SAM)],
          project_tasks_in_progress: [card(3, "Book the launch call", "inProgress", maya)],
          project_tasks_in_review: [],
          project_tasks_done: [card(4, "Pick the launch date", "done", jo)],
          project_tasks_canceled: [],
          project_tasks_done_count: 1,
        },
      },
    })
    const cardOf = (name: string) => page.locator("[data-board] [data-task-id]").filter({ hasText: name })
    await expect(cardOf("Draft launch email").locator("[data-card-avatar] img")).toBeVisible({ timeout: 30_000 })
    const initials = cardOf("Fix login redirect on Safari").locator("[data-card-avatar]")
    await expect(initials.getByText("J", { exact: true })).toBeVisible()
    await expect(initials.locator("img")).toHaveCount(0)
    await expect(cardOf("Review pricing page copy").locator("[data-card-avatar]").getByText("S", { exact: true })).toBeVisible()
    await expect(page.locator("html")).toHaveClass(/(^|\s)dark(\s|$)/)
    await settledFrame(page, "board", "dark")
  })

  // V-1054 R1 (CR-340 #1): the board is on the keys' path too, so its card's lift and shadow (hover-lift) hold still
  // for the keys like a row's hover does, and the mouse's own move brings them back.
  test("the board: a card under a resting mouse drops its lift and shadow at J, and a 2 px move brings both back", async ({ page }, testInfo) => {
    test.setTimeout(150_000)
    const card = (i: number, name: string) => ({
      ...task(i, "todo"),
      task_uuid: `00000000-0000-4000-8000-5${String(i).padStart(11, "0")}`,
      task_name: name,
      task_assignee: SAM,
      task_project: { project_uuid: BOARD, project_name: "Website relaunch", project_is_admin: true },
    })
    await openBoard(page, testInfo, "light", {
      [`/project/taskListForKanban/${BOARD}`]: {
        msg: "ok",
        data: {
          project_uuid: BOARD, project_name: "Website relaunch", project_is_admin: 1, project_is_member: 1, project_members: [SAM],
          project_tasks_backlog: [],
          project_tasks_todo: [card(0, "Draft launch email"), card(1, "Fix login redirect on Safari"), card(2, "Review pricing page copy")],
          project_tasks_in_progress: [],
          project_tasks_in_review: [],
          project_tasks_done: [],
          project_tasks_canceled: [],
          project_tasks_done_count: 0,
        },
      },
    })
    const cardOf = (name: string) => page.locator("[data-board] [data-task-id]").filter({ hasText: name })
    await expect(cardOf("Review pricing page copy")).toBeVisible({ timeout: 30_000 })
    const box = (await cardOf("Review pricing page copy").boundingBox())!
    const x = Math.round(box.x + box.width / 2)
    const y = Math.round(box.y + box.height / 2)
    // The card at the mouse's place: its name, whether hovered, its lift and its shadow's opacity, as the page styles them.
    const under = (dy = 0) =>
      page.evaluate(([x, y]) => {
        const c = document.elementFromPoint(x, y)?.closest<HTMLElement>(".hover-lift")
        return c ? { name: c.textContent ?? "", hover: c.matches(":hover"), lift: getComputedStyle(c).translate, shadow: getComputedStyle(c, "::after").opacity } : null
      }, [x, y + dy])
    const rest = (await under())!
    expect(rest, "a lifting card at the mouse's place").not.toBeNull()
    expect([rest.lift, rest.shadow]).toEqual(["none", "0"])
    // A real hover lifts the card and shows its shadow (past their 140 ms ease).
    await page.mouse.move(x, y)
    await page.waitForTimeout(300)
    const hovered = (await under())!
    expect(hovered.hover).toBe(true)
    expect(hovered.lift, "a hovered card lifts").not.toBe("none")
    expect(hovered.shadow).toBe("1")
    // The keys' cursor on the first card, then J: the keys drive the board, and the card under the resting mouse holds still.
    await cardOf("Draft launch email").evaluate((c: HTMLElement) => ((c.matches("[tabindex]") ? c : c.querySelector<HTMLElement>("[tabindex]")) ?? c).focus())
    await page.keyboard.press("j")
    await expect(page.locator("[data-kbd-nav]"), "the keys marked the board").toHaveCount(1)
    await page.waitForTimeout(300)
    const held = (await under())!
    expect(held.name).toContain("Review pricing page copy")
    expect(held.hover, "the mouse still rests on the card").toBe(true)
    expect(held.lift, "the card under the resting mouse drops its lift").toBe("none")
    expect(held.shadow, "and its shadow").toBe("0")
    // The mouse's own move, by 2 px, brings the lift and the shadow back.
    await page.mouse.move(x, y + 2)
    await expect.poll(async () => (await under(2))!.shadow, { timeout: 1_000 }).toBe("1")
    await expect.poll(async () => (await under(2))!.lift, { timeout: 1_000 }).not.toBe("none")
    await expect(page.locator("[data-kbd-nav]")).toHaveCount(0)
  })

  test("Show N more windows a group, every group keeps its header, and a hidden group gives its room to the next", async ({ page }, testInfo) => {
    test.setTimeout(150_000)
    // Three open groups of 640: sixty shown in each (180, too few to window) till Show N more.
    const STATUSES = ["backlog", "todo", "inProgress"]
    await openList(page, testInfo, 1920, {}, (i) => STATUSES[Math.floor(i / 640)])
    await expect(page.getByRole("button", { name: "Show 580 more" })).toHaveCount(3, { timeout: 60_000 })
    expect(await drawn(page)).toBe(180)
    await page.locator("[data-group='todo']").getByRole("button", { name: "Show 580 more" }).click()
    await expect(page.locator("[data-group='todo'] > [role=list]")).toHaveAttribute("data-rows", "640", { timeout: 15_000 })
    await expect.poll(() => drawn(page)).toBeLessThan(90)
    // Headers are always drawn, wherever the window is.
    await expect(page.locator("[data-group-header]")).toHaveCount(3)
    const scroller = page.locator("[data-list-scroller]").first()
    for (const at of [0.5, 1]) {
      await scroller.evaluate((el, f) => el.scrollTo({ top: (el.scrollHeight - el.clientHeight) * f }), at)
      await expect.poll(() => rowAtMiddle(page)).toBe(true)
      await expect(page.locator("[data-group-header]")).toHaveCount(3)
    }
    // The last group's Show N more, reached by the window, windows it too.
    await page.locator("[data-group='inProgress']").getByRole("button", { name: "Show 580 more" }).click()
    await expect(page.locator("[data-group='inProgress'] > [role=list]")).toHaveAttribute("data-rows", "640", { timeout: 15_000 })
    await expect.poll(() => drawn(page)).toBeLessThan(90)
    // Hiding the windowed group: its rows go, and the page's end shows the last group's rows, drawn.
    await scroller.evaluate((el) => el.scrollTo({ top: 0 }))
    const todoHead = page.locator("[data-group='todo'] [data-group-header] button[aria-expanded]")
    await todoHead.click()
    await expect(todoHead).toHaveAttribute("aria-expanded", "false")
    await expect(page.locator("[data-group='todo'] [data-task-id]")).toHaveCount(0)
    await scroller.evaluate((el) => el.scrollTo({ top: el.scrollHeight }))
    await expect
      .poll(() => page.evaluate(() => document.elementFromPoint(640, 500)?.closest("[data-task-id]")?.closest("[data-group]")?.getAttribute("data-group") ?? null))
      .toBe("inProgress")
    await expect.poll(() => drawn(page)).toBeLessThan(90)
    await scroller.evaluate((el) => el.scrollTo({ top: 0 }))
    await todoHead.click()
    await expect(page.locator("[data-group='todo'] > [role=list]")).toHaveAttribute("data-rows", "640")
  })

  test("X and a Shift-click run select all 640 rows, the ones not drawn too, and a row drawn later shows it", async ({ page }, testInfo) => {
    test.setTimeout(150_000)
    await openList(page, testInfo, 640)
    await windowed(page)
    await rowOf(page, 0).focus()
    await page.keyboard.press("x")
    await expect(page.getByRole("toolbar", { name: "1 task selected" })).toBeVisible()
    // To the end, and a Shift-click on the last row: the run takes every row between, drawn or not.
    const scroller = page.locator("[data-list-scroller]").first()
    await scroller.evaluate((el) => el.scrollTo({ top: el.scrollHeight }))
    await expect(rowOf(page, 639)).toBeVisible({ timeout: 15_000 })
    await rowOf(page, 639).click({ modifiers: ["Shift"], position: { x: 400, y: 20 } })
    await expect(page.getByRole("toolbar", { name: "640 tasks selected" })).toBeVisible()
    // Halfway back up, the rows drawn there read as selected.
    await scroller.evaluate((el) => el.scrollTo({ top: (el.scrollHeight - el.clientHeight) / 2 }))
    await expect.poll(() => rowAtMiddle(page)).toBe(true)
    const states = await page.locator("[data-grouped-list] [data-task-id]").evaluateAll((rows) => rows.map((r) => r.getAttribute("data-state")))
    expect(states.length).toBeGreaterThan(0)
    expect(states.every((s) => s === "selected")).toBe(true)
    // Esc clears it, for the rows not drawn too.
    await page.keyboard.press("Escape")
    await expect(page.getByRole("toolbar", { name: /selected$/ })).toHaveCount(0)
    await scroller.evaluate((el) => el.scrollTo({ top: el.scrollHeight }))
    await expect(rowOf(page, 639)).not.toHaveAttribute("data-state", "selected")
  })

  test("a row dragged past the window's edge stays drawn while held, and lands among rows that weren't drawn", async ({ page }, testInfo) => {
    test.setTimeout(150_000)
    const moves: Record<string, unknown>[] = []
    await openList(page, testInfo, 640, { moves })
    await windowed(page)
    const lastAtLift = Math.max(...(await places(page)))
    await rowOf(page, 0).hover()
    const grip = page.getByRole("button", { name: "Move Task 0" })
    await expect(grip).toBeVisible({ timeout: 15_000 })
    const g = (await grip.boundingBox())!
    await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2)
    await page.mouse.down()
    await page.mouse.move(g.x + g.width / 2 + 4, g.y + g.height / 2 + 8, { steps: 3 })
    await expect(page.locator("[data-reorder-lift]")).toBeVisible()
    // The list scrolled under the held row, far past the window drawn when it was lifted.
    const scroller = page.locator("[data-list-scroller]").first()
    await scroller.evaluate((el) => el.scrollBy({ top: 120 * 40 }))
    await expect.poll(async () => Math.min(...(await places(page)).filter((n) => n > 1))).toBeGreaterThan(lastAtLift)
    // The held row is kept drawn, though its place is far above the screen.
    await expect(rowOf(page, 0)).toBeAttached()
    await page.mouse.move(g.x + g.width / 2 + 20, 480, { steps: 12 })
    await expect(page.locator("[data-drop-line]")).toBeVisible()
    await page.mouse.up()
    await expect.poll(() => moves.length).toBe(1)
    expect(moves[0].task_uuid).toBe(task(0).task_uuid)
    // Its new neighbours are rows that weren't drawn when it was lifted.
    const after = String(moves[0].after_task_uuid)
    const landed = Number(after.slice(-11))
    expect(landed).toBeGreaterThan(lastAtLift)
    // It is drawn at its new place, right before that neighbour.
    await expect
      .poll(async () => {
        const ids = await page.locator("[data-grouped-list] [data-task-id]").evaluateAll((rows) => rows.map((r) => r.getAttribute("data-task-id")))
        return ids[ids.indexOf(after) - 1] ?? null
      })
      .toBe(task(0).task_uuid)
    await expect(page.locator("[data-room-shift]")).toHaveCount(0)
  })

  test("a failed read says so, and Try again brings the long list back windowed", async ({ page }, testInfo) => {
    test.setTimeout(150_000)
    const server: Server = { fail: true }
    await openList(page, testInfo, 640, server)
    await expect(page.getByText("Couldn't load this project's tasks")).toBeVisible({ timeout: 60_000 })
    server.fail = false
    await page.getByRole("button", { name: "Try again" }).click()
    await windowed(page)
    await expect.poll(() => rowAtMiddle(page)).toBe(true)
  })

  test("an empty project says so, with no list to window", async ({ page }, testInfo) => {
    await page.emulateMedia({ colorScheme: "dark" })
    await openList(page, testInfo, 0)
    await expect(page.getByRole("heading", { name: "No tasks yet" })).toBeVisible({ timeout: 60_000 })
    await expect(page.locator("[data-grouped-list]")).toHaveCount(0)
    await inTheme(page, "dark")
    await settledFrame(page, "list-empty", "dark")
  })
})

// The reader's place across Show N more (F1, DB-127, 8 Nov): pressing it far down a group of 2,000 turns the
// window on, which hands it the page's scroller; the window scrolled that scroller to the offset it had cached
// before it had one (0), so the page jumped back to Task 0 on the press's fourth frame.

type Frame = { top: number; mid: number }

/** Saved for review when SHOTS_DIR is set: name-<width>-<theme>.png (My Tasks' stub leaves its side reads unanswered, so no toast check). */
async function frame(page: Page, name: string, theme: string) {
  const dir = process.env.SHOTS_DIR
  if (dir) await page.screenshot({ path: `${dir}/${name}-${page.viewportSize()?.width}-${theme}.png` })
}

/** A frame of what the lines before it checked: 300 ms after a menu opened or the page scrolled, still, with no stub's toast. */
async function settledFrame(page: Page, name: string, theme: "light" | "dark") {
  if (!process.env.SHOTS_DIR) return
  await page.waitForTimeout(300)
  await reviewShot(page, name, theme)
}

// A face: 1x1, a solid colour, which the avatar's box scales to fill (e2e/avatarLook's).
const FACE = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64")

/** My Tasks with `count` tasks of no date, in one open group. */
async function openMine(page: Page, testInfo: TestInfo, count: number) {
  await page.addInitScript(() => localStorage.setItem("oc_keys_tip_seen", "1"))
  const tasks = Array.from({ length: count }, (_, i) => task(i))
  await stubBackend(page, testInfo, {
    "/user/assignedTaskList": { msg: "ok", data: { user_tasks: tasks }, pageCount: 1 },
    "/task/views": { msg: "ok", data: [] },
    "/notices": { msg: "ok", data: [] },
  })
  await page.goto("/app/myTask", { waitUntil: "domcontentloaded", timeout: 120_000 })
}

/**
 * Scrolls the page till the list's "Show N more" sits at the screen's foot, then reads the list's scroller offset and
 * the task of the row at the screen's middle on every frame for a second from the press (by the mouse at the
 * button, or a finger's tap there).
 */
async function pressShowMore(page: Page, label: string, by: "mouse" | "finger", shots?: { name: string; theme: string }) {
  const more = page.getByRole("button", { name: label })
  await expect(more).toBeVisible({ timeout: 60_000 })
  await more.evaluate((el) => el.scrollIntoView({ block: "end" }))
  await expect.poll(() => more.evaluate((el) => el.getBoundingClientRect().bottom <= innerHeight)).toBe(true)
  if (shots) await frame(page, `${shots.name}-before`, shots.theme)
  await page.evaluate(() => {
    const w = window as unknown as { __frames: Frame[]; __framesDone: boolean }
    const list = document.querySelector("[data-grouped-list]")!
    let sc = list.closest<HTMLElement>("[data-list-scroller]")
    for (let a = list.parentElement; !sc && a; a = a.parentElement) if (/auto|scroll/.test(getComputedStyle(a).overflowY)) sc = a
    const read = (): Frame => {
      const l = list.getBoundingClientRect()
      const r = sc!.getBoundingClientRect()
      const row = document.elementFromPoint((l.left + l.right) / 2, (Math.max(r.top, 0) + Math.min(r.bottom, innerHeight)) / 2)?.closest("[data-task-id]")
      // Which task (Task i's id ends in i): aria-posinset is set only once the list is windowed.
      const id = row?.getAttribute("data-task-id")
      return { top: sc!.scrollTop, mid: id ? Number(id.slice(-11)) : -1 }
    }
    w.__frames = [read()]
    w.__framesDone = false
    let t0 = -1
    const step = (t: number) => {
      if (t0 < 0) t0 = t
      w.__frames.push(read())
      if (t - t0 < 1000) requestAnimationFrame(step)
      else w.__framesDone = true
    }
    requestAnimationFrame(step)
  })
  const box = (await more.boundingBox())!
  if (by === "finger") await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2)
  else await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
  await page.waitForFunction(() => (window as unknown as { __framesDone: boolean }).__framesDone, null, { timeout: 15_000 })
  if (shots) await frame(page, `${shots.name}-after`, shots.theme)
  return page.evaluate(() => (window as unknown as { __frames: Frame[] }).__frames)
}

/** Every frame keeps the scroller's offset and the row at the middle within one row (40 px) of where the press found them. */
function expectPlaceKept(frames: Frame[]) {
  const [before, ...after] = frames
  expect(before.top, "the list was scrolled down to its Show N more").toBeGreaterThan(400)
  expect(before.mid, "a row sat at the screen's middle").toBeGreaterThan(0)
  expect(before.mid, "the middle row is one of the sixty shown").toBeLessThan(60)
  // The count only proves the reader ran through the press. A busy machine gives fewer frames: 9-13 with parallel
  // workers at load ~21, against 33-50 alone. A jump would hold on every later frame, so a few frames still catch one.
  expect(after.length, "frames read over the second").toBeGreaterThan(5)
  expect(after.filter((f) => Math.abs(f.top - before.top) > 40 || Math.abs(f.mid - before.mid) > 1), `frames that lost the place (before ${JSON.stringify(before)})`).toEqual([])
}

test.describe("a long list keeps the reader's place as it grows, on a computer", () => {
  test.use({ viewport: { width: 1280, height: 860 } })

  for (const theme of SHOT_THEMES)
    test(`Show 1940 more far down a project's group of 2,000 leaves the page where it was (${theme})`, async ({ page }, testInfo) => {
      test.setTimeout(150_000)
      await page.emulateMedia({ colorScheme: theme })
      await openList(page, testInfo, 2000)
      expectPlaceKept(await pressShowMore(page, "Show 1940 more", "mouse", { name: "h32-f1", theme }))
      await expect(page.locator("[data-group='todo'] > [role=list]")).toHaveAttribute("data-rows", "2000", { timeout: 15_000 })
      await expect.poll(() => drawn(page)).toBeLessThan(90)
    })

  test("Show 1940 more far down My Tasks leaves the page where it was", async ({ page }, testInfo) => {
    test.setTimeout(150_000)
    await openMine(page, testInfo, 2000)
    expectPlaceKept(await pressShowMore(page, "Show 1940 more", "mouse"))
    await expect.poll(() => drawn(page)).toBeLessThan(90)
  })
})

test.describe("a long list keeps the reader's place as it grows, by touch", () => {
  test.use({ viewport: { width: 800, height: 1100 }, hasTouch: true })

  test("a tap on Show 1940 more far down a group of 2,000 leaves the page where it was", async ({ page }, testInfo) => {
    test.setTimeout(150_000)
    await openList(page, testInfo, 2000)
    expectPlaceKept(await pressShowMore(page, "Show 1940 more", "finger"))
    await expect(page.locator("[data-group='todo'] > [role=list]")).toHaveAttribute("data-rows", "2000", { timeout: 15_000 })
  })

  // A finger never lights a row (GroupedTaskList's point): a tap leaves the pointer's place where it tapped, and the
  // rows a draw then moves there get the browser's hover update with no touch and no move (fluid-19). None lights.
  test("rows a draw moves under a finger's last tap stay unlit", async ({ page }, testInfo) => {
    test.setTimeout(150_000)
    await openList(page, testInfo, 60)
    await expect(rowOf(page, 59)).toBeAttached({ timeout: 60_000 })
    const lit = page.locator("[data-grouped-list] [data-task-id] [role=checkbox]:not([data-row-box])")
    const row = (await rowOf(page, 4).boundingBox())!
    const x = Math.round(row.x + row.width / 2)
    const y = Math.round(row.y + row.height / 2)
    // The tap opens the row's task; Escape, a key, closes it with no touch.
    await page.touchscreen.tap(x, y)
    await page.waitForTimeout(300)
    await expect(lit, "the tap lit no row").toHaveCount(0)
    await page.keyboard.press("Escape")
    await page.waitForTimeout(300)
    await rowOf(page, 0).evaluate((r) => {
      r.closest<HTMLElement>("[data-list-scroller]")!.style.overflowAnchor = "none"
      r.closest<HTMLElement>("[data-grouped-list]")!.style.paddingTop = "80px"
    })
    await page.waitForTimeout(300)
    const under = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest("[data-task-id]")?.getAttribute("data-task-id") ?? null, [x, y])
    expect(under, "the draw moved another row under the tap's place").toBe(task(2).task_uuid)
    await expect(lit, "no row lit by a draw under the finger's last place").toHaveCount(0)
  })
})

// The phone list (virtua, components/list/virtualInfiniteScroll) is left as it is: the port's 390 case tested a
// touched-row hold that came with commits not ported here (data-vindex rows), and it was red on beta too. A phone's
// open, select and switches are e2e/taskListDraws.spec.ts's "the task list on a phone, by a finger". At 390 there is
// no Show N more (the phone list reads its pages as it scrolls), so here it only checks the stub answers every
// call a phone's page makes: the "Not in this test" toast covered its list's foot in every frame (DB-127 N2). Its
// look frames (SHOTS_DIR) are a phone's marked rows, a tapped row's task and its priority picker, and a failed read.
test.describe("a long list on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })

  test("a finger's fling scrolls the list with rows across the screen, and a tapped row opens its task", async ({ page }, testInfo) => {
    test.setTimeout(150_000)
    await openList(page, testInfo, 2000)
    const first = page.locator("[data-phone-task-row]").first()
    await expect(first).toBeVisible({ timeout: 60_000 })
    // The list scrolls inside the page, under its header and tabs: its rows are read across the part of the screen it
    // has (the points at 30%, 50% and 70% of it), and the fling's move from the list's own scroll.
    const list = () =>
      page.evaluate(() => {
        let sc: Element | null = document.querySelector("[data-phone-task-row]")
        while (sc && !(sc instanceof HTMLElement && /auto|scroll/.test(getComputedStyle(sc).overflowY) && sc.scrollHeight > sc.clientHeight)) sc = sc.parentElement
        const el = (sc ?? document.scrollingElement)!
        const r = el === document.scrollingElement ? { top: 0, bottom: innerHeight } : el.getBoundingClientRect()
        const top = Math.max(r.top, 0)
        const ys = [0.3, 0.5, 0.7].map((f) => top + (Math.min(r.bottom, innerHeight) - top) * f)
        return { scrolled: el.scrollTop, ys, filled: ys.every((y) => !!document.elementFromPoint(195, y)?.closest("[data-phone-task-row]")) }
      })
    const { ys } = await list()
    // A finger's own touches: three quick flicks up from the list's 70% point to the screen's top. Chromium's synthetic
    // touch gesture (Input.synthesizeScrollGesture) sends its press and its release here but none of its moves, so it
    // scrolled nothing on any build; a finger's start, moves and end pan the list as a phone's do.
    const cdp = await page.context().newCDPSession(page)
    const finger = (type: "touchStart" | "touchMove" | "touchEnd", y?: number) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: y === undefined ? [] : [{ x: 195, y }] })
    for (let flick = 0; flick < 3; flick++) {
      await finger("touchStart", Math.round(ys[2]))
      for (let y = Math.round(ys[2]) - 40; y > 40; y -= 40) await finger("touchMove", y)
      await finger("touchEnd")
    }
    await expect.poll(async () => (await list()).filled, { timeout: 5_000 }).toBe(true)
    expect((await list()).scrolled, "the fling moved the list").toBeGreaterThan(1000)
    // A tap while the list still glides only stops it, as on a phone: the tap waits for the list to come to rest.
    let was = -1
    await expect
      .poll(async () => { const at = (await list()).scrolled; const still = at === was; was = at; return still }, { intervals: [250], timeout: 10_000 })
      .toBe(true)
    // On a phone a row is its task's link: the tap opens the task's own page (no drawer on a phone's list).
    const id = await page.evaluate((y) => document.elementFromPoint(195, y)?.closest<HTMLElement>("[data-phone-task-row]")?.dataset.taskId, ys[1])
    expect(id, "a row under the finger").toBeTruthy()
    await page.touchscreen.tap(195, Math.round(ys[1]))
    await expect(page).toHaveURL(new RegExp(`/${id}(?:[?#]|$)`), { timeout: 10_000 })
  })

  test("a finger's tap on a row opens its task, and the keys' mark (data-kbd-nav) never comes by touch", async ({ page }, testInfo) => {
    test.setTimeout(150_000)
    await openList(page, testInfo, 60)
    const row = page.locator("[data-phone-task-row]").nth(2)
    await expect(row).toBeVisible({ timeout: 60_000 })
    const rest = await row.evaluate((r) => getComputedStyle(r).backgroundColor)
    const id = await row.getAttribute("data-task-id")
    const box = (await row.boundingBox())!
    await page.keyboard.press("j")
    await expect(page.locator("[data-kbd-nav]")).toHaveCount(0)
    expect(await row.evaluate((r) => getComputedStyle(r).backgroundColor), "no row tinted by a key on a phone").toBe(rest)
    await page.touchscreen.tap(Math.round(box.x + box.width / 2), Math.round(box.y + box.height / 2))
    await expect(page).toHaveURL(new RegExp(`/${id}(?:[?#]|$)`), { timeout: 10_000 })
    await expect(page.locator("[data-kbd-nav]")).toHaveCount(0)
  })

  test("rows with a lock, badges and a due date line up with rows that have none, on a phone", async ({ page }, testInfo) => {
    await page.emulateMedia({ colorScheme: "dark" })
    await openList(page, testInfo, 12, { marks: MARKS })
    const marked = phoneRowOf(page, 0)
    await expect(marked).toBeVisible({ timeout: 60_000 })
    await expect(marked.locator("[data-restricted-mark]")).toBeVisible()
    await expect(marked.getByText("15 Dec", { exact: true })).toBeVisible()
    await expect(phoneRowOf(page, 4).getByText("20 Oct", { exact: true })).toBeVisible()
    await expect(phoneRowOf(page, 6).locator("[data-restricted-mark]")).toBeVisible()
    const plain = phoneRowOf(page, 1)
    await expect(plain).toBeVisible()
    await expect(plain.locator("[data-restricted-mark]")).toHaveCount(0)
    await expect(plain.getByText(/^\d+ (Dec|Oct)$/)).toHaveCount(0)
    await inTheme(page, "dark")
    await settledFrame(page, "marks-mixed", "dark")
  })

  test("a tap on a row's priority opens its task, as a phone's row is its task's link, and the task's priority picker opens on its first tap", async ({ page }, testInfo) => {
    test.setTimeout(150_000)
    await page.emulateMedia({ colorScheme: "dark" })
    await openList(page, testInfo, 12, { taskPage: true })
    const row = phoneRowOf(page, 2)
    await expect(row).toBeVisible({ timeout: 60_000 })
    // A phone's row draws its priority as a mark, with no picker of its own (a computer's list has one).
    await row.locator("[data-priority-level]").tap()
    await expect(page).toHaveURL(new RegExp(`/${task(2).task_uuid}(?:[?#]|$)`), { timeout: 10_000 })
    await expect(page.locator("[data-task-panel]").getByText("Task 2").first()).toBeVisible({ timeout: 30_000 })
    await inTheme(page, "dark")
    await settledFrame(page, "tap-opens-task", "dark")
    await inTheme(page, "light")
    await page.getByRole("button", { name: /^Priority: .*Change priority$/ }).tap()
    await expect(page.getByRole("option", { name: /Medium/ })).toBeVisible()
    await expect(page.getByRole("option", { name: /Urgent/ })).toBeVisible()
    await settledFrame(page, "row-menu-first", "light")
  })

  test("a failed read says so on a phone, and Try again brings the rows back", async ({ page }, testInfo) => {
    test.setTimeout(150_000)
    await page.emulateMedia({ colorScheme: "light" })
    const server: Server = { fail: true }
    await openList(page, testInfo, 640, server)
    await expect(page.getByText("Couldn't load this project's tasks")).toBeVisible({ timeout: 60_000 })
    const again = page.getByRole("button", { name: "Try again" })
    await expect(again).toBeVisible()
    await inTheme(page, "light")
    await settledFrame(page, "list-failed", "light")
    server.fail = false
    await again.tap()
    await expect(page.locator("[data-phone-task-row]").first()).toBeVisible({ timeout: 30_000 })
  })

  for (const theme of SHOT_THEMES)
    test(`draws with every call answered, so no toast covers its foot, mid-list or at its end (${theme})`, async ({ page }, testInfo) => {
      test.setTimeout(150_000)
      await page.emulateMedia({ colorScheme: theme })
      await openList(page, testInfo, 2000)
      await expect(page.locator("[data-phone-task-row]").first()).toBeVisible({ timeout: 60_000 })
      const scrollTo = (f: number) =>
        page.evaluate((at) => {
          let sc: Element | null = document.querySelector("[data-phone-task-row]")
          while (sc && !(sc instanceof HTMLElement && /auto|scroll/.test(getComputedStyle(sc).overflowY) && sc.scrollHeight > sc.clientHeight)) sc = sc.parentElement
          const el = (sc ?? document.scrollingElement)!
          el.scrollTo({ top: (el.scrollHeight - el.clientHeight) * at })
        }, f)
      await scrollTo(0.5)
      await untilStill(page)
      await frame(page, "h32-phone-mid", theme)
      // The end: the last row drawn sits wholly on the screen, and nothing (a toast, a bar) covers its middle.
      const last = page.locator("[data-phone-task-row]").last()
      await expect
        .poll(
          async () => {
            await scrollTo(1)
            return last.evaluate((r) => {
              const b = r.getBoundingClientRect()
              const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2)
              return b.bottom <= innerHeight && !!hit && r.contains(hit)
            })
          },
          { timeout: 30_000 },
        )
        .toBe(true)
      await untilStill(page)
      await frame(page, "h32-phone-end", theme)
      await expectEveryCallAnswered(page)
    })
})
