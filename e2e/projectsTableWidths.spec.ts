import { expect, test, type Page } from "@playwright/test"

import { SHOT_THEMES, reviewShot, stubBackend } from "./stubbedApp"

// V-437: the projects overview's table on a laptop window with the sidebar open. Its columns after the name are fixed
// tracks (~784 px with the gaps and padding), so from a ~1024 px window down to 640 the name's column was 0 px wide and
// every project's name was gone. The table gives its other columns whole instead, the least needed first, and its
// name keeps room to be read at every width the table is drawn at.

const NOW = new Date("2026-10-29T10:00:00Z")
const id = (n: number) => `9e0a0000-0000-4000-8000-${String(n).padStart(12, "0")}`
const NAMES = ["Billing revamp", "Q4 launch", "Mobile app", "Help centre", "Partner portal", "Onboarding emails"]
const PROJECTS = NAMES.map((name, i) => ({
  project_uuid: id(i + 1),
  project_name: name,
  is_admin: 1,
  open: 4 + i,
  done: 2,
  overdue: i === 1 ? 2 : 0,
  due_soon: 0,
}))

/** The narrowest a name's column may get: room for a short name, or a long one's first words. */
const NAME_FLOOR = 192
/** Laptop windows, widest to narrowest; the table is the laptop's from 640 px up. */
const WIDTHS = [1280, 1100, 1024, 960, 900, 800, 720, 640]

async function open(page: Page, testInfo: Parameters<typeof stubBackend>[1], theme: string) {
  await page.clock.setFixedTime(NOW)
  await page.addInitScript((t) => {
    localStorage.setItem("ui-theme", t)
    localStorage.setItem("oc_keys_tip_seen", "1")
  }, theme)
  await stubBackend(page, testInfo, {
    "/project/overview": { msg: "ok", data: { projects: PROJECTS } },
    "/project/milestones": { msg: "ok", data: { projects: {} } },
    "/project/forecasts": { msg: "ok", data: {} },
    "/notices": { msg: "ok", data: [] },
    "/goal/list": { msg: "ok", data: { goals: [] } },
  })
  await page.goto("/app/project", { waitUntil: "domcontentloaded", timeout: 120_000 })
}

/**
 * What's wrong with the table at this width: a name's column under its floor, a cell painted past its row, a head
 * that doesn't line up with its rows' cells, or a page that scrolls sideways.
 */
async function faults(page: Page, floor: number) {
  return page.evaluate((floor) => {
    const out: string[] = []
    // A cell that gave way is not drawn at all; a drawn cell counts at any width, 0 px included.
    const shown = (el: Element) => getComputedStyle(el).display !== "none"
    const head = document.querySelector("[data-projects-head]")
    const rows = [...document.querySelectorAll("[role=table] [data-project-row]")]
    if (!head || rows.length === 0) return ["no table"]
    const lefts = (row: Element) => [...row.children].filter(shown).map((c) => Math.round(c.getBoundingClientRect().left))
    const headLefts = lefts(head)
    for (const row of rows) {
      const title = row.querySelector("[title]")
      const name = title?.getAttribute("title") ?? "?"
      const cells = [...row.children].filter(shown)
      const col = cells.find((c) => title && c.contains(title))?.getBoundingClientRect().width ?? 0
      if (col < floor - 0.5) out.push(`"${name}": its name's column is ${Math.round(col)} px`)
      const end = row.getBoundingClientRect().right - (parseFloat(getComputedStyle(row).paddingRight) || 0)
      for (const c of cells)
        if (c.getBoundingClientRect().right > end + 0.5) out.push(`"${name}": a cell ends ${Math.round(c.getBoundingClientRect().right - end)} px past its row`)
      if (lefts(row).join() !== headLefts.join()) out.push(`"${name}": its cells start at ${lefts(row).join()}, the head's at ${headLefts.join()}`)
    }
    if (document.documentElement.scrollWidth > innerWidth + 0.5) out.push(`the page scrolls ${document.documentElement.scrollWidth - innerWidth} px sideways`)
    return out
  }, floor)
}

for (const theme of SHOT_THEMES) {
  test.describe(`the projects table at every laptop width, ${theme}`, () => {
    test.use({ viewport: { width: 1280, height: 900 }, colorScheme: theme })

    test("every width keeps the names readable, gives other columns whole, and keeps the head on its rows", async ({ page }, testInfo) => {
      await open(page, testInfo, theme)
      await expect(page.locator("[role=table] [data-project-row]")).toHaveCount(PROJECTS.length, { timeout: 60_000 })
      // At full width every column is there.
      await expect(page.locator("[data-projects-head]")).toContainText("Tasks")
      const all: Record<number, string[]> = {}
      for (const width of WIDTHS) {
        await page.setViewportSize({ width, height: 900 })
        await page.waitForTimeout(200)
        all[width] = await faults(page, NAME_FLOOR)
        if (width === 900 || width === 640) await reviewShot(page, `projects-table-${width}`, theme)
      }
      // Every width is read before one expect, so a failure names every width's faults.
      expect(all).toEqual(Object.fromEntries(WIDTHS.map((w) => [w, []])))
      // The sidebar was open throughout: the table's room is the window less the sidebar.
      expect(await page.locator("main").evaluate((m) => m.getBoundingClientRect().left)).toBeGreaterThan(100)
    })
  })
}
