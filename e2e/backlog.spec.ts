import { expect, test, type Page, type Request, type TestInfo } from "@playwright/test"

import { holdChunk } from "./holdChunk"
import { SAM, stubBackend, withStatus } from "./stubbedApp"

// The backlog tab (projects B3, STEP4_PLAN §4 #9 and STEP5 spec F): two
// cycles and the backlog, a drag in progress into the next cycle, a cycle
// over capacity, the complete dialog, both empty states and a phone's sheet;
// tasks picked with X and moved with Shift+C, and a cycle's own capacity
// (linear-13). With SHOTS_DIR set, each view is also saved for review.

const P = "9e0a0000-0000-4000-8000-0000000000b3"
const NONE = "0001-01-01T00:00:00Z"
const id = (i: number) => `7a5c00b3-0000-4000-8000-${String(i + 1).padStart(12, "0")}`
const admin = { role: "admin", view: true, comment: true, create_tasks: true, edit_tasks: "all", delete_tasks: "all", log_time: true, post_updates: true, add_files: true, manage: true, manage_people: true, archive: true }
const MAYA = { user_uuid: "5a5c00b3-0000-4000-8000-0000000000a1", user_name: "maya", user_full_name: "Maya Chen" }
const project = { project_uuid: P, project_name: "Q4 launch", project_is_admin: 1, project_is_member: 1, project_members: [SAM, MAYA], project_access: admin }
const type = (builtin: string, name: string) => ({ id: `t-${builtin}`, builtin, name, icon: builtin })

const row = (i: number, name: string, key: string, extra: Record<string, unknown> = {}) => ({
  task_uuid: id(i),
  task_name: name,
  task_status: "todo",
  task_priority: "medium",
  task_created_at: "2026-10-01T09:00:00Z",
  task_deleted_at: NONE,
  task_key: key,
  task_assignee: i % 2 ? MAYA : SAM,
  ...extra,
})

function world(empty = false) {
  if (empty) return { cycles: [], tasks: [], count: 0, estimate_minutes: 0 }
  const now = Date.now()
  const day = 86_400_000
  return {
    cycles: [
      {
        id: "c-3", project_uuid: P, number: 3, name: "", starts_at: new Date(now - 4 * day).toISOString(), ends_at: new Date(now + 10 * day).toISOString(), state: "current",
        progress: { total: 4, started: 1, done: 1 },
        tasks: [
          row(0, "Write the launch announcement", "Q4-12", { task_status: "inProgress", task_estimate_minutes: 480, task_sub_task_count: 5, task_sub_task_done: 2 }),
          row(1, "Review the pricing page copy", "Q4-9", { task_estimate_minutes: 360, task_work_type: type("approval", "Approval") }),
          row(2, "Set up SSO for the pilot customer", "Q4-104", { task_estimate_minutes: 900, task_work_type: type("feature", "Feature") }),
          row(3, "Fix the signup confirmation email", "Q4-7", { task_status: "done", task_estimate_minutes: 120, task_work_type: type("bug", "Bug") }),
        ],
        estimate_minutes: 1860,
      },
      {
        id: "c-4", project_uuid: P, number: 4, name: "Launch week", starts_at: new Date(now + 10 * day).toISOString(), ends_at: new Date(now + 24 * day).toISOString(), state: "upcoming",
        progress: { total: 1, started: 0, done: 0 },
        tasks: [row(4, "Record the product walkthrough", "Q4-13", { task_estimate_minutes: 240 })],
        estimate_minutes: 240,
      },
    ],
    tasks: [
      row(5, "Plan the webinar", "Q4-21", { task_estimate_minutes: 180 }),
      row(6, "Draft the press note", "Q4-22", { task_estimate_minutes: 120, task_sub_task_count: 3, task_sub_task_done: 0 }),
      row(7, "Collect customer quotes", "Q4-23"),
      row(8, "Translate the landing page", "Q4-24", { task_estimate_minutes: 300, task_work_type: type("request", "Request") }),
    ],
    count: 4,
    estimate_minutes: 600,
    capacity_minutes: 1440,
  }
}

