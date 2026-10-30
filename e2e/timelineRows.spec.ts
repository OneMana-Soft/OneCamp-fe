import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test"

import { SAM, SHOT_THEMES, holdPages, stubBackend } from "./stubbedApp"

// The timeline's rows (projects F-1 #4): rows and bars are drawn once and kept
// while the timeline scrolls, and the guest's project page loads the timeline
// only when its tab opens. This checks both in a production build: the bars
// and names are there before and after a scroll, and the guest's tab arrives.
// With SHOTS_DIR set, each state is saved at the viewport and theme it ran in.

const P = "9e0a0000-0000-4000-8000-0000000000f1"
const TOKEN = "f1-timeline-guest"
const ADMIN = { role: "admin", view: true, comment: true, create_tasks: true, edit_tasks: "all", delete_tasks: "all", log_time: true, post_updates: true, add_files: true, manage: true, manage_people: true, archive: true }

const NAMES = [
  "Write the launch announcement",
  "Review the pricing page copy",
  "Record the product walkthrough",
  "Set up SSO for the pilot customer",
  "Plan the webinar",
  "Fix the signup confirmation email",
  "Draft the onboarding emails",
  "Test the importer on a real Asana export",
]
const STATUSES = ["todo", "inProgress", "inReview", "done"]

/** A day relative to today, at 17:00, as the server sends a date. */
const day = (offset: number) => {
  const d = new Date()
  d.setHours(17, 0, 0, 0)
  d.setDate(d.getDate() + offset)
  return d.toISOString()
}

