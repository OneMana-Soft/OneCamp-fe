import { expect, test, type Page, type TestInfo } from "@playwright/test"

import { stubBackend } from "./stubbedApp"

// Cycles across projects (linear-12, part 3): the projects overview's Cycles
// view, every project's running cycle in one list, the ones behind first,
// each row opening its project's Backlog. With SHOTS_DIR set, each view is
// also saved for review.

const day = 86_400_000
const at = (days: number) => new Date(Date.now() + days * day).toISOString()
const cycle = (i: number, project: string, name: string, over: Record<string, unknown>) => ({
  id: `c0000000-0000-4000-8000-00000000000${i}`,
  project_uuid: `9e0a0000-0000-4000-8000-00000000000${i}`,
  project_name: project,
  number: i + 2,
  name,
  starts_at: at(-7),
  ends_at: at(7),
  state: "current",
  elapsed: 0.5,
  days_left: 7,
  pace: "on_track",
  progress: { total: 8, started: 2, done: 4 },
  ...over,
})
const CYCLES = [
  cycle(1, "Q4 launch", "", {}),
  cycle(2, "Billing revamp", "Polish", { pace: "behind", elapsed: 0.7, days_left: 3, ends_at: at(3), progress: { total: 12, started: 3, done: 2 } }),
  cycle(3, "Help centre", "", { pace: "empty", elapsed: 0.2, days_left: 11, ends_at: at(11), progress: { total: 0, started: 0, done: 0 } }),
]

async function openCycles(page: Page, testInfo: TestInfo) {
  await stubBackend(page, testInfo, {
    "/project/overview": { msg: "ok", data: { projects: [] } },
    "/project/cycles/running": { msg: "ok", data: { cycles: CYCLES } },
    "/notices": { msg: "ok", data: [] },
  })
  await page.goto(`/app/project?view=cycles`, { waitUntil: "domcontentloaded", timeout: 120_000 })
  await expect(page.locator("[data-running-cycles]")).toBeVisible({ timeout: 60_000 })
}

async function shot(page: Page, name: string, theme: string) {
  const dir = process.env.SHOTS_DIR
  if (!dir) return
  await page.waitForTimeout(600)
  await page.screenshot({ path: `${dir}/${name}-${page.viewportSize()?.width}-${theme}.png` })
}

/**
 * The Cycles view is a chunk of its own (V-16). While it, and then its list,
 * are on their way, the view's own loading rows hold its place and the
 * overview stays round it; a bare next/dynamic suspended to the route's
 * skeleton instead. With SHOTS_DIR set, the loading rows are saved too.
 */
async function holdsItsPlace(page: Page, testInfo: TestInfo, theme: string, touch: boolean) {
  let letList = () => {}
  const list = new Promise<void>((resolve) => (letList = resolve))
  await stubBackend(page, testInfo, {
    "/project/overview": { msg: "ok", data: { projects: [] } },
    "/project/cycles/running": async () => {
      await list
      return { msg: "ok", data: { cycles: CYCLES } }
    },
    "/notices": { msg: "ok", data: [] },
  })
  await page.goto(`/app/project`, { waitUntil: "domcontentloaded", timeout: 120_000 })
  const tab = page.getByRole("tab", { name: /Cycles/ })
  await expect(tab).toBeVisible({ timeout: 60_000 })
  // Every chunk asked for from here on waits, the Cycles view's among them.
  const held: string[] = []
  let letChunks = () => {}
  const chunks = new Promise<void>((resolve) => (letChunks = resolve))
  await page.route((url) => url.pathname.startsWith("/_next/static/chunks/"), async (route) => {
    held.push(route.request().url())
    await chunks
    await route.fallback()
  })
  await (touch ? tab.tap() : tab.click())
  const loading = page.getByRole("status", { name: "Loading cycles" })
  await expect(loading).toBeVisible()
  await expect.poll(() => held.length).toBeGreaterThan(0)
  await expect(tab).toHaveAttribute("aria-selected", "true")
  // The summary line, the header row at a desk, then four rows.
  const loadingRows = loading.locator(":scope > div")
  await expect(loadingRows).toHaveCount(touch ? 5 : 6)
  const before = await loading.boundingBox()
  const first = await loadingRows.nth(touch ? 1 : 2).boundingBox()
  const firstTop = first?.y
  await shot(page, "cycles-loading", theme)
  // The view lands and reads its list: the same rows, in the same place.
  const asked = page.waitForRequest((r) => r.url().includes("/project/cycles/running"))
  letChunks()
  await asked
  await expect(loading).toBeVisible()
  expect(await loading.boundingBox()).toEqual(before)
  letList()
  await expect(page.locator("[data-cycle-row]")).toHaveCount(3)
  await expect(loading).toHaveCount(0)
  // The first real row lands where the first loading row stood, and every row is a loading row's height, the one
  // behind with its chip too (on a phone, two lines over the bar: 79px), so every line below lands where it stood.
  expect((await page.locator("[data-cycle-row]").first().boundingBox())?.y).toBe(firstTop)
  for (const row of await page.locator("[data-cycle-row]").all()) expect((await row.boundingBox())?.height).toBe(first?.height)
}

for (const theme of ["light", "dark"] as const) {
  test.describe(`running cycles at 1280, ${theme}`, () => {
    test.use({ viewport: { width: 1280, height: 900 }, colorScheme: theme })

    test("every project's running cycle, the one behind first, each opening its Backlog", async ({ page }, testInfo) => {
      await openCycles(page, testInfo)
      await expect(page.getByRole("tab", { name: /Cycles/ })).toHaveAttribute("aria-selected", "true")
      const rows = page.locator("[data-cycle-row]")
      await expect(rows).toHaveCount(3)
      await expect(rows.nth(0)).toContainText("Billing revamp")
      await expect(rows.nth(0)).toContainText("Behind")
      await expect(rows.nth(1)).toContainText("Q4 launch")
      await expect(rows.nth(1)).toContainText("4 of 8 done")
      await expect(rows.nth(2)).toContainText("No tasks yet")
      await expect(page.locator("[data-cycles-meta]")).toContainText("3 cycles running")
      await expect(rows.nth(1)).toHaveAttribute("href", /\/app\/project\/9e0a0000-0000-4000-8000-000000000001\?tab=backlog$/)
      await shot(page, "cycles", theme)
    })

    test("the view's loading rows hold its place while its chunk and its list are on their way", async ({ page }, testInfo) => {
      await holdsItsPlace(page, testInfo, theme, false)
    })
  })

  test.describe(`running cycles at 390, ${theme}`, () => {
    test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: theme })

    test("a phone lists them as two-line rows with the bar", async ({ page }, testInfo) => {
      await openCycles(page, testInfo)
      const rows = page.locator("[data-cycle-row]")
      await expect(rows).toHaveCount(3)
      await expect(rows.nth(0)).toContainText("Billing revamp")
      // Nothing runs off the side at a phone's width.
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
      expect(overflow).toBeLessThanOrEqual(0)
      await shot(page, "cycles", theme)
    })

    test("a phone's Cycles view holds its place the same way, by touch", async ({ page }, testInfo) => {
      await holdsItsPlace(page, testInfo, theme, true)
    })
  })
}
