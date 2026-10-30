import { expect, test, type Page, type Route, type TestInfo } from "@playwright/test"

import { SAM, SHOT_THEMES, reviewShot, stubBackend, withStatus } from "./stubbedApp"

// linear-20: when a project's open work lands, from the pace its tasks got done at and from what that work waits
// on, as the header's chip beside its health, with a card that says how (a sheet on a phone). Linear's project graph
// forecasts from velocity alone; here a late task on the critical path moves the date, and the card names it.

const P = "9e0a0000-0000-4000-8000-0000000000f0"
const NOW = new Date("2026-10-29T10:00:00Z")
const admin = { role: "admin", view: true, comment: true, create_tasks: true, edit_tasks: "all", delete_tasks: "all", log_time: true, post_updates: true, add_files: true, manage: true, manage_people: true, archive: true }
const project = { project_uuid: P, project_name: "Q4 launch", project_is_admin: 1, project_is_member: 1, project_members: [SAM], project_access: admin }

const NONE = "0001-01-01T00:00:00Z"
/** The project's open work, which the forecast counts: twelve points in four tasks (DESIGN-BUILD's OWED). */
const OPEN = [
  { id: "7a5c0000-0000-4000-8000-0000000000a1", name: "Write the launch announcement", status: "todo", points: 5 },
  { id: "7a5c0000-0000-4000-8000-0000000000a2", name: "Record the product walkthrough", status: "todo", points: 3 },
  { id: "7a5c0000-0000-4000-8000-0000000000a3", name: "Review the pricing page copy", status: "inProgress", points: 3 },
  { id: "7a5c0000-0000-4000-8000-0000000000a4", name: "Set up the launch webinar", status: "inProgress", points: 1 },
].map((t) => ({
  task_uuid: t.id,
  task_name: t.name,
  task_status: t.status,
  task_priority: "medium",
  task_label: "",
  task_due_date: "",
  task_start_date: "",
  task_created_at: "2026-10-12T09:00:00Z",
  task_status_since: "2026-10-20T09:00:00Z",
  task_deleted_at: NONE,
  task_sub_task_count: 0,
  task_comment_count: 0,
  task_assignee: SAM,
  task_estimate_points: t.points,
  task_access: { view: true, comment: true, edit: true, delete: true },
}))
const inColumn = (status: string) => OPEN.filter((t) => t.task_status === status)

/** How big the project is: its open and finished tasks, as its header's line and its list count them. */
interface Size {
  open: number
  done: number
}
/** The four open tasks above, and no finished ones. */
const FOUR: Size = { open: OPEN.length, done: 0 }
/** The nth of a project's open tasks as its list pages them: the four above, then numbered ones like them. */
const openTask = (n: number) =>
  n < OPEN.length
    ? OPEN[n]
    : { ...OPEN[n % OPEN.length], task_uuid: `7a5c0000-0000-4000-8001-${String(n + 1).padStart(12, "0")}`, task_name: `Launch task ${n + 1}` }

const PACE = {
  project_uuid: P,
  state: "forecast",
  date: "2026-11-18",
  optimistic: "2026-11-12",
  pessimistic: "2026-11-27",
  by_pace: "2026-11-18",
  by_links: "2026-11-02",
  open: 12,
  unit: "points",
  per_week: 4.5,
  weeks: 4,
  held_by: [],
  held_count: 0,
}
const HELD = {
  ...PACE,
  date: "2026-11-25",
  by_links: "2026-11-25",
  held_by: [
    { task_uuid: "7a5c0000-0000-4000-8000-0000000000d1", task_name: "Design review", external: false, days_late: 3 },
    { task_uuid: "7a5c0000-0000-4000-8000-0000000000d2", task_name: "Legal sign-off", external: true, project_name: "Marketing", days_late: 1 },
    { task_uuid: "7a5c0000-0000-4000-8000-0000000000d3", task_name: "Brand check", external: false, days_late: 1 },
  ],
  // Four hold it up: the first three are named, and the card says there's more.
  held_count: 4,
}
// A very large project's: the server counted only some of its open tasks, and the card says so in one sentence.
const OPEN_CUT = { ...PACE, open: 10000, unit: "tasks", per_week: 150, open_cut: { total: 10000, counted: 1000 } }

