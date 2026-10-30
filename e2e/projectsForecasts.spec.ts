import { expect, test, type Page, type TestInfo } from "@playwright/test"

import { SAM, SHOT_THEMES, reviewShot, stubBackend } from "./stubbedApp"

// linear-20, head 2: the projects overview and a goal's projects say when each project's open work lands, from ONE
// read of all their forecasts (GET /project/forecasts), never a read a row. A project the server leaves out (one the
// reader can't open, or with nothing to forecast) says nothing. Linear's project graph forecasts one project at a
// time, from velocity alone.

const NOW = new Date("2026-10-29T10:00:00Z")
const id = (n: number) => `9e0a0000-0000-4000-8000-${String(n).padStart(12, "0")}`
const NAMES = ["Billing revamp", "Q4 launch", "Mobile app", "Help centre", "Pricing page", "Partner portal", "SSO for pilots", "Onboarding emails", "Webinar series", "Importer", "Status page", "Brand refresh"]
// Q4 launch is the longest phone row: held up, late tasks and a next milestone with a long name.
const PROJECTS = NAMES.map((name, i) => ({ project_uuid: id(i + 1), project_name: name, is_admin: 1, open: 4 + i, done: 2, overdue: i === 1 ? 2 : 0, due_soon: 0 }))
/** Held up past their pace: Q4 launch, and Webinar series, the 9th row, below a phone's fold. */
const HELD = new Set([PROJECTS[1].project_uuid, PROJECTS[8].project_uuid])
const MILESTONE = {
  id: "5d1e0000-0000-4000-8000-000000000001",
  project_uuid: PROJECTS[1].project_uuid,
  name: "Payments and invoices beta for the pilot customers",
  description: "",
  target_date: "2026-11-12",
  progress: { total: 6, started: 2, done: 1 },
  home: true,
  projects: [{ project_uuid: PROJECTS[1].project_uuid, project_name: PROJECTS[1].project_name }],
  hidden_projects: 0,
  next: true,
  can_edit: true,
}
/** The one the server leaves out of the forecasts: nothing is said for it. */
const LEFT_OUT = PROJECTS[11]

const forecast = (projectId: string, date: string, held = false) => ({
  project_uuid: projectId,
  state: "forecast",
  date,
  optimistic: date,
  pessimistic: date,
  by_pace: held ? "2026-11-18" : date,
  by_links: held ? date : null,
  open: 12,
  unit: "points",
  per_week: 4.5,
  weeks: 4,
  held_by: held ? [{ task_uuid: "7a5c0000-0000-4000-8000-0000000000d1", task_name: "Design review", external: false, days_late: 3 }] : [],
  held_count: held ? 1 : 0,
  truncated: false,
})

/** The forecasts' reads, each with the ids it asked for. */
interface Reads {
  asked: string[][]
}

/** Every forecast the server gives: the second project held up past the pace, the last left out. */
function answer(url: URL, reads: Reads) {
  const ids = (url.searchParams.get("ids") ?? "").split(",").filter(Boolean)
  reads.asked.push(ids)
  const forecasts: Record<string, unknown> = {}
  for (const p of ids) {
    if (p === LEFT_OUT.project_uuid) continue
    forecasts[p] = HELD.has(p) ? forecast(p, "2026-11-25", true) : forecast(p, "2026-11-18")
  }
  return { msg: "ok", data: { forecasts } }
}

async function open(page: Page, testInfo: TestInfo, theme: string, path: string, reads: Reads, more: Record<string, unknown> = {}) {
  await page.clock.setFixedTime(NOW)
  await page.addInitScript((t) => {
    localStorage.setItem("ui-theme", t)
    localStorage.setItem("oc_keys_tip_seen", "1")
  }, theme)
  await stubBackend(page, testInfo, {
    "/project/overview": { msg: "ok", data: { projects: PROJECTS } },
    "/project/milestones": { msg: "ok", data: { projects: { [PROJECTS[1].project_uuid]: [MILESTONE] } } },
    "/project/forecasts": (url: URL) => answer(url, reads),
    "/notices": { msg: "ok", data: [] },
    "/goal/list": { msg: "ok", data: { goals: [] } },
    ...more,
  })
  await page.goto(path, { waitUntil: "domcontentloaded", timeout: 120_000 })
}

// The lines are a chunk of their own (components/project/LazyForecastLines, V-49). Its goal mark is in no other file.
const CODE = /\/_next\/static\/.*\.js(\?|$)/
const LINES_MARK = "data-lands-after-goal"