// Forty tasks: more than a screen of rows, so the timeline has somewhere to scroll.
const TASKS = Array.from({ length: 40 }, (_, i) => ({
  id: `7a5c00f1-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
  name: `${NAMES[i % NAMES.length]}${i >= NAMES.length ? ` (${Math.floor(i / NAMES.length) + 1})` : ""}`,
  status: STATUSES[i % STATUSES.length],
  start: day((i % 12) - 6),
  due: day((i % 12) - 6 + 2 + (i % 5)),
}))
const LAST = TASKS[TASKS.length - 1]

/** The reads this test leaves unanswered (a 404 "Not in this test"), to name in a failure. */
function unanswered(page: Page) {
  const paths: string[] = []
  page.on("response", (r) => {
    if (r.status() === 404 && r.request().method() === "GET") paths.push(new URL(r.url()).pathname)
  })
  return paths
}

/** Saved for review when SHOTS_DIR is set: name-<width>-<theme>.png. */
async function shot(page: Page, name: string, theme: string, misses: string[] = []) {
  const dir = process.env.SHOTS_DIR
  if (!dir) return
  await page.waitForTimeout(450)
  expect(await page.getByText("Not in this test").count(), `a toast for a read this test doesn't answer: ${misses.join(", ")}`).toBe(0)
  await page.screenshot({ path: `${dir}/${name}-${page.viewportSize()?.width}-${theme}.png` })
}

// before runs once the backend is stubbed and before the page opens: a test holds a read there.
async function openProjectTimeline(page: Page, testInfo: TestInfo, before?: () => Promise<unknown>): Promise<string[]> {
  const project = { project_uuid: P, project_name: "Q4 launch", project_is_admin: 1, project_is_member: 1, project_members: [SAM], project_access: ADMIN }
  await stubBackend(page, testInfo, {
    // The timeline reads the project's milestones beside its tasks: none here.
    [`/project/${P}/milestones`]: { msg: "ok", data: { milestones: [], can_manage: true } },
    [`/project/${P}/timeline`]: {
      msg: "ok",
      data: {
        tasks: TASKS.map((t) => ({ task_uuid: t.id, task_name: t.name, task_status: t.status, task_priority: "medium", task_start_date: t.start, task_due_date: t.due, task_created_at: day(-30), task_assignee: SAM })),
        total: TASKS.length,
        can_edit: true,
        project_access: ADMIN,
      },
    },
    // The board's columns, read ahead while the page is idle (its tab opens at once).
    [`/project/taskListForKanban/${P}`]: {
      msg: "ok",
      data: {
        ...project,
        project_tasks_backlog: [],
        project_tasks_todo: [],
        project_tasks_in_progress: [],
        project_tasks_in_review: [],
        project_tasks_done: [],
        project_tasks_canceled: [],
        project_tasks_done_count: 0,
        project_tasks_canceled_count: 0,
        project_column_counts: { backlog: 0, todo: 0, inProgress: 0, inReview: 0, done: 0, canceled: 0 },
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
    "/entities": { msg: "ok", data: [{ kind: "project", id: P, access: "view", data: { project_name: "Q4 launch" }, topic: `project/${P}` }] },
    // A bar the pointer passes is read ahead (the panel's warm-up), as a card is.
    "/task/info/": (url: URL) => {
      const t = TASKS.find((x) => url.pathname.endsWith(x.id)) ?? TASKS[0]
      return { msg: "ok", data: { task_uuid: t.id, task_name: t.name, task_status: t.status, task_start_date: t.start, task_due_date: t.due, task_description: "", task_sub_tasks: [], task_comments: [], task_activities: [], task_attachments: [], task_collaborators: [], task_blocked_by: [], task_blocks: [] } }
    },
  })
  const misses = unanswered(page)
  // The keys tip would sit over the shots (onboarding/KeyboardTip).
  await page.addInitScript(() => localStorage.setItem("oc_keys_tip_seen", "1"))
  await before?.()
  await page.goto(`/app/project/${P}?tab=timeline`, { waitUntil: "domcontentloaded", timeout: 120_000 })
  return misses
}

// The day in the middle of the timeline's view, as hooks/useTimelineView keeps it (dayAt over the scroll plus half
// the grid in view), a day's width read off two bars a day apart. A panel opening beside the timeline narrows it,
// and it keeps this day.
const centreDay = (grid: Locator) =>
  grid.evaluate(
    (el, [a, b]) => {
      const left = (id: string) => parseFloat(el.querySelector<HTMLElement>(`[data-bar="${id}"]`)!.style.left)
      const names = el.querySelector("[data-name-column]")!.getBoundingClientRect().width
      return Math.floor((el.scrollLeft + (el.clientWidth - names) / 2) / (left(b) - left(a)))
    },
    [TASKS[0].id, TASKS[1].id],
  )

// Waits for the task's panel to narrow the timeline, then for the frame after, when the view has kept its day
// (a ResizeObserver's turn).
async function narrowed(page: Page, grid: Locator, from: number) {
  await expect.poll(() => grid.evaluate((el) => el.clientWidth), { message: "the task's panel didn't narrow the timeline" }).toBeLessThan(from)
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))))
}

