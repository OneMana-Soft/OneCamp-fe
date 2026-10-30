import { expect, test } from "@playwright/test"

import { reviewShot, stubBackend } from "./stubbedApp"

// The projects overview's loading rows: its Projects, Cycles and Goals views
// draw one WorkRowsLoading, each at its real rows' height, so the rows land
// where the placeholder stood. Here Projects and Goals hold their place while
// their lists are read, and the first real row's top is the first loading
// row's; the Cycles view, its chunk held too, is in runningCycles.spec.ts.
// With SHOTS_DIR set, each is saved for review, loading and loaded.

const PROJECT = { project_uuid: "p-1", project_name: "Billing revamp", is_admin: 1, open: 4, done: 2, overdue: 0, due_soon: 1 }
const GOAL = { id: "g-1", title: "Ship the new billing", owner: { user_uuid: "u-1", user_full_name: "Ana Diaz" }, due_date: "2026-12-31", measure: "projects", progress: 0.4, status: "open", projects: 1, subgoals: 0 }

for (const theme of ["light", "dark"] as const) {
  for (const phone of [false, true]) {
    test.describe(`the overview's loading rows at ${phone ? 390 : 1280}, ${theme}`, () => {
      test.use(phone ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: theme } : { viewport: { width: 1280, height: 900 }, colorScheme: theme })

      test("Projects and Goals hold their rows' place while their lists are read", async ({ page }, testInfo) => {
        let letProjects = () => {}
        const projects = new Promise<void>((resolve) => (letProjects = resolve))
        let letGoals = () => {}
        const goals = new Promise<void>((resolve) => (letGoals = resolve))
        await stubBackend(page, testInfo, {
          "/project/overview": async () => {
            await projects
            return { msg: "ok", data: { projects: [PROJECT] } }
          },
          "/goal/list": async () => {
            await goals
            return { msg: "ok", data: { goals: [GOAL] } }
          },
          "/notices": { msg: "ok", data: [] },
        })
        await page.goto("/app/project", { waitUntil: "domcontentloaded", timeout: 120_000 })

        // The table's header row at a desk, then five rows a project's row high.
        const table = page.getByRole("status", { name: "Loading projects" })
        await expect(table).toBeVisible({ timeout: 60_000 })
        const tableRows = table.locator(":scope > div")
        await expect(tableRows).toHaveCount(phone ? 5 : 6)
        expect((await tableRows.last().boundingBox())?.height).toBe(phone ? 72 : 52)
        const projectTop = (await tableRows.nth(phone ? 0 : 1).boundingBox())?.y
        await reviewShot(page, "projects-loading", theme)
        letProjects()
        await expect(table).toHaveCount(0)
        const projectRow = page.locator("[data-project-row]").first()
        await expect(projectRow).toBeVisible()
        expect((await projectRow.boundingBox())?.y).toBe(projectTop)
        await reviewShot(page, "projects", theme)

        // Goals: the table's header row at a desk, then five rows a goal row
        // high, 56 px at a desk and 64 px on a phone.
        const tab = page.getByRole("tab", { name: /Goals/ })
        await (phone ? tab.tap() : tab.click())
        const list = page.getByRole("status", { name: "Loading goals" })
        await expect(list).toBeVisible()
        const goalRows = list.locator(":scope > div")
        await expect(goalRows).toHaveCount(phone ? 5 : 6)
        expect((await goalRows.last().boundingBox())?.height).toBe(phone ? 64 : 56)
        const goalTop = (await goalRows.nth(phone ? 0 : 1).boundingBox())?.y
        await reviewShot(page, "goals-loading", theme)
        letGoals()
        await expect(list).toHaveCount(0)
        const goalRow = page.locator("[data-goal-row]").first()
        await expect(goalRow).toBeVisible()
        expect((await goalRow.boundingBox())?.y).toBe(goalTop)
        await reviewShot(page, "goals", theme)
      })
    })
  }
}
