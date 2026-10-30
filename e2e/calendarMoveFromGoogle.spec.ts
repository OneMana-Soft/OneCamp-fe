import { expect, test, type Page, type Request, type TestInfo } from "@playwright/test"

import { stubBackend } from "./stubbedApp"

// Calendar B6: with Google Calendar connected, "Move everything from Google"
// in the Calendars panel starts the move; its progress shows while it runs,
// then "In step with Google" with how long ago. When Google stops answering
// for the account (C9), it says so once, on the account line, offers to
// connect Google again, and the closed Calendars button carries a danger dot.
// A phone has the same in its calendar options. With SHOTS_DIR set, each
// state is saved for review.

const NOW = new Date(2026, 9, 21, 10, 0)

type Sync = { provider: "google"; account: string; state: string; progress: number; moved: number; unchanged: number; last_synced_at?: string; error?: string }

// What the server keeps as why; the web says it in its own short words.
const STOPPED = "Google stopped answering for this account. Connect it again."
const BROKEN: Partial<Sync> = { state: "broken", progress: 100, error: STOPPED }

async function open(page: Page, testInfo: TestInfo, from: Partial<Sync> = {}) {
  const sync: { now: Sync; moves: number } = {
    now: { provider: "google", account: "sam@gmail.com", state: "none", progress: 0, moved: 0, unchanged: 0, ...from },
    moves: 0,
  }
  let polls = 0
  await page.clock.setFixedTime(NOW)
  await stubBackend(page, testInfo, {
    "/event/getEvents": { msg: "ok", data: [] },
    "/integration/google-calendar/status": { msg: "ok", data: { isConnected: true, accountEmail: "sam@gmail.com" } },
    "/user/assignedTaskList": { msg: "ok", data: { user_tasks: [] } },
    "/event/bookingPages": { msg: "ok", data: [] },
    "/integration/google-calendar/auth-url": { msg: "ok", data: { url: "/app/calendar?date=2026-10-21&view=week" } },
    "/calendar/sync/google/move": (_url: URL, request: Request) => {
      if (request.method() === "POST") {
        sync.moves++
        sync.now = { ...sync.now, state: "moving", progress: 45 }
      }
      return { msg: "ok", data: sync.now }
    },
    "/calendar/sync/google": () => {
      // Two reads while it moves, then it is in step.
      if (sync.now.state === "moving" && ++polls > 2) {
        sync.now = { ...sync.now, state: "synced", progress: 100, moved: 412, unchanged: 0, last_synced_at: new Date(NOW.getTime() - 2 * 60_000).toISOString() }
      }
      return { msg: "ok", data: sync.now }
    },
  })
  page.on("response", (r) => {
    if (r.status() === 404) console.log(`UNSTUBBED ${r.request().method()} ${new URL(r.url()).pathname}`)
  })
  await page.goto("/app/calendar?date=2026-10-21&view=week", { waitUntil: "domcontentloaded", timeout: 120_000 })
  // A dev server compiles the app on its first visit: the week, however long that takes.
  await expect(page.locator("[data-period]")).toBeVisible({ timeout: 240_000 })
  return sync
}

async function shot(page: Page, name: string, theme: string) {
  const dir = process.env.SHOTS_DIR
  if (!dir) return
  await page.waitForTimeout(450)
  await page.screenshot({ path: `${dir}/${name}-${page.viewportSize()?.width}-${theme}.png` })
}

for (const theme of ["light", "dark"] as const) {
  test.describe(`moving from Google at 1280, ${theme}`, () => {
    test.use({ viewport: { width: 1280, height: 900 }, colorScheme: theme })

    test("one press moves everything, its progress shows, then both stay in step", async ({ page }, testInfo) => {
      test.setTimeout(420_000)
      const sync = await open(page, testInfo)
      await page.getByRole("button", { name: /^Calendars/ }).click({ timeout: 60_000 })
      const panel = page.locator("[data-calendars-panel]")
      await expect(panel.locator("[data-google-account]")).toHaveText("sam@gmail.com")
      const move = panel.getByRole("button", { name: "Move everything from Google" })
      await expect(move).toBeVisible()
      await shot(page, "b6-before", theme)
      await move.click()
      await expect(panel.locator("[data-google-sync='moving']")).toContainText("Moving from Google · 45%")
      await shot(page, "b6-moving", theme)
      await expect(panel.locator("[data-google-sync='synced']")).toContainText("In step with Google · 2m ago", { timeout: 20_000 })
      await shot(page, "b6-synced", theme)
      expect(sync.moves).toBe(1)
    })

    test("when Google stops answering, it says so once and connects Google again", async ({ page }, testInfo) => {
      test.setTimeout(420_000)
      await open(page, testInfo, BROKEN)
      const closed = page.getByRole("button", { name: "Calendars, Google needs connecting again" })
      await expect(closed.locator("[data-google-broken]")).toBeVisible({ timeout: 60_000 })
      await shot(page, "c9-broken-closed", theme)
      await closed.click()
      const panel = page.locator("[data-calendars-panel]")
      await expect(panel.locator("[data-google-account]")).toHaveText("sam@gmail.com · Google stopped answering")
      await expect(panel.getByText(/stopped answering/)).toHaveCount(1)
      await expect(panel.getByRole("alert")).toHaveCount(0)
      await expect(panel.getByRole("button", { name: /from Google/ })).toHaveCount(0)
      await shot(page, "c9-broken", theme)
      const asked = page.waitForRequest((r) => r.url().includes("/integration/google-calendar/auth-url"))
      await panel.getByRole("button", { name: "Connect Google again" }).click()
      await asked
    })
  })
}

test.describe("moving from Google on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: "light" })
  test("the calendar options start the move and say when they were last in step", async ({ page }, testInfo) => {
    test.setTimeout(420_000)
    await open(page, testInfo)
    await page.getByRole("button", { name: "Calendar options" }).click({ timeout: 60_000 })
    const move = page.getByRole("button", { name: "Move everything from Google" })
    await expect(move).toBeVisible()
    await shot(page, "b6-before", "light")
    await move.click()
    await expect(page.getByText(/In step with Google · 2m ago/)).toBeVisible({ timeout: 20_000 })
    const width = await page.evaluate(() => document.documentElement.scrollWidth)
    expect(width).toBeLessThanOrEqual(390)
    await shot(page, "b6-synced", "light")
  })

})

for (const theme of ["light", "dark"] as const) {
  test.describe(`Google stopped answering on a phone, ${theme}`, () => {
    test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: theme })
    test("the calendar options say so once, on the account line, and connect it again", async ({ page }, testInfo) => {
      test.setTimeout(420_000)
      await open(page, testInfo, BROKEN)
      await page.getByRole("button", { name: "Calendar options" }).click({ timeout: 60_000 })
      const google = page.locator("[data-drawer-google]")
      await expect(google.locator("[data-google-account]")).toHaveText("sam@gmail.com · Google stopped answering")
      await expect(google.getByText(/stopped answering/)).toHaveCount(1)
      const again = google.getByRole("button", { name: "Connect Google again" })
      await expect(again.getByText("Connect Google again")).toHaveClass(/\btext-brand-text\b/)
      const width = await page.evaluate(() => document.documentElement.scrollWidth)
      expect(width).toBeLessThanOrEqual(390)
      await shot(page, "c9-broken", theme)
      const asked = page.waitForRequest((r) => r.url().includes("/integration/google-calendar/auth-url"))
      await again.tap()
      await asked
    })
  })
}