/** The backlog as the stub keeps it, loosely: what a bulk move and a capacity change touch. */
type Plan = { cycles: { id: string; tasks: { task_uuid: string }[]; capacity_minutes?: number }[]; tasks: { task_uuid: string }[]; count: number }

/** The scales a project may take, as GET /project/{p}/estimates lists them (linear-05). */
const KINDS = [
  { kind: "exponential", name: "Exponential", sizes: [1, 2, 4, 8, 16], more: [32, 64] },
  { kind: "fibonacci", name: "Fibonacci", sizes: [1, 2, 3, 5, 8], more: [13, 21] },
  { kind: "linear", name: "Linear", sizes: [1, 2, 3, 4, 5], more: [6, 7] },
  { kind: "tshirt", name: "T-shirt", sizes: [1, 2, 3, 5, 8], more: [13, 21], names: ["XS", "S", "M", "L", "XL", "XXL", "XXXL"] },
]

/** Fibonacci as the server shows a project's scale. */
const FIBONACCI = { kind: "fibonacci", extended: false, allow_zero: false, count_unestimated: true, sizes: [1, 2, 3, 5, 8], labels: ["1", "2", "3", "5", "8"] }

/** The backlog as the server counts it on a Fibonacci scale: every other task has points, the rest count as one; its answer names the scale. */
function inPoints(plan: Plan) {
  const pts = <T extends { task_uuid: string }>(t: T, i: number): T & { task_estimate_points?: number } => (i % 2 === 0 ? { ...t, task_estimate_points: [1, 2, 3, 5, 8][i % 5] } : t)
  const sum = (tasks: { task_estimate_points?: number }[]) => tasks.reduce((n, t) => n + (t.task_estimate_points ?? 1), 0)
  const cycles = plan.cycles.map((c) => {
    const tasks = c.tasks.map(pts)
    return { ...c, tasks, estimate_points: sum(tasks) }
  })
  const tasks = plan.tasks.map(pts)
  return { ...plan, cycles, tasks, estimate_points: sum(tasks) + (plan.count - tasks.length), scale: FIBONACCI }
}

/**
 * The estimates dialog's other states (linear-05), at the width the test runs
 * at: its rows held while the scale is read, the read's failure with Try
 * again, and a save the server refuses, said above the dialog's actions.
 */
async function estimatesStates(page: Page, state: Awaited<ReturnType<typeof openBacklog>>, theme: string) {
  let letRead = () => {}
  state.estimatesHeld = new Promise<void>((resolve) => (letRead = resolve))
  state.readFails = true
  await page.getByRole("button", { name: "Estimates" }).click()
  const dialog = page.getByRole("dialog", { name: "Estimates" })
  await expect(dialog.getByRole("status", { name: "Loading the project's estimates" })).toBeVisible()
  await shot(page, "estimates-loading", theme)
  letRead()
  const retry = dialog.getByRole("button", { name: /Try again/ })
  await expect(retry).toBeVisible()
  await shot(page, "estimates-failed", theme)
  state.readFails = false
  await retry.click()
  await expect(dialog.getByRole("radio", { name: "Hours" })).toBeChecked()
  state.saveFails = true
  await dialog.getByRole("radio", { name: "Fibonacci" }).click()
  const save = dialog.getByRole("button", { name: "Save" })
  await save.click()
  const alert = dialog.getByRole("alert")
  await expect(alert).toBeVisible()
  await expect(alert).toBeInViewport({ ratio: 1 })
  // Said above the actions, never under a pinned footer.
  expect((await alert.boundingBox())!.y + (await alert.boundingBox())!.height).toBeLessThanOrEqual((await save.boundingBox())!.y)
  await shot(page, "estimates-save-failed", theme)
}