/** The card's every shape, each with its own words and so its own room (DB-37): its chip's name and its pace. */
const SHAPES = [
  { shape: "the plain card", data: PACE, chip: "Lands ~18 Nov. How it's forecast", pace: "4.5 points a week over the last 4 weeks, 12 points open" },
  {
    shape: "a held-up card",
    data: HELD,
    chip: "Lands ~25 Nov, held up. How it's forecast",
    pace: "4.5 points a week over the last 4 weeks, 12 points open",
    shot: "forecast-held-card-loading",
  },
  {
    shape: "a very large project's card",
    data: OPEN_CUT,
    chip: "Lands ~18 Nov. How it's forecast",
    pace: "150 tasks a week over the last 4 weeks, 10,000 tasks open",
    shot: "forecast-opencut-loading",
  },
]

/** The forecast's answer as the test sets it, and the reads it got. */
interface Forecast {
  answer: unknown
  reads: number
  /** The zone the last read asked in. */
  tz?: string | null
  /** Held until released: the chip's loading state. */
  hold?: Promise<void>
}

async function openProject(page: Page, testInfo: TestInfo, f: Forecast, theme: string, size: Size = FOUR) {
  await page.clock.setFixedTime(NOW)
  await page.addInitScript((t) => {
    localStorage.setItem("ui-theme", t)
    localStorage.setItem("oc_keys_tip_seen", "1")
  }, theme)
  await stubBackend(page, testInfo, {
    // The list, a page at a time by pageIndex and pageSize, as the server pages it.
    [`/project/taskList/${P}`]: (url: URL) => {
      const pageSize = Number(url.searchParams.get("pageSize") || 10)
      const from = Number(url.searchParams.get("pageIndex") || 0) * pageSize
      const tasks = Array.from({ length: Math.max(0, Math.min(pageSize, size.open - from)) }, (_, i) => ({ ...openTask(from + i), task_project: project }))
      return { msg: "ok", data: { ...project, project_task_count: size.open, project_tasks: tasks }, pageCount: Math.max(1, Math.ceil(size.open / pageSize)) }
    },
    [`/project/taskListForKanban/${P}`]: {
      msg: "ok",
      data: {
        ...project,
        project_tasks_backlog: [],
        project_tasks_todo: inColumn("todo"),
        project_tasks_in_progress: inColumn("inProgress"),
        project_tasks_in_review: [],
        project_tasks_done: [],
        project_tasks_canceled: [],
        project_tasks_done_count: size.done,
        project_tasks_canceled_count: 0,
        // The header's line counts the columns: the open tasks half in each open column, as the four are.
        project_column_counts: { backlog: 0, todo: Math.ceil(size.open / 2), inProgress: Math.floor(size.open / 2), inReview: 0, done: size.done, canceled: 0 },
      },
    },
    // A board that holds a part of the project reads its dates' counts, exact (PR1): none of these tasks is dated.
    [`/project/${P}/glance`]: { msg: "ok", data: { open: size.open, done: size.done, overdue: 0, due_this_week: 0 } },
    [`/project/info/${P}`]: { msg: "ok", data: project },
    [`/project/membersInfo/${P}`]: { msg: "ok", data: project },
    [`/project/${P}/updates`]: { msg: "ok", data: { updates: [], can_post: true } },
    [`/project/${P}/cycles`]: { msg: "ok", data: { cycles: [], can_edit: true } },
    [`/project/${P}/goals`]: { msg: "ok", data: { goals: [] } },
    [`/project/${P}/statuses`]: { msg: "ok", data: null },
    [`/project/${P}/fields`]: { msg: "ok", data: { fields: [], can_edit: true } },
    [`/project/${P}/tags`]: { msg: "ok", data: [] },
    [`/project/${P}/types`]: { msg: "ok", data: [], icons: [] },
    "/task/views": { msg: "ok", data: [] },
    "/entities": { msg: "ok", data: [] },
    "/user/dm-ai-targets": { msg: "ok", data: [] },
    "/notices": { msg: "ok", data: [] },
    [`/project/${P}/forecast`]: (url: URL) => {
      f.reads++
      f.tz = url.searchParams.get("tz")
      return f.answer
    },
  })
  if (f.hold) {
    const held = f.hold
    await page.route(`**/project/${P}/forecast**`, async (route: Route) => {
      await held
      await route.fallback()
    })
  }
  await page.goto(`/app/project/${P}?tab=list`, { waitUntil: "domcontentloaded", timeout: 120_000 })
}

