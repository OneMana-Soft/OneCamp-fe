import { expect, test, type BrowserContextOptions } from "@playwright/test"
import { reviewShot, SHOT_THEMES, stubBackend } from "./stubbedApp"

// The global 404 (app/not-found.tsx, FLUIDITY-12, 5 Nov 2026): its view comes
// in as a chunk of its own (components/guest/notFoundView.tsx), so no other
// page's first load carries it. A dead address still answers 404, with or
// without JavaScript, and the page draws the shared gone state in the public
// frame, with the way to the workspace and Sign in (PG2-01). The server sends
// no page's markup (ClientProviders draws children only in the browser, under
// the boot splash), so the words come with the page's code, as on every page.
const DEVICES = {
  computer: { viewport: { width: 1280, height: 800 } },
  phone: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 },
} satisfies Record<string, BrowserContextOptions>

const DEAD = "/no-such-page-anywhere"
const HEADING = "This page doesn't exist or was deleted"

for (const [device, use] of Object.entries(DEVICES)) {
  test(`a dead address answers 404 and draws the gone state whole in the public frame, on a ${device}`, async ({ browser }, testInfo) => {
    test.setTimeout(120_000)
    const context = await browser.newContext(use)
    const page = await context.newPage()
    await stubBackend(page, testInfo)
    const response = await page.goto(DEAD, { waitUntil: "domcontentloaded", timeout: 120_000 })
    expect(response?.status()).toBe(404)

    await expect(page.getByRole("heading", { name: HEADING })).toBeVisible({ timeout: 30_000 })
    await expect(page.locator("[data-public-frame] [data-public-gone] [data-load-failure='gone']")).toBeVisible()
    await expect(page.getByRole("link", { name: "Go to your workspace" })).toHaveAttribute("href", "/app/home")
    await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible()
    // Nothing overflows the phone's width.
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)

    for (const theme of SHOT_THEMES) {
      await page.emulateMedia({ colorScheme: theme })
      await reviewShot(page, "not-found", theme)
    }
    await context.close()
  })
}

// Its words with no JavaScript are V-542 (a gap from before, as on every page):
// the body is the boot splash, as on beta.
test("a dead address answers 404 to a visitor with no JavaScript, under the boot splash", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false })
  const page = await context.newPage()
  const response = await page.goto(DEAD, { waitUntil: "domcontentloaded", timeout: 120_000 })
  expect(response?.status()).toBe(404)
  expect(await response?.text()).toContain("data-app-boot-screen")
  await context.close()
})

// A signed-in person at a dead /app address: app/app/not-found.tsx draws the
// view inside the shell through its own chunk (components/error/appNotFoundView.tsx),
// with the way home and Search, not the public frame. Its status is 200 today
// (the /app layout draws children only once the profile is read): V-542.
for (const [device, use] of Object.entries(DEVICES)) {
  test(`a signed-in person at a dead /app address gets the 404 inside the shell, with Go home and Search, on a ${device}`, async ({ browser }, testInfo) => {
    test.setTimeout(120_000)
    const context = await browser.newContext(use)
    const page = await context.newPage()
    await stubBackend(page, testInfo)
    const response = await page.goto("/app/no-such-page-anywhere", { waitUntil: "domcontentloaded", timeout: 120_000 })
    expect(response?.status()).toBe(200)

    await expect(page.getByRole("heading", { name: HEADING })).toBeVisible({ timeout: 30_000 })
    await expect(page.locator("[data-public-gone] [data-load-failure='gone']")).toBeVisible()
    await expect(page.locator("[data-public-frame]")).toHaveCount(0)
    await expect(page.getByRole("link", { name: "Go home" })).toHaveAttribute("href", "/app/home")
    // The 404's own Search, not the shell's search pill beside it.
    await expect(page.locator("[data-public-gone]").getByRole("button", { name: /Search/ })).toBeVisible()

    for (const theme of SHOT_THEMES) {
      await page.emulateMedia({ colorScheme: theme })
      await reviewShot(page, "app-not-found", theme)
    }
    await context.close()
  })
}
