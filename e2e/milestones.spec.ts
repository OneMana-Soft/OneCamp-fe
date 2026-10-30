import { expect, test, type Locator, type Page, type Request, type TestInfo } from "@playwright/test"

import { SAM, TASK_PANEL_READS, reviewShot, stubBackend, untilStill, withStatus, type Answers } from "./stubbedApp"

// Milestones (linear-16) at 1280, and at 390 by touch, light and dark: the
// project's Updates section, a milestone's options and sharing it with
// another project, its timeline's milestone rows above the tasks,
// Shift+M on the backlog's selection, the task panel's Milestone row, and the
// projects overview's next milestone and its timeline's diamonds. With
// SHOTS_DIR set, each is also saved for review.

const P = "9e0a0000-0000-4000-8000-0000000000c6"
const NONE = "0001-01-01T00:00:00Z"
const id = (i: number) => `7a5c00c6-0000-4000-8000-${String(i + 1).padStart(12, "0")}`
const admin = { role: "admin", view: true, comment: true, create_tasks: true, edit_tasks: "all", delete_tasks: "all", log_time: true, post_updates: true, add_files: true, manage: true, manage_people: true, archive: true }
const project = { project_uuid: P, project_name: "Q4 launch", project_is_admin: 1, project_is_member: 1, project_members: [SAM], project_access: admin }
const at = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString()
/** A day as the server writes a milestone's target, in the browser's own calendar. */
const dayOf = (days: number) => {
  const d = new Date(Date.now() + days * 86_400_000)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

const milestone = (i: string, name: string, target: number, progress: { total: number; started: number; done: number }, next: boolean, span?: [number, number]) => ({
  id: i,
  project_uuid: P,
  name,
  description: "",
  target_date: dayOf(target),
  progress,
  ...(span ? { starts: at(span[0]), ends: at(span[1]) } : {}),
  home: true,
  projects: [{ project_uuid: P, project_name: "Q4 launch" }],
  hidden_projects: 0,
  next,
  can_edit: true,
})
const MILESTONES = [
  milestone("m-1", "Private beta", -3, { total: 3, started: 0, done: 3 }, false, [-20, -4]),
  milestone("m-2", "Public launch", 12, { total: 5, started: 2, done: 1 }, true, [-2, 10]),
  milestone("m-3", "Partner rollout", 30, { total: 0, started: 0, done: 0 }, false),
]

const task = (i: number, name: string, start: number, due: number) => ({
  task_uuid: id(i),
  task_name: name,
  task_status: i === 0 ? "inProgress" : "todo",
  task_priority: "medium",
  task_created_at: at(-30),
  task_deleted_at: NONE,
  task_key: `Q4-${i + 1}`,
  task_start_date: at(start),
  task_due_date: at(due),
  task_assignee: SAM,
})
const TASKS = [task(0, "Write the launch announcement", -2, 3), task(1, "Record the product walkthrough", 1, 6), task(2, "Plan the webinar", 4, 9)]

/** Two more projects the reader runs, and one they're only in. */
const P2 = "9e0a0000-0000-4000-8000-0000000000c7"
const P3 = "9e0a0000-0000-4000-8000-0000000000c8"
const P4 = "9e0a0000-0000-4000-8000-0000000000c9"
/** Public launch, changed. */
const withLaunch = (change: Partial<(typeof MILESTONES)[number]>) => MILESTONES.map((m) => (m.id === "m-2" ? { ...m, ...change } : m))
/** Public launch shared with Partner site, whose two tasks join it, one of them done, and with a project the reader can't open. */
const SHARED = withLaunch({ progress: { total: 7, started: 2, done: 2 }, projects: [...MILESTONES[1].projects, { project_uuid: P2, project_name: "Partner site" }], hidden_projects: 1 })
/** Public launch taken off Partner site again: still in the project the reader can't open. */
const TAKEN_OFF = withLaunch({ hidden_projects: 1 })
/** A project as GET /project/overview lists it. */
const overviewRow = (uuid: string, name: string, isAdmin: number) => ({ project_uuid: uuid, project_name: name, is_admin: isAdmin, open: 5, done: 3, overdue: 0, due_soon: 1, first_day: at(-20), last_day: at(10) })
/** The projects the reader is in: this one, two more they run, and one they're only in. */
const PROJECTS = [overviewRow(P, "Q4 launch", 1), overviewRow(P2, "Partner site", 1), overviewRow(P4, "Docs site", 1), overviewRow(P3, "Hiring", 0)]
/** The server's words when a list is full (business/Milestone: MostPerProject, MostProjects). */
const FULL = "A project shows at most 50 milestones, and a milestone shows in at most 10 projects."

/**
 * The project's stubs. `milestones`, when given, answers the milestones' read
 * (an answer, or a function of the request); `more` adds or replaces answers.
 */
async function stubProject(page: Page, testInfo: TestInfo, milestones?: unknown, more: Answers = {}) {
  const state: { bulk?: unknown; moved?: unknown } = {}
  let current: (typeof MILESTONES)[number] | null = MILESTONES[1]
  await stubBackend(page, testInfo, {
    [`/project/${P}/milestones`]: milestones ?? { msg: "ok", data: { milestones: MILESTONES, can_manage: true } },
    [`/project/${P}/timeline`]: { msg: "ok", data: { tasks: TASKS, total: TASKS.length, can_edit: true, project_access: admin } },
    [`/project/taskList/${P}`]: { msg: "ok", data: { ...project, project_task_count: TASKS.length, project_tasks: [] }, pageCount: 1 },
    [`/project/taskListForKanban/${P}`]: {
      msg: "ok",
      data: { ...project, project_tasks_backlog: [], project_tasks_todo: TASKS.slice(1), project_tasks_in_progress: TASKS.slice(0, 1), project_tasks_in_review: [], project_tasks_done: [], project_tasks_canceled: [], project_tasks_done_count: 0, project_tasks_canceled_count: 0, project_column_counts: { backlog: 0, todo: 2, inProgress: 1, inReview: 0, done: 0, canceled: 0 } },
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
    [`/project/${P}/backlog`]: { msg: "ok", data: { backlog: { cycles: [], tasks: TASKS, count: TASKS.length, estimate_minutes: 0 }, schedule: null, can_edit: true, can_plan: true } },
    "/task/bulk": (_url: URL, request: Request) => {
      state.bulk = request.postDataJSON()
      return { msg: "ok", data: { refused: [] } }
    },
    // The panel's Milestone row: the task's milestone, and a pick puts it in another.
    "/task/milestone": (url: URL, request: Request) => {
      if (request.method() === "POST") {
        const body = request.postDataJSON() as { task_uuid: string; milestone_id: string }
        state.moved = body
        current = MILESTONES.find((m) => m.id === body.milestone_id) ?? null
      }
      return { msg: "ok", data: current && { id: current.id, project_uuid: P, name: current.name, description: "", target_date: current.target_date } }
    },
    "/task/info/": (url: URL) => {
      const t = TASKS.find((x) => url.pathname.endsWith(x.task_uuid)) ?? TASKS[0]
      return {
        msg: "ok",
        data: { ...t, task_project: { project_uuid: P, project_name: "Q4 launch" }, task_access: { view: true, edit: true }, task_description: "", task_sub_tasks: [], task_comments: [], task_activities: [], task_attachments: [], task_collaborators: [], task_blocked_by: [], task_blocks: [] },
      }
    },
    "/entities": { msg: "ok", data: [] },
    "/task/views": { msg: "ok", data: [] },
    "/user/dm-ai-targets": { msg: "ok", data: [] },
    "/notices": { msg: "ok", data: [] },
    ...TASK_PANEL_READS,
    ...more,
  })
  await page.addInitScript(() => localStorage.setItem("oc_keys_tip_seen", "1"))
  return state
}

async function stubOverview(page: Page, testInfo: TestInfo) {
  await stubBackend(page, testInfo, {
    "/project/overview": { msg: "ok", data: { projects: [overviewRow(P, "Q4 launch", 1)] } },
    "/project/milestones": { msg: "ok", data: { projects: { [P]: MILESTONES } } },
    "/goal/list": { msg: "ok", data: { goals: [] } },
    "/notices": { msg: "ok", data: [] },
  })
}

// The shared review shot: with SHOTS_DIR set, it fails naming any read a stub left unanswered.
const shot = reviewShot

for (const theme of ["light", "dark"] as const) {
  for (const phone of [false, true]) {
    test.describe(`milestones at ${phone ? 390 : 1280}, ${theme}`, () => {
      test.use(phone ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: theme } : { viewport: { width: 1280, height: 900 }, colorScheme: theme })

      test("the Updates section lists the milestones, the next one marked", async ({ page }, testInfo) => {
        await stubProject(page, testInfo)
        await page.goto(`/app/project/${P}?tab=updates`, { waitUntil: "domcontentloaded", timeout: 120_000 })
        const section = page.locator("[data-milestones]")
        await expect(section).toBeVisible({ timeout: 60_000 })
        await expect(section.locator("li[data-milestone]")).toHaveCount(3)
        await expect(section.locator('li[data-milestone="m-2"]')).toHaveAttribute("data-next", "true")
        await section.scrollIntoViewIfNeeded()
        await shot(page, "milestones-updates", theme)
      })

      test("Add opens New milestone over the section, which stays while the dialog's chunk is on its way", async ({ page }, testInfo) => {
        await stubProject(page, testInfo)
        await page.goto(`/app/project/${P}?tab=updates`, { waitUntil: "domcontentloaded", timeout: 120_000 })
        const section = page.locator("[data-milestones]")
        await expect(section.locator("li[data-milestone]")).toHaveCount(3, { timeout: 60_000 })
        // The dialog comes in a chunk of its own. Held, its first open must keep
        // the page: a chunk without a Suspense boundary of its own sends the
        // whole route back to its loading skeleton until the chunk lands.
        let release = () => {}
        const held = new Promise<void>((r) => (release = r))
        await page.route(/\/_next\/static\/chunks\//, async (route) => {
          await held
          await route.continue()
        })
        const add = section.getByRole("button", { name: "Add" })
        await (phone ? add.tap() : add.click())
        // Suspense hides what it holds back rather than unmounting it, so it's
        // the list's visibility that tells.
        await expect(section.locator("li[data-milestone]").first()).toBeVisible({ timeout: 2_000 })
        await expect(section.getByRole("heading", { name: "Milestones" })).toBeVisible({ timeout: 2_000 })
        release()
        await expect(page.getByRole("dialog", { name: "New milestone" })).toBeVisible({ timeout: 30_000 })
        await shot(page, "milestones-new-dialog", theme)
      })

      test("the Updates section's states: loading rows the list lands on, empty with Add, a failed read with Try again, which brings a member's view", async ({ page }, testInfo) => {
        let answer: "held" | "list" | "empty" | "none" | "failed" | "member" = "held"
        let letGo = () => {}
        const gate = new Promise<void>((r) => (letGo = r))
        await stubProject(page, testInfo, async () => {
          if (answer === "held") await gate
          if (answer === "failed") return withStatus(500, { msg: "The milestones couldn't be read" })
          if (answer === "member") return { msg: "ok", data: { milestones: MILESTONES.map((m) => ({ ...m, can_edit: false })), can_manage: false } }
          // None, as the live server answered it before V-51 (null), and as it answers it now ([]).
          if (answer === "empty") return { msg: "ok", data: { milestones: null, can_manage: true } }
          if (answer === "none") return { msg: "ok", data: { milestones: [], can_manage: true } }
          return { msg: "ok", data: { milestones: MILESTONES, can_manage: true } }
        })
        await page.goto(`/app/project/${P}?tab=updates`, { waitUntil: "domcontentloaded", timeout: 120_000 })
        const section = page.locator("[data-milestones]")
        // Loading: rows in a milestone row's own shape, under the heading.
        await expect(section.getByRole("status", { name: "Loading milestones" })).toBeVisible({ timeout: 60_000 })
        await section.scrollIntoViewIfNeeded()
        const heading = section.getByRole("heading", { name: "Milestones" })
        const top = async (l: ReturnType<Page["locator"]>) => (await l.boundingBox())!.y
        const stood = { heading: await top(heading), row: await top(section.locator("[data-milestone-loading]").first()) }
        await shot(page, "milestones-updates-loading", theme)
        // The list lands in their place: the heading where it was, the first row where the first loading row stood.
        answer = "list"
        letGo()
        const first = section.locator("li[data-milestone]").first()
        await expect(first).toBeVisible()
        expect(Math.abs((await top(heading)) - stood.heading)).toBeLessThanOrEqual(1)
        expect(Math.abs((await top(first)) - stood.row)).toBeLessThanOrEqual(1)
        // Empty, for an admin: what milestones are for, and Add.
        answer = "empty"
        await page.reload({ waitUntil: "domcontentloaded" })
        await expect(section.locator("[data-milestones-empty]")).toContainText("Add the stages this project's work goes through", { timeout: 60_000 })
        await expect(section.getByRole("button", { name: "Add" })).toBeEnabled()
        await shot(page, "milestones-updates-empty", theme)
        answer = "none"
        await page.reload({ waitUntil: "domcontentloaded" })
        await expect(section.locator("[data-milestones-empty]")).toContainText("Add the stages this project's work goes through", { timeout: 60_000 })
        await expect(section.getByRole("button", { name: "Add" })).toBeEnabled()
        // A failed read says so, with Try again.
        answer = "failed"
        await page.reload({ waitUntil: "domcontentloaded" })
        const retry = section.getByRole("button", { name: /Try again/ })
        await expect(retry).toBeVisible({ timeout: 60_000 })
        await section.scrollIntoViewIfNeeded()
        await shot(page, "milestones-updates-failed", theme)
        // Try again brings the milestones, as a member reads them: nothing to add, move or change.
        answer = "member"
        await (phone ? retry.tap() : retry.click())
        await expect(section.locator("li[data-milestone]")).toHaveCount(3)
        await expect(section.locator("li[data-milestone]").first()).toBeVisible()
        await expect(section.getByRole("button", { name: "Add" })).toHaveCount(0)
        await expect(section.getByRole("button", { name: / options$/ })).toHaveCount(0)
        await shot(page, "milestones-updates-member", theme)
      })

      const press = (l: Locator) => (phone ? l.tap() : l.click())
      const launch = (page: Page) => page.locator('[data-milestones] li[data-milestone="m-2"]')
      /** Public launch's options, then Share with a project: its dialog. */
      async function openShare(page: Page, withMenuOpen?: () => Promise<void>) {
        await press(launch(page).getByRole("button", { name: "Public launch options" }))
        await withMenuOpen?.()
        await press(page.getByRole("menuitem", { name: "Share with a project" }))
        return page.getByRole("dialog", { name: "Share Public launch" })
      }

      test("a milestone's options share it with another project its admin runs: the choices load in their own place, a failed read has Try again, a refused share keeps the pick; shared, its row names the project and counts its tasks", async ({ page }, testInfo) => {
        test.setTimeout(180_000)
        let projects: "held" | "failed" | "list" = "held"
        let letGo = () => {}
        const gate = new Promise<void>((r) => (letGo = r))
        // The share's answers in turn: the list is full, a fault, then shared.
        const answers = [withStatus(400, { msg: FULL }), withStatus(500, { msg: "Something went wrong." }), { msg: "ok", data: null }]
        const shares: unknown[] = []
        await stubProject(page, testInfo, () => ({ msg: "ok", data: { milestones: shares.length === answers.length ? SHARED : MILESTONES, can_manage: true } }), {
          [`/project/${P}/milestones/m-2/share`]: (_url: URL, request: Request) => {
            shares.push(request.postDataJSON())
            return answers[shares.length - 1]
          },
          "/project/overview": async () => {
            if (projects === "held") await gate
            if (projects === "failed") return withStatus(500, { msg: "Your projects couldn't be read" })
            return { msg: "ok", data: { projects: PROJECTS } }
          },
        })
        await page.goto(`/app/project/${P}?tab=updates`, { waitUntil: "domcontentloaded", timeout: 120_000 })
        const row = launch(page)
        await expect(row.locator("[data-milestone-progress]")).toHaveText("1 of 5 done · 2 started", { timeout: 60_000 })
        await expect(row.locator("[data-milestone-shared]")).toHaveCount(0)
        // Its options: what its home project's admin may do with it.
        const dialog = await openShare(page, async () => {
          await expect(page.getByRole("menuitem")).toHaveText(["Edit", "Share with a project", "Move up", "Move down", "Delete"])
          await shot(page, "milestones-options", theme)
        })
        // Loading: the label, and rows in the choices' shape.
        await expect(dialog.getByRole("status", { name: "Loading your projects" })).toBeVisible({ timeout: 30_000 })
        const label = dialog.getByText("Share with", { exact: true })
        const top = async (l: Locator) => (await l.boundingBox())!.y
        // Measured where the dialog rests, after its entrance.
        await untilStill(page)
        const stood = { label: await top(label), row: await top(dialog.locator("[data-share-loading]").first()) }
        await shot(page, "milestones-share-loading", theme)
        // A failed read says so, with Try again.
        projects = "failed"
        letGo()
        const retry = dialog.getByRole("button", { name: /Try again/ })
        await expect(retry).toBeVisible()
        await shot(page, "milestones-share-failed", theme)
        // Try again lists the other projects they run, not its home nor one they're only in, where the loading rows stood.
        projects = "list"
        await press(retry)
        const partner = dialog.getByRole("radio", { name: "Partner site" })
        await expect(partner).toBeVisible()
        await expect(dialog.getByRole("radio")).toHaveCount(2)
        await untilStill(page)
        expect(Math.abs((await top(label)) - stood.label)).toBeLessThanOrEqual(1)
        expect(Math.abs((await top(dialog.locator("label").first())) - stood.row)).toBeLessThanOrEqual(1)
        const share = dialog.getByRole("button", { name: "Share", exact: true })
        await expect(share).toBeDisabled()
        await shot(page, "milestones-share-choices", theme)
        // Refused: the server's words when a list is full, then a fault in the dialog's own; the pick stays.
        await press(partner)
        await press(share)
        const alert = dialog.getByRole("alert")
        await expect(alert).toHaveText(FULL)
        await expect(partner).toBeChecked()
        await shot(page, "milestones-share-refused", theme)
        await press(share)
        await expect(alert).toHaveText("It couldn't be shared. Try again.")
        await expect(partner).toBeChecked()
        // Shared: where it is, each to take off again, and a project they can't open.
        await press(share)
        await expect.poll(() => shares).toEqual([{ project_uuid: P2 }, { project_uuid: P2 }, { project_uuid: P2 }])
        await expect(dialog.getByRole("button", { name: "Take off" })).toBeVisible()
        await expect(dialog.getByText("Partner site", { exact: true })).toBeVisible()
        await expect(dialog.getByText("And 1 project you can't open.")).toBeVisible()
        await expect(dialog.getByRole("radio")).toHaveCount(1)
        await expect(alert).toHaveCount(0)
        await shot(page, "milestones-share-shared", theme)
        await press(dialog.getByRole("button", { name: "Done" }))
        await expect(dialog).toBeHidden()
        // Its row names where else it is, and its progress counts that project's tasks.
        await expect(row.locator("[data-milestone-shared]")).toHaveText("Also in Partner site and 1 project you can't open")
        await expect(row.locator("[data-milestone-progress]")).toHaveText("2 of 7 done · 2 started")
        await shot(page, "milestones-shared-row", theme)
      })

      test("taking it off another project asks first, naming it; then that project is a choice again, and the row no longer names it", async ({ page }, testInfo) => {
        test.setTimeout(180_000)
        const takes: unknown[] = []
        await stubProject(page, testInfo, () => ({ msg: "ok", data: { milestones: takes.length ? TAKEN_OFF : SHARED, can_manage: true } }), {
          [`/project/${P}/milestones/m-2/unshare`]: (_url: URL, request: Request) => {
            takes.push(request.postDataJSON())
            return { msg: "ok", data: null }
          },
          "/project/overview": { msg: "ok", data: { projects: PROJECTS } },
        })
        await page.goto(`/app/project/${P}?tab=updates`, { waitUntil: "domcontentloaded", timeout: 120_000 })
        const row = launch(page)
        await expect(row.locator("[data-milestone-shared]")).toHaveText("Also in Partner site and 1 project you can't open", { timeout: 60_000 })
        const dialog = await openShare(page)
        await press(dialog.getByRole("button", { name: "Take off" }))
        const confirm = page.getByRole("alertdialog", { name: "Take Public launch off Partner site?" })
        await expect(confirm).toContainText("Its tasks in Partner site leave it; Q4 launch keeps it.")
        expect(takes).toEqual([])
        await shot(page, "milestones-take-off-confirm", theme)
        await press(confirm.getByRole("button", { name: "Take off" }))
        await expect.poll(() => takes).toEqual([{ project_uuid: P2 }])
        await expect(confirm).toBeHidden()
        await expect(dialog.getByRole("radio", { name: "Partner site" })).toBeVisible()
        await expect(dialog.getByText("And 1 project you can't open.")).toBeVisible()
        await press(dialog.getByRole("button", { name: "Done" }))
        await expect(row.locator("[data-milestone-shared]")).toHaveText("Also in 1 project you can't open")
        await expect(row.locator("[data-milestone-progress]")).toHaveText("1 of 5 done · 2 started")
      })

      test("with no other project its admin runs, the dialog says so, and Done is all that's left", async ({ page }, testInfo) => {
        await stubProject(page, testInfo, undefined, {
          "/project/overview": { msg: "ok", data: { projects: [overviewRow(P, "Q4 launch", 1), overviewRow(P3, "Hiring", 0)] } },
        })
        await page.goto(`/app/project/${P}?tab=updates`, { waitUntil: "domcontentloaded", timeout: 120_000 })
        await expect(launch(page)).toBeVisible({ timeout: 60_000 })
        const dialog = await openShare(page)
        await expect(dialog.getByText("There's no other project you run to share it with.")).toBeVisible({ timeout: 30_000 })
        await expect(dialog.getByRole("button", { name: "Share", exact: true })).toHaveCount(0)
        await expect(dialog.getByRole("button", { name: "Done" })).toBeVisible()
        await shot(page, "milestones-share-empty", theme)
      })

      test("the timeline's milestones, when their read fails, keep the block's heading with Try again", async ({ page }, testInfo) => {
        let fail = true
        await stubProject(page, testInfo, () => (fail ? withStatus(500, { msg: "The milestones couldn't be read" }) : { msg: "ok", data: { milestones: MILESTONES, can_manage: true } }))
        await page.goto(`/app/project/${P}?tab=timeline`, { waitUntil: "domcontentloaded", timeout: 120_000 })
        const block = page.locator("[data-timeline-milestones]")
        const retry = block.getByRole("button", { name: /Try again/ })
        await expect(retry).toBeVisible({ timeout: 60_000 })
        // The tasks still draw below the block.
        await expect(page.getByRole("button", { name: "Write the launch announcement" }).first()).toBeVisible()
        await shot(page, "milestones-timeline-failed", theme)
        fail = false
        await (phone ? retry.tap() : retry.click())
        await expect(block.getByRole("listitem")).toHaveCount(3)
      })

      test("the timeline draws the milestones above the tasks: a diamond on each target day, a bar over its tasks' days", async ({ page }, testInfo) => {
        await stubProject(page, testInfo)
        await page.goto(`/app/project/${P}?tab=timeline`, { waitUntil: "domcontentloaded", timeout: 120_000 })
        const block = page.locator("[data-timeline-milestones]")
        await expect(block).toBeVisible({ timeout: 60_000 })
        await expect(block.getByRole("listitem")).toHaveCount(3)
        const next = block.locator('[data-milestone="m-2"]')
        await expect(next.locator("[data-milestone-bar]")).toHaveCount(1)
        await expect(next.locator('[data-milestone-target] [data-milestone-mark="next"]')).toHaveCount(1)
        await expect(block.locator('[data-milestone="m-1"] [data-milestone-target] [data-milestone-mark="finished"]')).toHaveCount(1)
        // No tasks yet: a diamond and no bar.
        await expect(block.locator('[data-milestone="m-3"] [data-milestone-bar]')).toHaveCount(0)
        // The diamond sits on its bar's row, and the tasks start below the block.
        const first = page.getByRole("button", { name: "Write the launch announcement" }).first()
        await expect(first).toBeVisible()
        const blockBox = await block.boundingBox()
        const firstBox = await first.boundingBox()
        expect(firstBox!.y).toBeGreaterThanOrEqual(blockBox!.y + blockBox!.height - 1)
        await shot(page, "milestones-timeline", theme)
      })

      test("the overview names the project's next milestone, and its timeline shows their days", async ({ page }, testInfo) => {
        await stubOverview(page, testInfo)
        await page.goto("/app/project", { waitUntil: "domcontentloaded", timeout: 120_000 })
        const row = page.locator("[data-project-row]").first()
        await expect(row).toBeVisible({ timeout: 60_000 })
        const next = row.locator("[data-next-milestone]")
        await expect(next).toContainText("Public launch")
        await expect(next).toHaveAttribute("title", /^Next milestone: Public launch, /)
        await shot(page, "milestones-overview", theme)
        await page.goto("/app/project?view=timeline", { waitUntil: "domcontentloaded", timeout: 120_000 })
        const marks = page.locator("[data-milestone-target]")
        await expect(marks).toHaveCount(3, { timeout: 60_000 })
        await expect(page.locator('[data-milestone-target="m-2"] [data-milestone-mark="next"]')).toHaveCount(1)
        await shot(page, "milestones-overview-timeline", theme)
      })

      if (phone)
        test("the task's Milestone row, in More fields, picks from a sheet: No milestone first, as in the bulk picker, and a pick moves the task", async ({ page }, testInfo) => {
          test.setTimeout(180_000)
          const state = await stubProject(page, testInfo)
          await page.goto(`/app/task/${id(2)}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
          const more = page.getByRole("button", { name: /More fields/ })
          await expect(more).toBeVisible({ timeout: 60_000 })
          await more.tap()
          const box = page.locator('[data-property="milestone"]').getByRole("combobox", { name: "Milestone" })
          await expect(box).toHaveText(/Public launch/)
          await box.tap()
          await expect(page.getByRole("option").first()).toHaveText("No milestone")
          const pick = page.getByRole("option", { name: /Partner rollout/ })
          await expect(pick).toBeVisible()
          await shot(page, "milestones-panel-row", theme)
          await pick.tap()
          await expect.poll(() => state.moved).toEqual({ task_uuid: id(2), milestone_id: "m-3" })
          await expect(box).toHaveText(/Partner rollout/)
        })

      if (phone) return

      test("Shift+M puts the backlog's selection in a milestone, and the panel's Milestone row moves one task", async ({ page }, testInfo) => {
        test.setTimeout(180_000)
        const state = await stubProject(page, testInfo)
        await page.goto(`/app/project/${P}?tab=backlog`, { waitUntil: "domcontentloaded", timeout: 120_000 })
        await expect(page.locator("[data-backlog]")).toBeVisible({ timeout: 60_000 })
        await page.locator(`[data-task-id="${id(0)}"]`).focus()
        await page.keyboard.press("x")
        await page.keyboard.press("j")
        await page.keyboard.press("x")
        await expect(page.getByRole("toolbar", { name: "2 tasks selected" })).toBeVisible()
        await page.keyboard.press("Shift+M")
        const pick = page.getByRole("option", { name: /Public launch/ })
        await expect(pick).toBeVisible()
        // None first, as the panel's Milestone row offers it.
        await expect(page.getByRole("option").first()).toHaveText("No milestone")
        await shot(page, "milestones-shift-m", theme)
        await pick.click()
        await expect.poll(() => state.bulk).toEqual({ task_uuids: [id(0), id(1)], op: "milestone", value: "m-2" })

        // One task's own row, in the panel's More fields.
        await page.keyboard.press("Escape")
        await page.locator(`[data-task-id="${id(2)}"]`).focus()
        await page.keyboard.press("Enter")
        await page.getByRole("button", { name: /More fields/ }).click()
        const field = page.locator('[data-property="milestone"]')
        const box = field.getByRole("combobox", { name: "Milestone" })
        await expect(box).toHaveText(/Public launch/)
        await box.click()
        await expect(page.getByRole("option").first()).toHaveText("No milestone")
        await expect(page.getByRole("option", { name: /Partner rollout/ })).toBeVisible()
        await shot(page, "milestones-panel-row", theme)
        await page.getByRole("option", { name: /Partner rollout/ }).click()
        await expect.poll(() => state.moved).toEqual({ task_uuid: id(2), milestone_id: "m-3" })
        await expect(box).toHaveText(/Partner rollout/)
      })
    })
  }
}