for (const theme of SHOT_THEMES) {
  for (const [where, use] of [
    ["on a phone", { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: theme }],
    ["on a laptop", { viewport: { width: 1280, height: 860 }, colorScheme: theme }],
  ] as const) {
    test.describe(`a project's forecast ${where}, ${theme}`, () => {
      test.use(use)
      const phone = use.viewport.width < 500
      // The phone has its own row of chips; a computer has the line under the name.
      const line = (page: Page) => page.locator(phone ? "[data-project-chips]" : "[data-project-line]")
      const press = (page: Page, name: string | RegExp, role: "button" | "link" = "button") =>
        phone ? page.getByRole(role, { name }).tap() : page.getByRole(role, { name }).click()

      test("says when the work lands at its pace, and its card says how", async ({ page }, testInfo) => {
        const f: Forecast = { answer: { msg: "ok", data: PACE }, reads: 0 }
        await openProject(page, testInfo, f, theme)
        const chip = line(page).locator("[data-forecast]")
        await expect(chip).toHaveText("Lands ~18 Nov", { timeout: 60_000 })
        await expect(chip).toHaveAttribute("data-forecast", "pace")
        // Asked in the reader's own zone.
        expect(f.tz).toBeTruthy()
        await reviewShot(page, "forecast-pace", theme)
        await press(page, "Lands ~18 Nov. How it's forecast")
        const card = page.locator("[data-forecast-card]")
        await expect(card).toContainText("12 Nov – 27 Nov")
        await expect(card).toContainText("4.5 points a week over the last 4 weeks, 12 points open")
        await expect(card).not.toContainText("Held up by")
        await reviewShot(page, "forecast-card", theme)
      })

      test("a very large project's card is the plain card: every task counted, and nothing said of its size", async ({ page }, testInfo) => {
        const f: Forecast = { answer: { msg: "ok", data: { ...PACE, open: 6200, per_week: 150 } }, reads: 0 }
        // Its finished work is over the plan read's limit and its open work isn't: 800 open tasks, 6,200 points.
        await openProject(page, testInfo, f, theme, { open: 800, done: 5_100 })
        await expect(line(page).locator("[data-forecast]")).toHaveText("Lands ~18 Nov", { timeout: 60_000 })
        // The header's own count of open tasks, on a laptop's line and a phone's (only a laptop's is a button to press).
        await expect(page.locator("[data-glance]:visible").first()).toContainText("800 open")
        await press(page, "Lands ~18 Nov. How it's forecast")
        await expect(page.locator("[data-forecast-card]")).toContainText("150 points a week over the last 4 weeks, 6,200 points open")
        await expect(page.locator("[data-forecast-cut]")).toHaveCount(0)
        await expect(page.locator("[data-forecast-card]")).toBeInViewport({ ratio: 1 })
        await reviewShot(page, "forecast-cut", theme)
      })

      test("says in one sentence how many open tasks the date follows, when the server counted some of them", async ({ page }, testInfo) => {
        const f: Forecast = { answer: { msg: "ok", data: OPEN_CUT }, reads: 0 }
        // As many open tasks as the answer says, and finished ones as the server's 10k fixture has.
        await openProject(page, testInfo, f, theme, { open: 10_000, done: 5_100 })
        await expect(line(page).locator("[data-forecast]")).toHaveText("Lands ~18 Nov", { timeout: 60_000 })
        // The header counts the leg's own open tasks, as the sentence does (DB-35's M2).
        // The header's own count of open tasks, on a laptop's line and a phone's (only a laptop's is a button to press).
        await expect(page.locator("[data-glance]:visible").first()).toContainText("10,000 open")
        await press(page, "Lands ~18 Nov. How it's forecast")
        await expect(page.locator("[data-forecast-cut]")).toHaveText(
          "This project has 10,000 open tasks, so the date follows what 1,000 of them wait on, the soonest due first; its pace and open work count them all.",
        )
        await expect(page.locator("[data-forecast-card]")).toBeInViewport({ ratio: 1 })
        await reviewShot(page, "forecast-opencut", theme)
      })

      // V-49 (main 29 Oct 18:10): the card is a chunk of its own, fetched on the chip's first press. Held, its slot
      // keeps the card's room; refused, the card says so with Try again; let through, the card comes.
      test("fetches the card's code on the first press: its slot holds the room, and a failure says so with Try again", async ({ page }, testInfo) => {
        const f: Forecast = { answer: { msg: "ok", data: PACE }, reads: 0 }
        await openProject(page, testInfo, f, theme)
        await expect(line(page).locator("[data-forecast]")).toHaveText("Lands ~18 Nov", { timeout: 60_000 })
        // From here the page's code waits until it is let through, or refused.
        let letThrough: (ok: boolean) => void = () => {}
        const decided = new Promise<boolean>((r) => (letThrough = r))
        const code = /\/_next\/static\/.*\.js(\?|$)/
        await page.route(code, async (route: Route) => ((await decided) ? route.fallback() : route.abort()))
        await press(page, "Lands ~18 Nov. How it's forecast")
        const card = page.locator("[data-forecast-card]")
        await expect(card).toBeVisible()
        await expect(card).not.toContainText("points a week")
        await reviewShot(page, "forecast-card-loading", theme)
        letThrough(false)
        const again = card.getByRole("button", { name: /Couldn't load how it's forecast/ })
        await expect(again).toBeVisible({ timeout: 15_000 })
        await reviewShot(page, "forecast-card-failed", theme)
        await page.unroute(code)
        await (phone ? again.tap() : again.click())
        await expect(card).toContainText("4.5 points a week over the last 4 weeks, 12 points open", { timeout: 30_000 })
      })

      // DB-36 (29 Oct): the slot holds the card's room, line for line, so the phone's sheet and the laptop's popover
      // open once. The sheet stands on the screen's foot, so a card taller than its slot pushed its top up (96 -> 178
      // px), and the popover grew under the chip (88 -> 185 px): both read as opening twice. DB-37: for every shape of
      // the card, held up (its line, the late work it names, "and more") and a very large project's (its sentence).
      for (const { shape, data, chip, pace, shot } of SHAPES) {
        test(`its card's slot holds ${shape}'s room, so the sheet or the popover opens once`, async ({ page }, testInfo) => {
          const f: Forecast = { answer: { msg: "ok", data }, reads: 0 }
          await openProject(page, testInfo, f, theme)
          await expect(line(page).locator("[data-forecast]")).toHaveAttribute("aria-label", chip, { timeout: 60_000 })
          // The card's code waits until it's let through.
          let letThrough: () => void = () => {}
          const held = new Promise<void>((r) => (letThrough = r))
          const code = /\/_next\/static\/.*\.js(\?|$)/
          await page.route(code, async (route: Route) => {
            await held
            await route.fallback()
          })
          await press(page, chip)
          const card = page.locator("[data-forecast-card]")
          await expect(card).toBeVisible()
          await expect(card).not.toContainText(pace)
          // Read once its opening has run (the shimmer's endless loop isn't the opening).
          const box = async () => {
            await card.evaluate((el) =>
              Promise.all(
                el
                  .getAnimations()
                  .filter((a) => a.effect?.getComputedTiming().endTime !== Infinity)
                  .map((a) => a.finished.catch(() => undefined)),
              ),
            )
            const b = await card.boundingBox()
            if (!b) throw new Error("the card has no box")
            return b
          }
          const slot = await box()
          if (shot) await reviewShot(page, shot, theme)
          letThrough()
          await expect(card).toContainText(pace, { timeout: 30_000 })
          const drawn = await box()
          await page.unroute(code)
          expect(Math.abs(drawn.y - slot.y), `its top: ${slot.y} with the slot, ${drawn.y} with the card`).toBeLessThanOrEqual(2)
          expect(Math.abs(drawn.height - slot.height), `its height: ${slot.height} with the slot, ${drawn.height} with the card`).toBeLessThanOrEqual(2)
        })
      }

      test("carries the at-risk dot when late work it waits on moves the date, and the card names that work", async ({ page }, testInfo) => {
        const f: Forecast = { answer: { msg: "ok", data: HELD }, reads: 0 }
        await openProject(page, testInfo, f, theme)
        const chip = line(page).locator("[data-forecast]")
        // Held up, said in words as well as by the dot.
        await expect(chip).toHaveText(/^Lands ~25 Nov\s*· held up$/, { timeout: 60_000 })
        await expect(chip).toHaveAttribute("data-forecast", "held")
        await reviewShot(page, "forecast-held", theme)
        await press(page, "Lands ~25 Nov, held up. How it's forecast")
        const card = page.locator("[data-forecast-card]")
        await expect(card).toContainText("Late work it waits on moves it past the pace.")
        await expect(card.getByRole("link", { name: "Design review, 3 days late" })).toHaveAttribute("href", `/app/task/${HELD.held_by[0].task_uuid}`)
        await expect(card.getByRole("link", { name: "Legal sign-off in Marketing, 1 day late" })).toHaveAttribute("href", `/app/task/${HELD.held_by[1].task_uuid}`)
        await expect(card).toContainText("and more late work")
        await reviewShot(page, "forecast-held-card", theme)
      })

      test("holds its place while it's read, so the line doesn't move when it comes", async ({ page }, testInfo) => {
        let release = () => {}
        const f: Forecast = { answer: { msg: "ok", data: PACE }, reads: 0, hold: new Promise<void>((r) => (release = r)) }
        await openProject(page, testInfo, f, theme)
        const loading = line(page).locator("[data-forecast='loading']")
        await expect(loading).toBeVisible({ timeout: 60_000 })
        const before = (await line(page).boundingBox())!
        await reviewShot(page, "forecast-loading", theme)
        release()
        await expect(line(page).locator("[data-forecast='pace']")).toHaveText("Lands ~18 Nov")
        const after = (await line(page).boundingBox())!
        expect(after.height).toBe(before.height)
      })

      test("says a failed read in its place, and Try again reads it again", async ({ page }, testInfo) => {
        const f: Forecast = { answer: withStatus(500, { msg: "Something went wrong" }), reads: 0 }
        await openProject(page, testInfo, f, theme)
        const retry = line(page).getByRole("button", { name: /Couldn't load the forecast\. Try again/ })
        await expect(retry).toBeVisible({ timeout: 60_000 })
        // Whole on the screen, Try again too: on a phone it takes a line of its own (DESIGN-BUILD's M1).
        await expect(retry).toBeInViewport({ ratio: 1 })
        // Said in its place, and no toast says it again.
        await expect(page.getByText("Something went wrong")).toHaveCount(0)
        await reviewShot(page, "forecast-error", theme)
        f.answer = { msg: "ok", data: PACE }
        await (phone ? retry.tap() : retry.click())
        await expect(line(page).locator("[data-forecast]")).toHaveText("Lands ~18 Nov")
      })

      test("says nothing for a project with open work and nothing to go on yet", async ({ page }, testInfo) => {
        const f: Forecast = { answer: { msg: "ok", data: { ...PACE, state: "starting", date: null, optimistic: null, pessimistic: null, by_pace: null, by_links: null, per_week: 0 } }, reads: 0 }
        await openProject(page, testInfo, f, theme)
        await expect.poll(() => f.reads, { timeout: 60_000 }).toBe(1)
        await expect(line(page).locator("[data-forecast]")).toHaveCount(0)
        await expect(line(page).getByRole("button", { name: /Couldn't load the forecast/ })).toHaveCount(0)
        await reviewShot(page, "forecast-none", theme)
      })
    })
  }
}
