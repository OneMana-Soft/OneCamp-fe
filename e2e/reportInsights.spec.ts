import { readFile } from "node:fs/promises"

import { expect, test, type Page, type TestInfo } from "@playwright/test"

import { reviewShot, stubBackend } from "./stubbedApp"

// How long work takes (B9-a: jira-08, asana-08, linear-32), on a production
// build: the report's Insights section comes in a chunk of its own once the
// report is in, with its four measures, a control chart whose dots open their
// tasks, time in status, and slices that pick out their own work; its rows
// join the report's CSV. At 1280, and at 390 with touch, where the section
// stays inside the screen. With SHOTS_DIR set, each is saved for review.

const DAY = 86_400_000
const monday = (() => {
  const d = new Date()
  d.setUTCHours(0, 0, 0, 0)
  return d.getTime() - ((d.getUTCDay() + 6) % 7) * DAY
})()
const iso = (t: number) => new Date(t).toISOString()
const weeks = [3, 2, 1, 0].map((n) => iso(monday - n * 7 * DAY).slice(0, 10))
const spread = (n: number, p50: number) => ({ n, p25: p50 / 2, p50, p85: p50 * 2, p95: p50 * 3 })
const none = { n: 0, p25: 0, p50: 0, p85: 0, p95: 0 }
const counts = { to_do: 2, in_progress: 1, in_review: 0, overdue: 0, done: 3 }

const report = {
  weeks,
  done: [1, 0, 1, 1],
  added: [2, 1, 0, 1],
  hours: null,
  open: 3,
  overdue: 0,
  due_this_week: 1,
  done_total: 3,
  projects: [{ project_uuid: "p-1", project_name: "Billing revamp", ...counts }],
  people: [{ user_uuid: "u-1", user_name: "Ana Diaz", ...counts }],
  priorities: [],
  all_projects: [{ project_uuid: "p-1", project_name: "Billing revamp" }],
  truncated: false,
  insights: {
    cycle: spread(2, 30),
    lead: spread(3, 60),
    triage: spread(1, 5),
    age: spread(3, 100),
    in_status: [
      { status: "backlog", ...none },
      { status: "todo", ...spread(3, 10) },
      { status: "inProgress", ...spread(2, 20) },
      { status: "inReview", ...spread(1, 4) },
    ],
    points: [
      { task_uuid: "t-1", task_name: "Send the invoices", done_at: iso(monday + DAY), cycle: 30, lead: 60, project_uuid: "p-1", person_uuid: "u-1" },
      { task_uuid: "t-2", task_name: "Fix the totals", done_at: iso(monday - 8 * DAY), cycle: 20, lead: 40, project_uuid: "p-1", priority: "high" },
      { task_uuid: "t-3", task_name: "Write the terms", done_at: iso(monday - 20 * DAY), lead: 90, project_uuid: "p-1", person_uuid: "u-1" },
    ],
    points_capped: false,
    slices: [
      { by: "project", key: "p-1", name: "Billing revamp", cycle: spread(2, 30), lead: spread(3, 60), age: spread(3, 100) },
      { by: "person", key: "u-1", name: "Ana Diaz", cycle: spread(1, 30), lead: spread(2, 70), age: spread(2, 100) },
      { by: "person", key: "", name: "", cycle: spread(1, 20), lead: spread(1, 40), age: spread(1, 50) },
    ],
  },
}

async function openReports(page: Page, testInfo: TestInfo, theme: string, phone: boolean) {
  await page.addInitScript((t) => localStorage.setItem("ui-theme", t), theme)
  await stubBackend(page, testInfo, {
    "/project/overview": { msg: "ok", data: { projects: [{ project_uuid: "p-1", project_name: "Billing revamp", is_admin: 1, open: 3, done: 3, overdue: 0, due_soon: 1 }] } },
    "/project/report": { msg: "ok", data: report },
    "/goal/list": { msg: "ok", data: { goals: [] } },
    "/notices": { msg: "ok", data: [] },
  })
  await page.goto("/app/project", { waitUntil: "domcontentloaded", timeout: 120_000 })
  const tab = page.getByRole("tab", { name: /Reports/ })
  await expect(tab).toBeVisible({ timeout: 60_000 })
  await (phone ? tab.tap() : tab.click())
  const section = page.getByRole("region", { name: "How long work takes" })
  await expect(section).toBeVisible({ timeout: 30_000 })
  return section
}

