import { expect, test, type Page, type Request, type TestInfo } from "@playwright/test"

import { SAM, reviewShot, stubBackend } from "./stubbedApp"

// Points on a task (linear-05). In a project that estimates on a scale, the
// task panel has a Points row. Its scale comes with the task (the "estimates"
// part of the task's answer), so the row paints with the panel, with no read
// of its own; a part that failed says so in the row, with Try again. Whoever
// may edit the task picks a size from the scale, and a reader sees the size.
// A cycle's burndown counts in points. With SHOTS_DIR set, each view is saved
// for review.

const P = "9e0a0000-0000-4000-8000-0000000000c5"
const T = "7a5c00c5-0000-4000-8000-000000000001"
const NONE = "0001-01-01T00:00:00Z"
const FIBONACCI = { kind: "fibonacci", extended: false, allow_zero: false, count_unestimated: true, sizes: [1, 2, 3, 5, 8], labels: ["1", "2", "3", "5", "8"] }
const project = { project_uuid: P, project_name: "Q4 launch", project_is_admin: 1, project_is_member: 1, project_members: [SAM] }
const day = 86_400_000
const at = (days: number) => new Date(Date.now() + days * day).toISOString()
const CYCLE = { id: "c-3", project_uuid: P, number: 3, name: "", starts_at: at(-5), ends_at: at(9), state: "current", progress: { total: 4, started: 1, done: 1 } }

const task = (edit: boolean) => ({
  task_uuid: T,
  task_name: "Write the launch announcement",
  task_status: "todo",
  task_priority: "medium",
  task_label: "",
  task_due_date: "",
  task_start_date: "",
  task_created_at: "2026-10-20T09:00:00Z",
  task_status_since: "2026-10-20T09:00:00Z",
  task_deleted_at: NONE,
  task_sub_task_count: 0,
  task_comment_count: 0,
  task_assignee: SAM,
  task_estimate_points: 3,
  task_access: { view: true, comment: true, edit, delete: edit },
  task_project: project,
})

/** Fourteen days of a cycle on a Fibonacci scale: 21 points in scope, 8 of them done by today. */
function burndown() {
  const days = Array.from({ length: 14 }, (_, i) => new Date(Date.now() + (i - 5) * day).toISOString().slice(0, 10))
  const ideal = (top: number) => days.map((_, i) => Math.round((top * (13 - i)) / 13))
  return {
    cycle: CYCLE,
    burndown: {
      days,
      scope: [4, 4, 4, 4, 4, 4],
      remaining: [4, 4, 4, 3, 3, 3],
      ideal: ideal(4),
      scope_points: [18, 18, 21, 21, 21, 21],
      remaining_points: [18, 18, 21, 16, 13, 13],
      ideal_points: ideal(21),
      tasks: 4,
      done: 1,
      open: 3,
      estimated: 0,
      hours: 0,
      pointed: 3,
      points: 21,
    },
    velocity: { cycles: [], typical_points: 19 },
  }
}

async function open(page: Page, testInfo: TestInfo, edit: boolean, path: string, part: "scale" | "failed" = "scale") {
  const posted: unknown[] = []
  const reads = { estimates: 0 }
  const estimates = { scale: FIBONACCI, kinds: [], can_edit: edit }
  await stubBackend(page, testInfo, {
    [`/task/info/${T}`]: {
      msg: "ok",
      data: { ...task(edit), task_description: "<p>What it needs.</p>", task_sub_tasks: [], task_comments: [], task_activities: [], task_attachments: [], task_collaborators: [] },
      // The project's parts come with the task, the scale among them; or that part's error in its place.
      included: { estimates: part === "scale" ? { data: estimates } : { error: "Couldn't load the estimates." } },
    },
    [`/project/taskList/${P}`]: { msg: "ok", data: { ...project, project_task_count: 1, project_tasks: [task(edit)] }, pageCount: 1 },
    // The project's page also reads its board's columns and its people's access (the burndown test opens it).
    [`/project/taskListForKanban/${P}`]: {
      msg: "ok",
      data: {
        ...project,
        project_tasks_backlog: [],
        project_tasks_todo: [task(edit)],
        project_tasks_in_progress: [],
        project_tasks_in_review: [],
        project_tasks_done: [],
        project_tasks_canceled: [],
        project_tasks_done_count: 0,
        project_tasks_canceled_count: 0,
        project_column_counts: { backlog: 0, todo: 1, inProgress: 0, inReview: 0, done: 0, canceled: 0 },
      },
    },
    "/entities": { msg: "ok", data: [{ kind: "project", id: P, access: edit ? "edit" : "view", data: { project_name: "Q4 launch" }, topic: `project/${P}` }] },
    [`/project/info/${P}`]: { msg: "ok", data: project },
    [`/project/membersInfo/${P}`]: { msg: "ok", data: project },
    [`/project/${P}/estimates`]: () => {
      reads.estimates++
      return { msg: "ok", data: estimates }
    },
    [`/project/${P}/cycles/c-3/burndown`]: { msg: "ok", data: burndown() },
    [`/project/${P}/cycles`]: { msg: "ok", data: { cycles: [CYCLE], can_edit: edit } },
    [`/project/${P}/updates`]: { msg: "ok", data: { updates: [], can_post: edit } },
    [`/project/${P}/goals`]: { msg: "ok", data: { goals: [] } },
    [`/project/${P}/statuses`]: { msg: "ok", data: null },
    [`/project/${P}/fields`]: { msg: "ok", data: { fields: [], can_edit: edit } },
    [`/project/${P}/tags`]: { msg: "ok", data: [] },
    [`/project/${P}/types`]: { msg: "ok", data: [], icons: [] },
    "/task/updateTaskPoints": (_url: URL, request: Request) => {
      posted.push(request.postDataJSON())
      return { msg: "ok", data: null }
    },
    "/task/views": { msg: "ok", data: [] },
    "/task/time/": { msg: "ok", data: null },
    "/task/recurrence/": { msg: "ok", data: null },
    "/task/cycle/": { msg: "ok", data: null },
    "/task/clientReview/": { msg: "ok", data: null },
    "/link/source/task/": { msg: "ok", data: { docs: [], boards: [] } },
    "/user/dm-ai-targets": { msg: "ok", data: [] },
    "/notices": { msg: "ok", data: [] },
  })
  await page.goto(path, { waitUntil: "domcontentloaded", timeout: 120_000 })
  return { posted, reads }
}