/** Holds the lines' code until decide(true) lets it through, or decide(false) refuses it. Every other file goes on. */
async function holdLines(page: Page) {
  let decide: (ok: boolean) => void = () => {}
  const decided = new Promise<boolean>((r) => (decide = r))
  let seen: () => void = () => {}
  const asked = new Promise<void>((r) => (seen = r))
  await page.route(CODE, async (route) => {
    const response = await route.fetch()
    const body = await response.text()
    if (!body.includes(LINES_MARK)) return route.fulfill({ response, body })
    seen()
    if (await decided) await route.fulfill({ response, body })
    else await route.abort()
  })
  return { asked, decide }
}

// A test that held the lines can end with other files still on their way through the route (route.fetch); the page
// closing under them then failed it ("Target page, context or browser has been closed"). The routes go first, and a
// handler still running ends quietly.
test.afterEach(async ({ page }) => {
  await page.unrouteAll({ behavior: "ignoreErrors" })
})

/** Every box the lines could push: each row's cells (the overview) or each listed thing and section (a goal). */
async function boxes(page: Page, selector: string) {
  return page.locator(selector).evaluateAll((els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect()
      return [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)].join(",")
    }),
  )
}

/** Each forecast line that runs past its own cell or is cut short: none, with the longest words. */
async function overruns(page: Page) {
  return page.locator("[data-forecast-when]").evaluateAll((els) =>
    els.flatMap((el) => {
      const cell = (el.parentElement as HTMLElement).getBoundingClientRect()
      const r = el.getBoundingClientRect()
      const out = r.right > cell.right + 0.5 || r.left < cell.left - 0.5 || el.scrollWidth > el.clientWidth + 0.5
      return out ? [`${el.textContent}: ${Math.round(r.left)}-${Math.round(r.right)} in ${Math.round(cell.left)}-${Math.round(cell.right)}, scroll ${el.scrollWidth}/${el.clientWidth}`] : []
    }),
  )
}