/** The server's bulk "cycle" op on the stub's backlog: the tasks move to the cycle (to), or ("") back to the backlog. */
function moveIn(plan: Plan, ids: string[], to: string) {
  const moving = [...plan.cycles.flatMap((c) => c.tasks), ...plan.tasks].filter((t) => ids.includes(t.task_uuid))
  plan.tasks = plan.tasks.filter((t) => !ids.includes(t.task_uuid))
  for (const c of plan.cycles) c.tasks = c.tasks.filter((t) => !ids.includes(t.task_uuid))
  if (to) plan.cycles.find((c) => c.id === to)?.tasks.push(...moving)
  else plan.tasks.unshift(...moving)
  plan.count = plan.tasks.length
}

const SCHEDULE = { weeks: 2, cooldown_weeks: 0, upcoming: 2, roll_over: true, add_started: false, starts_at: new Date(Date.now() - 4 * 86_400_000).toISOString() }

/** Words only the Estimates dialog's own chunk carries. */
const ESTIMATES_CODE = "How long each task should take."

/**
 * The Estimates dialog's code comes as it first opens, held back here as a
 * slow line would: the backlog stays on screen while it comes (V-39: a dialog
 * with no boundary of its own sent the page back to a loading skeleton until
 * its chunk landed), and the dialog opens as it lands.
 */
async function estimatesWhileItsCodeComes(page: Page, phone: boolean) {
  const code = await holdChunk(page, ESTIMATES_CODE)
  const open = page.getByRole("button", { name: "Estimates" })
  await (phone ? open.tap() : open.click())
  await expect.poll(code.asked).toBe(true)
  await expect(page.locator("[data-backlog]")).toBeVisible({ timeout: 2_000 })
  await expect(page.locator("[data-sheet-skeleton]")).toHaveCount(0)
  code.release()
  await expect(page.getByRole("dialog", { name: "Estimates" })).toBeVisible({ timeout: 30_000 })
  await code.done()
}