for (const theme of ["light", "dark"] as const) {
  for (const phone of [false, true]) {
    test.describe(`how long work takes at ${phone ? 390 : 1280} (${theme})`, () => {
      test.use(phone ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: theme } : { viewport: { width: 1280, height: 900 }, colorScheme: theme })
      test.beforeEach(() => test.skip(theme === "dark" && !process.env.SHOTS_DIR, "dark only for the review shots"))

      test("measures, a control chart whose dots open their tasks, time in status, slices, and the CSV", async ({ page }, testInfo) => {
        test.setTimeout(180_000)
        const section = await openReports(page, testInfo, theme, phone)
        const tap = async (where: ReturnType<Page["locator"]>) => (phone ? where.tap() : where.click())

        // The four measures: medians, each with its 85th percentile.
        const tiles = section.locator("[data-kpi]")
        await expect(tiles).toHaveCount(4)
        await expect(tiles.nth(0)).toContainText("Cycle time30 hmedian · 85% within 2.5 d · 2 tasks")
        await expect(tiles.nth(3)).toContainText("Age of open work4.2 d")
        await section.scrollIntoViewIfNeeded()
        await reviewShot(page, "insights", theme)

        // The control chart: a dot a task started and done; a dot's tip opens its task.
        const chart = section.locator("[data-scatter-chart]")
        await expect(chart.locator("[data-scatter-point]")).toHaveCount(2)
        await expect(chart.getByRole("img", { name: /^Cycle time of 2 tasks done: median 30 h, 85% within 2.5 d/ })).toBeAttached()
        await chart.scrollIntoViewIfNeeded()
        await tap(chart.locator('[data-scatter-point] circle:last-child').first())
        const tip = chart.getByRole("tooltip")
        await expect(tip).toBeVisible()
        // The day it was done, written as the axis under it writes a week ("6 Oct"), not the browser's "Oct 6".
        await expect(tip).toContainText(/ · done \d{1,2} (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/)
        await expect(tip.getByRole("link", { name: "Open task" })).toHaveAttribute("href", /^\/app\/task\/t-[12]$/)
        await reviewShot(page, "insights-tip", theme)
        await tap(chart.getByRole("radio", { name: "Lead time" }))
        await expect(chart.locator("[data-scatter-point]")).toHaveCount(3)

        // Time in status: the median as a bar, on to the 85th percentile.
        await expect(section.getByRole("img", { name: "In progress: 20 h median · 85% within 40 h" })).toBeAttached()

        // Slices: by person, and the one picked shows its own numbers and dots.
        const slices = section.getByRole("region", { name: "By slice" })
        await tap(slices.getByRole("combobox", { name: "Slice by" }))
        await tap(page.getByRole("option", { name: "By person" }))
        await expect(slices.locator("tbody th")).toHaveText(["Ana Diaz", "Nobody"])
        await tap(slices.getByRole("button", { name: "Ana Diaz" }))
        await expect(slices.getByRole("button", { name: "Ana Diaz" })).toHaveAttribute("aria-pressed", "true")
        await expect(section.getByText(/Ana Diaz alone/)).toBeVisible()
        await expect(tiles.nth(1)).toContainText("Lead time2.9 d")
        await expect(chart.locator('[data-scatter-point="muted"]')).toHaveCount(1)
        await reviewShot(page, "insights-slice", theme)

        // Inside the screen at every width: nothing scrolls sideways.
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
        const box = await section.boundingBox()
        expect(box && box.x >= 0 && box.x + box.width <= (phone ? 390 : 1280)).toBe(true)

        // The CSV carries every chart's rows after the report's own.
        const saving = page.waitForEvent("download")
        await tap(page.getByRole("button", { name: /Download CSV/ }))
        const csv = await readFile((await (await saving).path())!, "utf8")
        expect(csv).toMatch(/^Week starting,/)
        expect(csv).toContain("\nCycle time (started to done),2,15,30,60,90\n")
        expect(csv).toContain("\nIn progress,2,10,20,40,60\n")
        expect(csv).toContain("\nperson,Ana Diaz,2,30,60,70,140,2,100\n")
        expect(csv).toContain("\nWrite the terms,")
      })
    })
  }
}