async function openGuestProject(page: Page, testInfo: TestInfo) {
  const card = (t: (typeof TASKS)[number]) => ({ id: t.id, name: t.name, status: t.status, status_label: t.status, start_date: t.start, due_date: t.due, comment_count: 0 })
  await stubBackend(page, testInfo, {
    [`/guest/project/${TOKEN}`]: {
      msg: "ok",
      data: {
        project: "Q4 launch",
        project_uuid: P,
        can_comment: false,
        columns: STATUSES.map((status) => ({ status, label: status, tasks: TASKS.filter((t) => t.status === status).map(card) })),
        total_tasks: TASKS.length,
        done_tasks: TASKS.filter((t) => t.status === "done").length,
        generated_at: new Date().toISOString(),
      },
    },
  })
  await page.goto(`/guest/p/${TOKEN}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
}

for (const theme of SHOT_THEMES) {
  for (const viewport of [{ width: 1280, height: 860 }, { width: 390, height: 844 }]) {
    test.describe(`the timeline's rows at ${viewport.width}, ${theme}`, () => {
      test.use({ viewport, colorScheme: theme })

      test("keeps its bars and names as it scrolls", async ({ page }, testInfo) => {
        test.setTimeout(180_000)
        const misses = await openProjectTimeline(page, testInfo)
        const grid = page.locator("[data-timeline]").getByRole("region", { name: "Timeline" })
        await expect(grid.locator("[data-bar]").first()).toBeVisible({ timeout: 90_000 })
        await shot(page, "timeline", theme, misses)
        // To the foot: the last task's row is drawn, with its bar.
        await grid.evaluate((el) => el.scrollTo({ top: el.scrollHeight }))
        await expect(grid.locator(`[data-bar="${LAST.id}"]`)).toBeAttached()
        await expect(grid.getByText(LAST.name, { exact: true }).first()).toBeVisible()
        await shot(page, "timeline-scrolled", theme, misses)
        // And back: the first rows are there again.
        await grid.evaluate((el) => el.scrollTo({ top: 0 }))
        await expect(grid.getByText(TASKS[0].name, { exact: true }).first()).toBeVisible()
        // Across: a month with only a sliver left in view shows its name whole or not at all (T-1).
        await grid.evaluate((el) => el.scrollTo({ left: el.scrollWidth / 2 - 40 }))
        await shot(page, "timeline-months", theme, misses)
      })

      test("the guest's timeline tab arrives when opened", async ({ page }, testInfo) => {
        test.setTimeout(180_000)
        await openGuestProject(page, testInfo)
        await expect(page.getByText("Q4 launch").first()).toBeVisible({ timeout: 90_000 })
        // The board first, with no timeline on the page yet.
        await expect(page.locator("[data-timeline]")).toHaveCount(0)
        await page.getByRole("tab", { name: "Timeline" }).click()
        const grid = page.locator("[data-timeline]").getByRole("region", { name: "Timeline" })
        await expect(grid.locator("[data-bar]").first()).toBeVisible({ timeout: 60_000 })
        // A month's name is whole or hidden at the chart's edge, and never within 8 px of the
        // "Today" pill: none is cut or crowded on the line that shows (T-1).
        const crowded = await page.locator("[data-month-label]").evaluateAll((boxes) => {
          const pill = document.querySelector("[data-today-pill]")?.getBoundingClientRect()
          return boxes.filter((box) => {
            const name = box.lastElementChild as HTMLElement
            if (name.offsetTop >= box.clientHeight) return false
            const r = name.getBoundingClientRect()
            const cut = r.right > box.getBoundingClientRect().right + 0.5
            const touches = !!pill && r.left < pill.right + 8 && r.right > pill.left - 8
            return cut || touches
          }).length
        })
        expect(crowded).toBe(0)
        await shot(page, "guest-timeline", theme)
      })
    })
  }
}