async function openBacklog(page: Page, testInfo: TestInfo, empty = false, scheduled = false, points = false) {
  const state: {
    backlog: ReturnType<typeof world>
    schedule: typeof SCHEDULE | null
    saved?: unknown
    bulk?: unknown
    capacity?: unknown
    scale?: { kind: string }
    estimatesReads: number
    /** The dialog's read waits for this, then fails if readFails; a save fails if saveFails. */
    estimatesHeld?: Promise<void>
    readFails?: boolean
    saveFails?: boolean
  } = {
    backlog: world(empty),
    schedule: scheduled ? SCHEDULE : null,
    scale: points ? { kind: "fibonacci" } : undefined,
    estimatesReads: 0,
  }
  await stubBackend(page, testInfo, {
    [`/project/taskList/${P}`]: { msg: "ok", data: { ...project, project_task_count: 9, project_tasks: [] }, pageCount: 1 },
    // The board is read ahead while the page idles.
    [`/project/taskListForKanban/${P}`]: {
      msg: "ok",
      data: {
        ...project,
        project_tasks_backlog: [],
        project_tasks_todo: empty ? [] : [...state.backlog.tasks, ...state.backlog.cycles.flatMap((c) => c.tasks.filter((t) => t.task_status === "todo"))],
        project_tasks_in_progress: empty ? [] : state.backlog.cycles.flatMap((c) => c.tasks.filter((t) => t.task_status === "inProgress")),
        project_tasks_in_review: [],
        project_tasks_done: empty ? [] : state.backlog.cycles.flatMap((c) => c.tasks.filter((t) => t.task_status === "done")),
        project_tasks_canceled: [],
        project_tasks_done_count: empty ? 0 : 1,
        project_tasks_canceled_count: 0,
        project_column_counts: empty ? {} : { backlog: 0, todo: 7, inProgress: 1, inReview: 0, done: 1, canceled: 0 },
      },
    },
    [`/project/info/${P}`]: { msg: "ok", data: project },
    [`/project/membersInfo/${P}`]: { msg: "ok", data: project },
    [`/project/${P}/updates`]: { msg: "ok", data: { updates: [], can_post: true } },
    [`/project/${P}/cycles`]: { msg: "ok", data: { cycles: [], can_edit: true } },
    [`/project/${P}/goals`]: { msg: "ok", data: { goals: [] } },
    [`/project/${P}/statuses`]: { msg: "ok", data: null },
    [`/project/${P}/fields`]: { msg: "ok", data: { fields: [], can_edit: true } },
    [`/project/${P}/tags`]: { msg: "ok", data: [] },
    [`/project/${P}/types`]: { msg: "ok", data: [], icons: [] },
    [`/project/${P}/backlog`]: () => ({
      msg: "ok",
      data: { backlog: state.scale?.kind === "fibonacci" ? inPoints(state.backlog as unknown as Plan) : state.backlog, schedule: state.schedule, can_edit: true, can_plan: true },
    }),
    // How the project estimates (linear-05): hours until its admin picks a scale.
    [`/project/${P}/estimates`]: async (_url: URL, request: Request) => {
      if (request.method() === "POST") {
        if (state.saveFails) return withStatus(500, { msg: "The estimates couldn't be saved just now." })
        state.scale = request.postDataJSON() as { kind: string }
      } else {
        state.estimatesReads++
        await state.estimatesHeld
        if (state.readFails) return withStatus(503, { msg: "The project's estimates couldn't be read just now." })
      }
      const scale = state.scale?.kind === "fibonacci" ? { ...FIBONACCI, ...state.scale } : null
      return { msg: "ok", data: { scale, kinds: KINDS, can_edit: true } }
    },
    // The cycles' calendar link (linear-12 part 4): none yet; made, its address once.
    [`/project/${P}/cycles/feed`]: (_url: URL, request: Request) =>
      request.method() === "POST"
        ? { msg: "ok", data: { live: true, url: "https://api.onecamp.test/public/cycles/Zq3x9Kp2LmN8vB4tR7wY1cD6fH0jS5aE.ics", created_at: new Date().toISOString() } }
        : { msg: "ok", data: { live: false } },
    [`/project/${P}/cycles/schedule`]: (_url: URL, request: Request) => {
      const body = request.postDataJSON() as unknown
      state.saved = body
      state.schedule = { ...SCHEDULE, ...(body as object) }
      return { msg: "ok", data: state.schedule }
    },
    "/task/bulk": (_url: URL, request: Request) => {
      const body = request.postDataJSON() as { task_uuids: string[]; op: string; value: string }
      state.bulk = body
      if (body.op === "cycle") moveIn(state.backlog as unknown as Plan, body.task_uuids, body.value)
      return { msg: "ok", data: { refused: [] } }
    },
    [`/project/${P}/cycles/c-3/capacity`]: (_url: URL, request: Request) => {
      const body = request.postDataJSON() as { capacity_minutes?: number | null; capacity_points?: number | null }
      state.capacity = body
      const cycle = (state.backlog as unknown as Plan).cycles[0]
      // A project in points sets it in points (linear-05); the other key is refused.
      if ("capacity_points" in body) Object.assign(cycle, { capacity_points: body.capacity_points ?? undefined })
      else cycle.capacity_minutes = body.capacity_minutes ?? undefined
      return { msg: "ok", data: null }
    },
    // The keys load the task they're on ahead of its opening (KeyboardList).
    "/task/info/": (url: URL) => {
      const plan = state.backlog as unknown as Plan
      const t = [...plan.cycles.flatMap((c) => c.tasks), ...plan.tasks].find((x) => url.pathname.endsWith(x.task_uuid))
      return { msg: "ok", data: { ...t, task_description: "", task_sub_tasks: [], task_comments: [], task_activities: [], task_attachments: [], task_collaborators: [], task_blocked_by: [], task_blocks: [] } }
    },
    "/task/views": { msg: "ok", data: [] },
    "/user/dm-ai-targets": { msg: "ok", data: [] },
    "/notices": { msg: "ok", data: [] },
  })
  await page.addInitScript(() => localStorage.setItem("oc_keys_tip_seen", "1"))
  await page.goto(`/app/project/${P}?tab=backlog`, { waitUntil: "domcontentloaded", timeout: 120_000 })
  await expect(page.locator("[data-backlog]")).toBeVisible({ timeout: 60_000 })
  return state
}