for (const theme of SHOT_THEMES) {
  for (const [where, use] of [
    ["on a phone", { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: theme }],
    ["on a laptop", { viewport: { width: 1280, height: 900 }, colorScheme: theme }],
  ] as const) {
    test.describe(`many projects' forecasts ${where}, ${theme}`, () => {
      test.use(use)

      test("the overview reads every project's forecast at once, and a project left out says nothing", async ({ page }, testInfo) => {
        const reads: Reads = { asked: [] }
        await open(page, testInfo, theme, "/app/project", reads)
        const row = (name: string) => page.locator("[data-project-row]").filter({ hasText: name })
        await expect(row(PROJECTS[0].project_name).locator("[data-forecast-when]")).toHaveText("Lands ~18 Nov", { timeout: 60_000 })
        // Held up past its pace: the at-risk dot, and said in words.
        await expect(row(PROJECTS[1].project_name).locator("[data-forecast-when]")).toHaveText(/^Lands ~25 Nov\s*· held up$/)
        await expect(row(PROJECTS[1].project_name).locator("[data-forecast-when]")).toHaveAttribute("data-forecast-when", "held")
        await expect(row(LEFT_OUT.project_name)).toBeVisible()
        await expect(row(LEFT_OUT.project_name).locator("[data-forecast-when]")).toHaveCount(0)
        // ONE read for the twelve rows, naming each project once.
        await page.waitForTimeout(1_500)
        expect(reads.asked).toHaveLength(1)
        expect([...reads.asked[0]].sort()).toEqual(PROJECTS.map((p) => p.project_uuid).sort())
        // A search narrows the rows, and asks nothing again. The toolbar's search is a button that opens into its field.
        await page.getByRole("button", { name: "Search projects" }).click()
        const search = page.getByRole("searchbox", { name: "Search projects" })
        await search.fill("Billing")
        await expect(page.locator("[data-project-row]")).toHaveCount(1)
        await page.waitForTimeout(800)
        expect(reads.asked).toHaveLength(1)
        await search.fill("")
        await reviewShot(page, "forecasts-overview", theme)
      })

      test("a goal's projects say when each lands, and which lands after the goal's date", async ({ page }, testInfo) => {
        const reads: Reads = { asked: [] }
        const line = (p: (typeof PROJECTS)[number]) => ({ project_uuid: p.project_uuid, project_name: p.project_name, open: 6, done: 4, overdue: 0, progress: 0.4 })
        const goal = {
          id: "g-1",
          title: "Ship the new billing",
          description: "",
          owner: { user_uuid: SAM.user_uuid, user_full_name: "Sam Lee" },
          due_date: "2026-11-20",
          measure: "projects",
          progress: 0.4,
          status: "open",
          projects: 2,
          subgoals: 0,
          can_edit: false,
          project_list: [line(PROJECTS[0]), line(PROJECTS[1])],
          hidden_projects: 0,
          subgoal_list: [],
          checkins: [],
        }
        await open(page, testInfo, theme, "/app/goals/g-1", reads, { "/goal/g-1": { msg: "ok", data: goal } })
        const row = (name: string) => page.locator("li").filter({ hasText: name }).filter({ has: page.locator("[data-forecast-when]") })
        // Before the goal's date: when it lands, and nothing more.
        await expect(row(PROJECTS[0].project_name)).toContainText("Lands ~18 Nov", { timeout: 60_000 })
        await expect(row(PROJECTS[0].project_name).locator("[data-lands-after-goal]")).toHaveCount(0)
        // After it: said so, in danger ink.
        await expect(row(PROJECTS[1].project_name).locator("[data-lands-after-goal]")).toHaveText(", after the goal's date")
        // And the goal's health says it, by its date: one of its projects lands late.
        await expect(page.locator("[data-goal-lands-late]")).toHaveText("1 project lands late")
        await page.waitForTimeout(1_500)
        expect(reads.asked).toHaveLength(1)
        expect([...reads.asked[0]].sort()).toEqual([PROJECTS[0].project_uuid, PROJECTS[1].project_uuid].sort())
        await reviewShot(page, "forecasts-goal", theme)
      })

      // The rows never wait for the lines' code: they draw first, and take their lines when it comes.
      test("the rows draw before the lines' code comes, and take their lines when it does", async ({ page }, testInfo) => {
        const lines = await holdLines(page)
        await open(page, testInfo, theme, "/app/project", { asked: [] })
        const row = (name: string) => page.locator("[data-project-row]").filter({ hasText: name })
        await expect(row(PROJECTS[0].project_name)).toBeVisible({ timeout: 60_000 })
        await lines.asked
        await expect(row(PROJECTS[1].project_name)).toBeVisible()
        await expect(page.locator("[data-forecast-when]")).toHaveCount(0)
        await reviewShot(page, "forecasts-lines-waiting", theme)
        lines.decide(true)
        await expect(row(PROJECTS[0].project_name).locator("[data-forecast-when]")).toHaveText("Lands ~18 Nov", { timeout: 30_000 })
      })

      // If the code can't come, the rows carry on without their lines (nothing in their place, nothing broken), and
      // the lines come back once the browser is back online (lib/lazy/lazyPiece asks again).
      test("the rows carry on when the lines' code can't come, and the lines come back once the browser is online", async ({ page, context }, testInfo) => {
        const lines = await holdLines(page)
        await open(page, testInfo, theme, "/app/project", { asked: [] })
        const row = (name: string) => page.locator("[data-project-row]").filter({ hasText: name })
        await expect(row(PROJECTS[0].project_name)).toBeVisible({ timeout: 60_000 })
        await lines.asked
        lines.decide(false)
        await page.waitForTimeout(1_000)
        await expect(row(PROJECTS[0].project_name)).toBeVisible()
        await expect(row(LEFT_OUT.project_name)).toBeVisible()
        await expect(page.locator("[data-forecast-when]")).toHaveCount(0)
        await expect(page.getByText(/Something broke/)).toHaveCount(0)
        await reviewShot(page, "forecasts-lines-failed", theme)
        await page.unroute(CODE)
        await context.setOffline(true)
        await context.setOffline(false)
        await expect(row(PROJECTS[0].project_name).locator("[data-forecast-when]")).toHaveText("Lands ~18 Nov", { timeout: 30_000 })
        await expect(row(PROJECTS[1].project_name).locator("[data-forecast-when]")).toHaveText(/^Lands ~25 Nov\s*· held up$/)
      })

      // DB-40's FIX 1 and 2: a line keeps to its own room with the longest words, the end's words never move when it
      // lands, and on a phone the counts never give (the milestone's name gives first, then the forecast's date).
      test("a row's forecast keeps to its own room, and nothing else in the row moves or gives when it lands", async ({ page }, testInfo) => {
        const lines = await holdLines(page)
        await open(page, testInfo, theme, "/app/project", { asked: [] })
        const row = (name: string) => page.locator("[data-project-row]").filter({ hasText: name })
        await expect(row(PROJECTS[1].project_name)).toBeVisible({ timeout: 60_000 })
        await expect(row(PROJECTS[1].project_name).locator("[data-next-milestone]")).toBeVisible({ timeout: 30_000 })
        await lines.asked
        // Every cell but the forecast's own, which takes its words.
        const cells = "[data-project-row], [data-project-row] > span:not([data-forecast-cell]), [data-project-row] > span:not([data-forecast-cell]) > span"
        const before = await boxes(page, cells)
        lines.decide(true)
        await expect(row(PROJECTS[1].project_name).locator("[data-forecast-when]")).toHaveText(/^Lands ~25 Nov\s*· held up$/, { timeout: 30_000 })
        await expect(page.locator("[data-forecast-when]")).toHaveCount(PROJECTS.length - 1)
        expect(await overruns(page)).toEqual([])
        if ((page.viewportSize()?.width ?? 0) < 640) {
          // The phone's second line: what the counts say is all there, whatever gives beside them, and nothing
          // shown runs past the row (a milestone with no room left wraps onto the line that is never shown).
          for (const p of [PROJECTS[1], PROJECTS[8]]) {
            const line = await row(p.project_name).locator("[data-row-counts]").evaluate((el) => {
              const box = (el.parentElement!.parentElement as HTMLElement).getBoundingClientRect()
              const spill = [...el.parentElement!.parentElement!.querySelectorAll("[data-forecast-when], [data-next-milestone], [data-row-counts]")].flatMap((c) => {
                const r = c.getBoundingClientRect()
                const shown = r.top < box.bottom - 0.5
                return shown && r.right > box.right + 0.5 ? [`${c.textContent} ends at ${Math.round(r.right)}, the line at ${Math.round(box.right)}`] : []
              })
              return { scroll: el.scrollWidth, client: el.clientWidth, text: el.textContent, spill }
            })
            expect(line.scroll, `the counts were cut: ${line.text}`).toBeLessThanOrEqual(line.client)
            expect(line.spill).toEqual([])
          }
        } else {
          // The laptop's cells: none moved when the lines came.
          expect(await boxes(page, cells)).toEqual(before)
        }
        await reviewShot(page, "forecasts-overview-longest", theme)
        await row(PROJECTS[8].project_name).scrollIntoViewIfNeeded()
        await expect(row(PROJECTS[8].project_name).locator("[data-forecast-when]")).toHaveAttribute("data-forecast-when", "held")
        await reviewShot(page, "forecasts-overview-held-below", theme)
      })

      // DB-40's FIX 3: a goal's rows hold their lines' room from the first paint, so nothing moves when they land.
      test("a goal's projects keep their place while their lines come, and when they land", async ({ page }, testInfo) => {
        const lines = await holdLines(page)
        const line = (p: (typeof PROJECTS)[number]) => ({ project_uuid: p.project_uuid, project_name: p.project_name, open: 6, done: 4, overdue: 0, progress: 0.4 })
        const goal = {
          id: "g-1",
          title: "Ship the new billing",
          description: "",
          owner: { user_uuid: SAM.user_uuid, user_full_name: "Sam Lee" },
          due_date: "2026-11-20",
          measure: "projects",
          progress: 0.4,
          status: "open",
          projects: 2,
          subgoals: 0,
          can_edit: false,
          project_list: [line(PROJECTS[0]), line(PROJECTS[1])],
          hidden_projects: 0,
          subgoal_list: [],
          checkins: [],
        }
        await open(page, testInfo, theme, "/app/goals/g-1", { asked: [] }, { "/goal/g-1": { msg: "ok", data: goal } })
        await expect(page.getByText(PROJECTS[1].project_name).first()).toBeVisible({ timeout: 60_000 })
        await lines.asked
        await reviewShot(page, "forecasts-goal-waiting", theme)
        // The goal's project rows and every section and heading on the page (the app's frame has no <main>).
        const below = "li, section, h2"
        const before = await boxes(page, below)
        expect(before.length).toBeGreaterThan(4)
        lines.decide(true)
        await expect(page.locator("[data-lands-after-goal]")).toHaveText(", after the goal's date", { timeout: 30_000 })
        await expect(page.locator("[data-forecast-when]")).toHaveCount(2)
        expect(await overruns(page)).toEqual([])
        expect(await boxes(page, below)).toEqual(before)
      })
    })
  }
}
