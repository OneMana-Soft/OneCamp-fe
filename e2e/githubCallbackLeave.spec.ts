import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test"

import { SAM, holdPages, stubBackend } from "./stubbedApp"

// GitHub sends an admin back to /app/admin/github/callback; once the code is
// exchanged, the page takes them on to Admin, Integrations two seconds later.
// It did so whatever they had done meanwhile: an admin who had already gone
// elsewhere was pulled back to Integrations (26 Oct 2026), and so was one
// whose way out was still loading when the two seconds were up (a push
// cancels a move still on its way). The admin's own move comes first.

const ADMIN = { ...SAM, user_is_admin: true }

async function connected(page: Page, testInfo: TestInfo) {
  // The page's clock runs as a real one, and the test can move it on.
  await page.clock.install()
  await stubBackend(page, testInfo, {
    "/user/profile": { msg: "ok", data: ADMIN },
    "/admin/github/callback": { msg: "ok" },
  })
  await page.goto("/app/admin/github/callback?code=c0de&state=st4te", { waitUntil: "domcontentloaded", timeout: 60_000 })
  await expect(page.getByRole("heading", { name: "GitHub is connected" })).toBeVisible({ timeout: 30_000 })
}

for (const s of [
  // Back to app, whose /app goes on to Home.
  { name: "a computer, by mouse", viewport: { width: 1280, height: 860 }, touch: false, away: (page: Page) => page.getByRole("link", { name: "Back to app" }).first() },
  // The bottom bar's Home.
  { name: "a phone, by touch", viewport: { width: 390, height: 844 }, touch: true, away: (page: Page) => page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Home" }) },
]) {
  test.describe(`GitHub's callback page on ${s.name}`, () => {
    test.use({ viewport: s.viewport, isMobile: s.touch, hasTouch: s.touch })
    const press = (target: Locator) => (s.touch ? target.tap() : target.click())

    test("an admin who leaves before it sends them on stays where they went", async ({ page }, testInfo) => {
      test.setTimeout(120_000)
      await connected(page, testInfo)
      // Within the two seconds, through the app's own navigation, to where it settles.
      await press(s.away(page))
      await expect(page).toHaveURL(/\/app\/home$/)
      const went = page.url()
      // Past the two seconds: a send still waiting goes now, and its page loads.
      await page.clock.fastForward(3000)
      await page.waitForLoadState("networkidle")
      expect(page.url()).toBe(went)
    })

    test("an admin whose way out is still loading when the two seconds are up goes where they chose", async ({ page }, testInfo) => {
      test.setTimeout(120_000)
      const letHomeGo = await holdPages(page, (url) => url.pathname === "/app" || url.pathname === "/app/home")
      await connected(page, testInfo)
      await press(s.away(page))
      // Past the two seconds while Home is still on its way.
      await page.clock.fastForward(3000)
      letHomeGo()
      await expect(page).toHaveURL(/\/app\/home$/, { timeout: 30_000 })
      await page.waitForLoadState("networkidle")
      expect(page.url()).toMatch(/\/app\/home$/)
    })

    test("an admin who stays is taken on to Integrations", async ({ page }, testInfo) => {
      test.setTimeout(120_000)
      await connected(page, testInfo)
      await page.clock.fastForward(3000)
      await expect(page).toHaveURL(/\/app\/admin\?tab=integrations$/, { timeout: 30_000 })
    })
  })
}
