import { expect, test, type Page, type Route, type TestInfo } from "@playwright/test"
import { stubBackend } from "./stubbedApp"

// lib/chunkRecovery (V-64, 29 Oct): a file of the app's code that fails to
// load reloads the page only when the server says it is gone (a deploy since
// the page loaded). With the network dead, while the device still says it is
// online, the page stays, and what is being typed stays with it.

const CH = "c0ffee00-0000-4000-8000-0000000000e5"
/** A file of the app's code the server doesn't have: an old build's, after a deploy. */
const OLD_BUILD_FILE = "/_next/static/chunks/v64-from-an-old-build.js"
const WORDS = "Still here after the network went."

async function openChannel(page: Page, testInfo: TestInfo) {
  await stubBackend(page, testInfo, {
    "/ch/channelBasicInfo": {
      msg: "ok",
      channel_info: { ch_uuid: CH, ch_name: "launch", ch_is_member: true, ch_is_admin: false, ch_deleted_at: "0001-01-01T00:00:00Z", ch_member_count: 3 },
    },
  })
  await page.goto(`/app/channel/${CH}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
  const composer = page.locator("[contenteditable='true']").last()
  await expect(composer).toBeVisible({ timeout: 90_000 })
  await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => {})
  return composer
}

/** The page asks for a file of its code now, as a lazy part does. */
const askForCode = (page: Page) =>
  page.evaluate((src) => {
    const s = document.createElement("script")
    s.src = src
    document.head.appendChild(s)
  }, OLD_BUILD_FILE)

/**
 * Counts the page's reloads: each time it asks the server for its document again. Not framenavigated: that fires for
 * history.replaceState too, which Next's app router calls as it hydrates, so one reload counted twice (v64green1).
 */
function countReloads(page: Page) {
  const seen = { n: 0 }
  page.on("request", (r) => {
    if (r.isNavigationRequest() && r.frame() === page.mainFrame()) seen.n++
  })
  return seen
}

test.describe("a deploy since the page loaded", () => {
  test.use({ viewport: { width: 1280, height: 860 } })

  test("a file the server says is gone reloads the page once, onto the build it serves", async ({ page }, testInfo) => {
    test.setTimeout(180_000)
    const composer = await openChannel(page, testInfo)
    const reloads = countReloads(page)
    await askForCode(page)
    await expect.poll(() => reloads.n, { timeout: 20_000 }).toBe(1)
    await expect(composer).toBeVisible({ timeout: 90_000 })
    // The same failure again, within the guard: no loop.
    await askForCode(page)
    await page.waitForTimeout(6_000)
    expect(reloads.n).toBe(1)
  })
})

for (const [form, use] of [
  ["computer", { viewport: { width: 1280, height: 860 } }],
  ["phone", { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }],
] as const) {
  test.describe(`a chat composer while the network is dead (${form})`, () => {
    test.use(use)

    test("keeps what is typed: a file that fails then is the network, and the page stays", async ({ page }, testInfo) => {
      test.setTimeout(180_000)
      const composer = await openChannel(page, testInfo)
      const reloads = countReloads(page)
      const dead = (route: Route) => route.abort("internetdisconnected")
      await page.route("**/*", dead)
      expect(await page.evaluate(() => navigator.onLine), "the device still says it is online").toBe(true)
      if (form === "phone") await composer.tap()
      else await composer.click()
      await askForCode(page)
      await page.keyboard.type(WORDS, { delay: 15 })
      // Longer than the probe's 4 s.
      await page.waitForTimeout(6_000)
      expect(reloads.n, "the page never reloaded").toBe(0)
      await expect(composer).toContainText(WORDS)
      await page.unroute("**/*", dead)
    })
  })
}