/** The task's own page, its Points row in view. */
async function openTask(page: Page, testInfo: TestInfo, edit: boolean, part: "scale" | "failed" = "scale") {
  const { posted, reads } = await open(page, testInfo, edit, `/app/task/${T}`, part)
  const row = page.locator('[data-property="points"]')
  await expect(row).toBeVisible({ timeout: 60_000 })
  await row.scrollIntoViewIfNeeded()
  return { row, posted, reads }
}

for (const theme of ["light", "dark"] as const) {
  for (const phone of [false, true]) {
    test.describe(`points on a task at ${phone ? 390 : 1280}, ${theme}`, () => {
      test.use(phone ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: theme } : { viewport: { width: 1280, height: 900 }, colorScheme: theme })

      test("whoever may edit the task picks a size from the project's scale", async ({ page }, testInfo) => {
        const { row, posted, reads } = await openTask(page, testInfo, true)
        // A menu like the Type row's: the size, a chevron, and a check on the size it has (a sheet on a phone).
        const pick = row.getByRole("button", { name: /^Points: .+\. Change them$/ })
        await expect(pick).toHaveText("3")
        await expect(pick).toHaveAccessibleName("Points: 3. Change them")
        await expect(row.locator("select, [role=combobox]")).toHaveCount(0)
        // The scale came with the task: the row asked for nothing of its own.
        expect(reads.estimates).toBe(0)
        await reviewShot(page, "points-row", theme)
        await (phone ? pick.tap() : pick.click())
        // The scale's sizes, and None.
        await expect(page.getByRole("menuitem")).toHaveText(["None", "1", "2", "3", "5", "8"])
        await expect(page.getByRole("menuitem", { name: "3", exact: true }).locator('[data-menu-check="on"]')).toHaveCount(1)
        await reviewShot(page, "points-picker", theme)
        const five = page.getByRole("menuitem", { name: "5", exact: true })
        await (phone ? five.tap() : five.click())
        await expect(pick).toHaveText("5")
        await expect(pick).toHaveAccessibleName("Points: 5. Change them")
        await expect.poll(() => posted).toEqual([{ task_uuid: T, task_estimate_points: 5 }])
      })

      test("a scale that couldn't come says so in the row, and Try again brings the picker", async ({ page }, testInfo) => {
        const { row, reads } = await openTask(page, testInfo, true, "failed")
        const retry = row.getByRole("button", { name: /Couldn't load the points\. Try again/ })
        await expect(retry).toBeVisible()
        // The whole line shows in the rail's narrow column, Try again with it: it wraps rather than cutting.
        const cut = await retry.evaluate((b) => {
          const box = b.getBoundingClientRect()
          const again = [...b.querySelectorAll("span")].find((s) => s.textContent === "Try again")!.getBoundingClientRect()
          const clipped = [b, ...b.querySelectorAll("span")].some((el) => el.scrollWidth > el.clientWidth + 1)
          return clipped || again.right > box.right + 0.5 || again.bottom > box.bottom + 0.5
        })
        expect(cut).toBe(false)
        await reviewShot(page, "points-row-failed", theme)
        await (phone ? retry.tap() : retry.click())
        await expect(row.getByRole("button", { name: "Points: 3. Change them" })).toHaveText("3")
        expect(reads.estimates).toBe(1)
      })

      test("a reader sees the task's size, with nothing to pick", async ({ page }, testInfo) => {
        const { row } = await openTask(page, testInfo, false)
        await expect(row).toContainText("3")
        await expect(row.getByRole("button")).toHaveCount(0)
        await reviewShot(page, "points-row-read", theme)
      })
    })
  }

  test.describe(`a cycle's burndown in points at 1280, ${theme}`, () => {
    test.use({ viewport: { width: 1280, height: 900 }, colorScheme: theme })

    test("counts the cycle in points, its project's unit", async ({ page }, testInfo) => {
      await open(page, testInfo, true, `/app/project/${P}?tab=list`)
      const cycles = page.getByRole("button", { name: /^Cycles(:|$)/ })
      await expect(cycles).toBeVisible({ timeout: 60_000 })
      await cycles.click()
      await page.getByRole("button", { name: "Cycle 3 burndown" }).first().click()
      const dialog = page.getByRole("dialog")
      await expect(dialog).toContainText("With points")
      await expect(dialog).toContainText("3 of 4")
      await expect(dialog.getByRole("group", { name: "Count in" }).getByRole("button", { name: "Points" })).toHaveAttribute("aria-pressed", "true")
      await reviewShot(page, "burndown-points", theme)
    })
  })
}
