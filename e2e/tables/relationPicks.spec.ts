import { expect, test, type Locator, type Page } from "@playwright/test"

import { reviewShot, SAM, SHOT_THEMES } from "../stubbedApp"
import { TableServer } from "./tableServer"

// A link cell that takes anything links a task, then a project, from the workspace search, read as the search index
// sends them (models/openSearch: a task's id is task_id, a project's project_id; lib/search/hitRef reads them, as the
// calendar event's Linked row does). Each pick shows as its chip, and the chip opens the task or the project. At 1280,
// and at 390 with touch. With SHOTS_DIR set, it saves the search and the linked cell, light and dark.

const TASK = "9d1c0000-0000-4000-8000-0000000000a1"
const PROJECT = "9d1c0000-0000-4000-8000-0000000000b1"
const fields = [
  { id: "item", name: "Item", type: "text" },
  { id: "work", name: "Work", type: "relation", config: { relation_target: "any" } },
]

/** The workspace search finds a task and a project, as the index answers. Registered after the table's stubs, so it answers first. */
async function searchFinds(page: Page) {
  await page.route(
    (url) => url.pathname.endsWith("/search/unifiedSearch"),
    (route) => {
      const req = route.request()
      if (req.method() === "OPTIONS") return route.fallback()
      return route.fulfill({
        status: 200,
        headers: { "access-control-allow-origin": req.headers()["origin"] || "*", "access-control-allow-credentials": "true" },
        json: {
          msg: "ok",
          data: {
            page: [
              { type: "task", task: { task_id: TASK, task_name: "Venue", task_project_name: "Launch" } },
              { type: "project", project: { project_id: PROJECT, project_name: "Launch", project_team_name: "Events" } },
            ],
            has_more: false,
          },
        },
      })
    },
  )
}

for (const theme of SHOT_THEMES) {
  for (const phone of [false, true]) {
    test(`at ${phone ? "390 with touch" : "1280"}, ${theme}: a link cell links a task and a project from the search, each a chip that opens it`, async ({ browser }, testInfo) => {
      test.setTimeout(240_000)
      const server = new TableServer(fields, [{ item: "Booth" }])
      server.names.set(TASK, "Venue")
      server.names.set(PROJECT, "Launch")
      const { page, close } = await server.open(browser, testInfo, SAM, {
        colorScheme: theme,
        ...(phone ? { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true } : {}),
      })
      await searchFinds(page)
      const press = (target: Locator) => (phone ? target.tap() : target.click())
      const cell = page.locator("tbody tr[data-row]").first().locator('td[data-field="work"]')
      const chip = (name: string) => cell.locator("[data-relation-chip]").getByRole("link", { name })
      const pick = async (name: RegExp, shot?: string) => {
        if (!phone) await cell.hover()
        const find = page.getByRole("textbox", { name: "Search tasks, docs and people" })
        // A cell drawn at rest comes to life under the first touch (back from a chip, the grid draws again); the
        // picker opens under the press that reaches the live "+".
        await expect(async () => {
          if (!(await find.isVisible())) await press(cell.getByRole("button", { name: "Add a link" }))
          await expect(find).toBeVisible({ timeout: 5_000 })
        }).toPass({ timeout: 40_000 })
        await find.fill("launch")
        await expect(page.getByRole("option", { name: /Venue/ })).toBeVisible({ timeout: 20_000 })
        await expect(page.getByRole("option", { name: /Launch/ })).toBeVisible()
        if (shot) await reviewShot(page, shot, theme)
        await press(page.getByRole("option", { name }))
        await expect(find).toHaveCount(0, { timeout: 20_000 })
      }
      const opens = async (name: string, path: string) => {
        await expect(chip(name)).toHaveAttribute("href", path)
        await press(chip(name))
        await expect(page).toHaveURL(new RegExp(`${path}$`), { timeout: 30_000 })
        await page.goBack({ waitUntil: "domcontentloaded" })
        await expect(cell.locator("[data-relation-chip]").first()).toBeVisible({ timeout: 60_000 })
      }
      await expect(page.locator("tbody tr[data-row]").first()).toContainText("Booth", { timeout: 60_000 })

      // A task, written as its id and type; its chip names it and opens the task.
      await pick(/Venue/, "relation-picks-search")
      await expect.poll(() => server.valuesOf(0).work).toEqual([{ id: TASK, type: "task" }])
      await expect(chip("Venue")).toBeVisible({ timeout: 20_000 })
      await opens("Venue", `/app/task/${TASK}`)

      // Then a project, beside it; its chip opens the project.
      await pick(/Launch/)
      await expect.poll(() => server.valuesOf(0).work).toEqual([
        { id: TASK, type: "task" },
        { id: PROJECT, type: "project" },
      ])
      await expect(chip("Launch")).toBeVisible({ timeout: 20_000 })
      await expect(chip("Venue")).toBeVisible()
      await reviewShot(page, "relation-picks-cell", theme)
      await opens("Launch", `/app/project/${PROJECT}`)
      await close()
    })
  }
}