async function shot(page: Page, name: string, theme: string) {
  const dir = process.env.SHOTS_DIR
  if (!dir) return
  await expect(page.getByText("Not in this test")).toHaveCount(0)
  await page.waitForTimeout(400)
  await page.screenshot({ path: `${dir}/${name}-${page.viewportSize()?.width}-${theme}.png` })
}

for (const theme of ["light", "dark"] as const) {
  test.describe(`the backlog at 1280, ${theme}`, () => {
    test.use({ viewport: { width: 1280, height: 900 }, colorScheme: theme })

    test("two cycles and the backlog; a drag into the next cycle; the complete dialog", async ({ page }, testInfo) => {
      test.setTimeout(180_000)
      await openBacklog(page, testInfo)
      const current = page.locator("[data-container='c-3']")
      await expect(current.locator("[data-cycle-totals]")).toHaveText("4 tasks · 31 h of 24 h")
      await expect(current.locator("[data-load]")).toHaveAttribute("data-load", "over")
      await expect(page.locator("[data-backlog-totals]")).toHaveText("4 tasks · 10 h")
      await shot(page, "cycles", theme)

      const from = (await page.locator(`[data-task-id="${id(5)}"]`).boundingBox())!
      const to = (await page.locator("[data-container='c-4']").boundingBox())!
      await page.mouse.move(from.x + 200, from.y + from.height / 2)
      await page.mouse.down()
      await page.mouse.move(from.x + 210, from.y + from.height / 2 + 6, { steps: 3 })
      await page.mouse.move(to.x + 200, to.y + to.height / 2, { steps: 12 })
      await expect(page.locator("[data-container='c-4']")).toHaveAttribute("data-drop", "valid")
      await shot(page, "drag", theme)
      await page.keyboard.press("Escape")
      await page.mouse.up()

      await page.getByRole("button", { name: "Complete cycle" }).click()
      await expect(page.getByRole("dialog", { name: "Complete Cycle 3" })).toBeVisible()
      await shot(page, "complete", theme)
    })

    test("the cycles in a calendar: a link of your own, shown once", async ({ page }, testInfo) => {
      test.setTimeout(180_000)
      await openBacklog(page, testInfo)
      await page.getByRole("button", { name: "Add to calendar" }).click()
      const dialog = page.getByRole("dialog", { name: "Show cycles in your calendar" })
      await expect(dialog).toBeVisible()
      await expect(dialog.getByText("No link yet.")).toBeVisible()
      await shot(page, "feed", theme)
      await dialog.getByRole("button", { name: "Make a link" }).click()
      await expect(dialog.getByRole("textbox", { name: "The cycles' calendar link" })).toHaveValue(/\/public\/cycles\/.+\.ics$/)
      await shot(page, "feed-made", theme)
      await dialog.getByRole("button", { name: "Done" }).click()
      await expect(dialog).toHaveCount(0)
    })

    test("estimates in points: the admin picks Fibonacci, and the cycles count points", async ({ page }, testInfo) => {
      test.setTimeout(180_000)
      const state = await openBacklog(page, testInfo)
      await page.getByRole("button", { name: "Estimates" }).click()
      const dialog = page.getByRole("dialog", { name: "Estimates" })
      await expect(dialog.getByRole("radio", { name: "Hours" })).toBeChecked()
      await dialog.getByRole("radio", { name: "Fibonacci" }).click()
      await expect(dialog.getByRole("switch", { name: /The two larger sizes/ })).toBeVisible()
      await shot(page, "estimates", theme)
      await dialog.getByRole("button", { name: "Save" }).click()
      await expect(dialog).toHaveCount(0)
      expect(state.scale).toMatchObject({ kind: "fibonacci", extended: false, allow_zero: false, count_unestimated: true })
      await expect(page.locator("[data-cycle-totals]").first()).toContainText(/points?\b/)
      await expect(page.locator("[data-backlog-totals]")).toContainText(/points?\b/)
      await expect(page.locator("[data-task-points]").first()).toBeVisible()
      await shot(page, "points", theme)
    })

    test("a project in points paints its backlog in points at once, from the backlog's own answer", async ({ page }, testInfo) => {
      test.setTimeout(180_000)
      const state = await openBacklog(page, testInfo, false, false, true)
      await expect(page.locator("[data-backlog-totals]")).toContainText(/points?\b/)
      await expect(page.locator("[data-cycle-totals]").first()).toContainText(/points?\b/)
      await expect(page.locator("[data-task-points]").first()).toBeVisible()
      // The unit came with the numbers: no second read for it.
      expect(state.estimatesReads).toBe(0)
      await shot(page, "points-first-paint", theme)
    })

    test("the estimates dialog holds its place while it reads, and says when it can't read or can't save", async ({ page }, testInfo) => {
      test.setTimeout(180_000)
      const state = await openBacklog(page, testInfo)
      await estimatesStates(page, state, theme)
    })

    test("the backlog stays on screen while the estimates dialog's code comes, and the dialog opens as it lands", async ({ page }, testInfo) => {
      test.setTimeout(180_000)
      await openBacklog(page, testInfo)
      await estimatesWhileItsCodeComes(page, false)
    })

    test("a cycle's capacity in points: the load bar, its line and the popover count points", async ({ page }, testInfo) => {
      test.setTimeout(180_000)
      const state = await openBacklog(page, testInfo, false, false, true)
      const totals = page.locator("[data-container='c-3'] [data-cycle-totals]")
      await totals.click()
      const capacity = page.getByRole("textbox", { name: "Capacity for Cycle 3" })
      await expect(capacity).toHaveAttribute("placeholder", /points/)
      await capacity.fill("8")
      await shot(page, "capacity-points-popover", theme)
      await page.getByRole("button", { name: "Save" }).click()
      await expect.poll(() => state.capacity).toEqual({ capacity_points: 8 })
      await expect(totals).toContainText(/ of 8 points/)
      await expect(totals).not.toContainText(/points of/)
      await expect(page.locator("[data-container='c-3'] [data-load]")).toBeVisible()
      await shot(page, "capacity-points", theme)
    })

    test("cycles that run themselves: the line, and the schedule's dialog", async ({ page }, testInfo) => {
      test.setTimeout(180_000)
      const state = await openBacklog(page, testInfo, false, true)
      await expect(page.locator("[data-schedule]")).toHaveText("Every 2 weeks · 2 ready ahead · unfinished tasks move on")
      await shot(page, "scheduled", theme)
      await page.getByRole("button", { name: "Change schedule" }).click()
      const dialog = page.getByRole("dialog", { name: "Cycle schedule" })
      await expect(dialog).toBeVisible()
      await dialog.getByRole("radio", { name: "1 week" }).click()
      await dialog.getByRole("switch", { name: "A week off between cycles" }).click()
      await shot(page, "schedule", theme)
      await dialog.getByRole("button", { name: "Save" }).click()
      await expect(page.locator("[data-schedule]")).toHaveText("Every week, then a week off · 2 ready ahead · unfinished tasks move on")
      expect(state.saved).toMatchObject({ weeks: 1, cooldown_weeks: 1, upcoming: 2, roll_over: true })
      expect(String((state.saved as { starts_at: string }).starts_at)).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    })

    test("picks tasks with X, moves them into a cycle with Shift+C, and sets a cycle's capacity at its totals", async ({ page }, testInfo) => {
      test.setTimeout(180_000)
      const state = await openBacklog(page, testInfo)
      await page.locator(`[data-task-id="${id(5)}"]`).focus()
      await page.keyboard.press("x")
      await page.keyboard.press("j")
      await page.keyboard.press("x")
      await expect(page.getByRole("toolbar", { name: "2 tasks selected" })).toBeVisible()
      await page.keyboard.press("Shift+C")
      const pick = page.getByRole("option", { name: /Launch week/ })
      await expect(pick).toBeVisible()
      await shot(page, "bulk-cycle", theme)
      await pick.click()
      const next = page.locator("[data-container='c-4']")
      await expect(next.locator(`[data-task-id="${id(5)}"]`)).toBeVisible()
      await expect(next.locator(`[data-task-id="${id(6)}"]`)).toBeVisible()
      expect(state.bulk).toEqual({ task_uuids: [id(5), id(6)], op: "cycle", value: "c-4" })

      await page.keyboard.press("Escape")
      const totals = page.locator("[data-container='c-3'] [data-cycle-totals]")
      await totals.click()
      const hours = page.getByRole("textbox", { name: "Capacity for Cycle 3" })
      await expect(hours).toBeFocused()
      await shot(page, "capacity", theme)
      await hours.fill("36")
      await page.getByRole("button", { name: "Save" }).click()
      await expect(totals).toHaveText("4 tasks · 31 h of 36 h")
      await expect(page.locator("[data-container='c-3'] [data-load]")).toHaveAttribute("data-load", "under")
      expect(state.capacity).toEqual({ capacity_minutes: 2160 })
    })

    test("before any cycle, and with everything planned", async ({ page }, testInfo) => {
      test.setTimeout(180_000)
      await openBacklog(page, testInfo, true)
      await expect(page.getByRole("heading", { name: "Plan in cycles" })).toBeVisible()
      await expect(page.getByText("Everything is planned.")).toBeVisible()
      await shot(page, "empty", theme)
    })
  })

  test.describe(`the backlog at 390, ${theme}`, () => {
    test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: theme })

    test("a phone stacks the containers and moves a task from its sheet", async ({ page }, testInfo) => {
      test.setTimeout(180_000)
      await openBacklog(page, testInfo)
      await expect(page.locator("[data-container='c-3']")).toBeVisible()
      // Nothing runs past the screen's edge: the header's action and each row's ⋯ fit.
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
      const complete = (await page.getByRole("button", { name: "Complete cycle" }).boundingBox())!
      expect(complete.x + complete.width).toBeLessThanOrEqual(390)
      await shot(page, "phone", theme)
      await page.getByRole("button", { name: "Move Plan the webinar" }).click()
      await expect(page.locator("[data-move-sheet]")).toBeVisible()
      await shot(page, "move", theme)
    })

    test("a phone sets a cycle's capacity in a sheet", async ({ page }, testInfo) => {
      test.setTimeout(180_000)
      await openBacklog(page, testInfo)
      await page.locator("[data-container='c-3'] [data-cycle-totals]").tap()
      const sheet = page.locator("[data-capacity]")
      await expect(sheet).toBeVisible()
      await expect(sheet.getByRole("button", { name: "Save" })).toBeInViewport({ ratio: 1 })
      // Its action spans the sheet's foot, as every sheet's does.
      await expect.poll(async () => (await sheet.getByRole("button", { name: "Save" }).boundingBox())?.width ?? 0).toBeGreaterThan(300)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
      await shot(page, "capacity-sheet", theme)
    })

    test("a phone puts the cycles in a calendar from a sheet", async ({ page }, testInfo) => {
      test.setTimeout(180_000)
      await openBacklog(page, testInfo)
      await page.getByRole("button", { name: "Add to calendar" }).click()
      const sheet = page.getByRole("dialog", { name: "Show cycles in your calendar" })
      await expect(sheet).toBeVisible()
      await sheet.getByRole("button", { name: "Make a link" }).click()
      await expect(sheet.getByRole("textbox", { name: "The cycles' calendar link" })).toHaveValue(/\/public\/cycles\/.+\.ics$/)
      await expect(sheet.getByRole("button", { name: "Done" })).toBeInViewport({ ratio: 1 })
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
      await shot(page, "feed-sheet", theme)
    })

    test("a phone sets the estimates in a sheet, its actions in reach", async ({ page }, testInfo) => {
      test.setTimeout(180_000)
      await openBacklog(page, testInfo)
      await page.getByRole("button", { name: "Estimates" }).click()
      const sheet = page.getByRole("dialog", { name: "Estimates" })
      await sheet.getByRole("radio", { name: "T-shirt" }).click()
      await expect(sheet.getByText("XS, S, M, L, XL")).toBeVisible()
      await expect(sheet.getByRole("button", { name: "Save" })).toBeInViewport({ ratio: 1 })
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
      await shot(page, "estimates-sheet", theme)
    })

    test("a phone's estimates sheet holds its place while it reads, and says when it can't read or can't save", async ({ page }, testInfo) => {
      test.setTimeout(180_000)
      const state = await openBacklog(page, testInfo)
      await estimatesStates(page, state, theme)
    })

    test("a phone keeps the backlog on screen while the estimates sheet's code comes, and the sheet opens as it lands", async ({ page }, testInfo) => {
      test.setTimeout(180_000)
      await openBacklog(page, testInfo)
      await estimatesWhileItsCodeComes(page, true)
    })

    test("a phone counts a project in points: the header says the points, as the rows drop their chips", async ({ page }, testInfo) => {
      test.setTimeout(180_000)
      await openBacklog(page, testInfo, false, false, true)
      await expect(page.locator("[data-backlog-totals]")).toContainText(/points?\b/)
      await expect(page.locator("[data-cycle-totals]").first()).toContainText(/points?\b/)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
      await shot(page, "points", theme)
    })

    test("a phone sets a cycle's capacity in points in a sheet", async ({ page }, testInfo) => {
      test.setTimeout(180_000)
      const state = await openBacklog(page, testInfo, false, false, true)
      const totals = page.locator("[data-container='c-3'] [data-cycle-totals]")
      await totals.tap()
      const sheet = page.locator("[data-capacity]")
      await expect(sheet).toBeVisible()
      await sheet.getByRole("textbox", { name: "Capacity for Cycle 3" }).fill("8")
      await expect(sheet.getByRole("button", { name: "Save" })).toBeInViewport({ ratio: 1 })
      await shot(page, "capacity-points-sheet", theme)
      await sheet.getByRole("button", { name: "Save" }).tap()
      await expect.poll(() => state.capacity).toEqual({ capacity_points: 8 })
      await expect(totals).toContainText(/ of 8 points/)
    })

    test("a phone sets the schedule in a sheet, its actions pinned at the foot", async ({ page }, testInfo) => {
      test.setTimeout(180_000)
      await openBacklog(page, testInfo)
      await page.getByRole("button", { name: "Run cycles automatically" }).click()
      const sheet = page.getByRole("dialog", { name: "Run cycles automatically" })
      await expect(sheet).toBeVisible()
      // Once the sheet has slid up, its action sits whole on the screen.
      await expect(sheet.getByRole("button", { name: "Run them" })).toBeInViewport({ ratio: 1 })
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
      await shot(page, "schedule-sheet", theme)
    })
  })
}