// V-63: the names down the timeline's start are sticky inside its scroller. Scrolled right, a task's name or a
// group's toggle taking the focus (a click, a tap) must leave the timeline where it is, not send it back to its
// start. (Tables had the same cause, V-59.)
for (const theme of SHOT_THEMES) {
  for (const viewport of [{ width: 1280, height: 860 }, { width: 390, height: 844 }]) {
    const phone = viewport.width < 500
    test.describe(`the timeline's place at ${viewport.width}, ${theme}`, () => {
      test.use({ viewport, colorScheme: theme, hasTouch: phone, isMobile: phone })

      test("stays put when a task's name or a group's toggle takes the focus", async ({ page }, testInfo) => {
        test.setTimeout(180_000)
        const misses = await openProjectTimeline(page, testInfo)
        const grid = page.locator("[data-timeline]").getByRole("region", { name: "Timeline" })
        await expect(grid.locator("[data-bar]").first()).toBeVisible({ timeout: 90_000 })
        const press = (target: Locator) => (phone ? target.tap() : target.click())
        const left = () => grid.evaluate((el) => Math.round(el.scrollLeft))
        // Later weeks, as someone reading ahead has them.
        await grid.evaluate((el) => el.scrollTo({ left: 600 }))
        await expect.poll(left).toBe(600)

        const toggle = grid.locator("[data-timeline-group] button").first()
        await press(toggle)
        await expect(toggle).toHaveAttribute("aria-expanded", "false")
        expect(await left(), "a group's toggle took the focus and the timeline moved").toBe(600)
        await press(toggle)
        await expect(toggle).toHaveAttribute("aria-expanded", "true")

        // What the padding did stays: a bar that takes the focus from out of view comes in beside the names, never
        // under them (the scroll margin on what scrolls under them).
        await grid.evaluate((el) => el.scrollTo({ left: el.scrollWidth }))
        const bar = grid.locator(`[data-bar="${TASKS[0].id}"]`)
        await bar.focus()
        await expect.poll(left).toBeLessThan(600)
        const names = (await page.locator("[data-timeline] [data-name-column]").first().boundingBox())!
        expect((await bar.boundingBox())!.x, "a bar came into view under the names").toBeGreaterThanOrEqual(names.x + names.width - 1)
        await grid.evaluate((el) => el.scrollTo({ left: 600 }))
        await expect.poll(left).toBe(600)
        await shot(page, "timeline-place", theme, misses)

        // Last, because a name opens its task, and on a phone the task is a page of its own that the timeline gives way to.
        // So on a phone the focus comes first (what moved the timeline was the focus landing in the sticky names), and
        // the tap after it only has to reach the task's page.
        const name = grid.getByRole("button", { name: TASKS[0].name, exact: true })
        await expect(name).toBeVisible()
        if (phone) {
          await name.focus()
          expect(await left(), "a task's name took the focus and the timeline moved").toBe(600)
          await press(name)
          await expect(page).toHaveURL(new RegExp(`/app/task/${TASKS[0].id}$`))
        } else {
          // At 1280 the name opens the task's panel beside the timeline, which narrows it: what holds is the day in
          // its middle, not the scroll.
          const day = await centreDay(grid)
          const wide = await grid.evaluate((el) => el.clientWidth)
          await press(name)
          await narrowed(page, grid, wide)
          expect(await centreDay(grid), "a task's name moved the timeline's centre day").toBe(day)
        }
      })

      // V-63b (29 Oct 2026): the scroller is drawn only once the milestones are in too. When they came after the
      // tasks, the view was never placed (it opened at its first day, at any width) and its width never watched, so
      // at 1280 a task's panel opening beside it moved its centre day. The milestones are held until the tasks come.
      test("keeps its view when its milestones come last: its first view, then its centre day as a task's panel opens", async ({ page }, testInfo) => {
        test.setTimeout(180_000)
        let letGo = () => {}
        const misses = await openProjectTimeline(page, testInfo, async () => {
          letGo = await holdPages(page, (url) => url.pathname.endsWith(`/project/${P}/milestones`))
        })
        await page.waitForResponse((r) => new URL(r.url()).pathname.endsWith(`/project/${P}/timeline`))
        // The tasks and the zoom are in (the view is ready) while the milestones are still on their way.
        await page.waitForTimeout(500)
        letGo()
        const grid = page.locator("[data-timeline]").getByRole("region", { name: "Timeline" })
        await expect(grid.locator("[data-bar]").first()).toBeVisible({ timeout: 90_000 })
        const left = () => grid.evaluate((el) => Math.round(el.scrollLeft))
        await expect.poll(left, { message: "the timeline opened at its first day, not at its first view" }).toBeGreaterThan(0)
        // On a phone a task opens as a page of its own, so no panel narrows the timeline: its first view is the check.
        if (phone) {
          await shot(page, "timeline-first-view", theme, misses)
          return
        }

        await grid.evaluate((el) => el.scrollTo({ left: 600 }))
        await expect.poll(left).toBe(600)
        const day = await centreDay(grid)
        const wide = await grid.evaluate((el) => el.clientWidth)
        await grid.getByRole("button", { name: TASKS[0].name, exact: true }).click()
        await narrowed(page, grid, wide)
        expect(await centreDay(grid), "a task's panel opening beside the timeline moved its centre day").toBe(day)
        await shot(page, "timeline-panel-centre", theme, misses)
      })
    })
  }
}
