import { expect, test, type BrowserContextOptions, type Page, type Route } from "@playwright/test"
import { demoBuild } from "./demoBuild"
import { expectHomeSettled, reviewShot, SHOT_THEMES, stubBackend } from "./stubbedApp"

// The card that suggests adding OneCamp to the home screen
// (components/pwa/PwaInstallPrompt.tsx, FLUIDITY-13, 5 Nov 2026). The prompt
// listens on every page; the card itself comes in as a chunk of its own
// (components/pwa/pwaInstallCard.tsx), only once there is something to
// suggest, so no page's first load carries it. It asks a returning visitor on
// a phone or tablet: Install where the browser hands over its install prompt
// (beforeinstallprompt, faked here), and the Share steps on iOS, which never
// does.

const ANDROID_TABLET = "Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36"
const ANDROID_PHONE = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36"
const IPAD = "Mozilla/5.0 (iPad; CPU OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Mobile/15E148 Safari/604.1"
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Mobile/15E148 Safari/604.1"

const DEVICES = {
  "1280": { install: ANDROID_TABLET, ios: IPAD, use: { viewport: { width: 1280, height: 800 } } },
  "390 with touch": { install: ANDROID_PHONE, ios: IPHONE, use: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 } },
} satisfies Record<string, { install: string; ios: string; use: BrowserContextOptions }>

// Home's own reads, answered empty: the card is shown over Home as it settles, and a "Not found" toast is a layer too.
const HOME_READS = {
  "/activity/unified": { msg: "ok", data: null },
  "/user/assignedTaskList": { msg: "ok", data: null },
  "/event/getEvents": { msg: "ok", data: null },
  "/project/overview": { msg: "ok", data: { projects: [] } },
  "/ch/suggested": { msg: "ok", data: [] },
}

const TITLE = "Add OneCamp to your home screen"
const VISITS_KEY = "onecamp:pwa:visits"
const DISMISSED_KEY = "onecamp:pwa:dismissedAt"

/** A returning visitor: one visit before this one (this browser session counts as the second). */
async function returning(page: Page) {
  await page.addInitScript((key) => {
    try {
      if (!window.localStorage.getItem(key)) window.localStorage.setItem(key, "1")
    } catch {
      /* a frame with no storage */
    }
  }, VISITS_KEY)
}

/**
 * The demo never asks (pwaPromptKind: the visitor is judging the product, not
 * moving in), and its build bakes that in. To see what a customer's build
 * draws, the demo build's prompt is served with that one flag off: the prompt's
 * code is otherwise the build's own. A customer's build is served as it is.
 * Returns how many times the flag was switched, to check it was.
 */
async function asCustomersBuild(page: Page): Promise<() => number> {
  let switched = 0
  if (!demoBuild()) return () => 1
  // The prompt's env as the minifier writes it: `...standalone:<expr>,demo:!0,dismissedAt:...`.
  const flag = /(standalone:[^,]+,)demo:!0,(dismissedAt:)/g
  await page.route(/\/_next\/static\/chunks\/[^/]+\.js$/, async (route: Route) => {
    const response = await route.fetch().catch(() => null)
    if (!response) return route.continue().catch(() => undefined)
    const body = await response.text()
    // Switched only where it is found exactly once; anything else leaves switched() at 0, and the test says so.
    if (!body.includes(VISITS_KEY) || (body.match(flag)?.length ?? 0) !== 1) return route.fulfill({ response, body })
    switched++
    return route.fulfill({ response, body: body.replace(flag, "$1demo:!1,$2") })
  })
  return () => switched
}

/** The browser offers to install: a beforeinstallprompt whose prompt() is counted. */
async function offerInstall(page: Page) {
  return page.evaluate(() => {
    const offer = new Event("beforeinstallprompt", { cancelable: true }) as Event & { prompt: () => void; userChoice: Promise<unknown> }
    const w = window as unknown as { __prompted: number }
    w.__prompted = 0
    offer.prompt = () => void (w.__prompted += 1)
    offer.userChoice = Promise.resolve({ outcome: "accepted", platform: "web" })
    window.dispatchEvent(offer)
    // The prompt keeps the browser's own mini-infobar away.
    return offer.defaultPrevented
  })
}

const card = (page: Page) => page.locator("[data-corner-stack='left'] [data-corner-card]").filter({ hasText: TITLE })

for (const [device, { install, ios, use }] of Object.entries(DEVICES)) {
  test(`a returning visitor whose browser offers to install gets the card at ${device}: Install asks the browser, once, and the card goes`, async ({ browser }, testInfo) => {
    test.setTimeout(120_000)
    const context = await browser.newContext({ ...use, userAgent: install })
    const page = await context.newPage()
    await stubBackend(page, testInfo, HOME_READS)
    await returning(page)
    const switched = await asCustomersBuild(page)
    await page.goto("/app/home", { waitUntil: "domcontentloaded", timeout: 120_000 })
    await expectHomeSettled(page)
    // Nothing to suggest until the browser offers.
    await expect(card(page)).toHaveCount(0)

    expect(await offerInstall(page), "the offer's default (the browser's own infobar) is kept away").toBe(true)
    await expect(card(page)).toBeVisible({ timeout: 30_000 })
    expect(switched()).toBe(1)
    await expect(card(page).getByText("Opens like an app, with notifications.")).toBeVisible()
    await expect(card(page).getByRole("button", { name: "Not now" })).toBeVisible()
    // Inside the window, beside its edge.
    const box = (await card(page).boundingBox())!
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(use.viewport.width)
    expect(box.y + box.height).toBeLessThanOrEqual(use.viewport.height)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    for (const theme of SHOT_THEMES) {
      // Home's orbits turn for minutes on a computer, and a review shot waits for a still page.
      await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" })
      await reviewShot(page, "pwa-install", theme)
    }

    const press = card(page).getByRole("button", { name: "Install" })
    if (use.viewport.width < 768) await press.tap()
    else await press.click()
    await expect.poll(() => page.evaluate(() => (window as unknown as { __prompted: number }).__prompted)).toBe(1)
    await expect(card(page)).toHaveCount(0)
    await page.unrouteAll({ behavior: "ignoreErrors" })
    await context.close()
  })

  test(`Not now puts the card away at ${device}, and it stays away on the next page even when the browser offers again`, async ({ browser }, testInfo) => {
    test.setTimeout(120_000)
    const context = await browser.newContext({ ...use, userAgent: install })
    const page = await context.newPage()
    await stubBackend(page, testInfo, HOME_READS)
    await returning(page)
    await asCustomersBuild(page)
    await page.goto("/app/home", { waitUntil: "domcontentloaded", timeout: 120_000 })
    await expectHomeSettled(page)
    await offerInstall(page)
    await expect(card(page)).toBeVisible({ timeout: 30_000 })

    const notNow = card(page).getByRole("button", { name: "Not now" })
    if (use.viewport.width < 768) await notNow.tap()
    else await notNow.click()
    await expect(card(page)).toHaveCount(0)
    const at = Number(await page.evaluate((key) => window.localStorage.getItem(key), DISMISSED_KEY))
    expect(Date.now() - at).toBeLessThan(120_000)

    await page.reload({ waitUntil: "domcontentloaded", timeout: 120_000 })
    await expectHomeSettled(page)
    // Still a returning visitor: only the dismissal keeps it away.
    expect(Number(await page.evaluate((key) => window.localStorage.getItem(key), VISITS_KEY))).toBeGreaterThanOrEqual(2)
    await offerInstall(page)
    await page.waitForTimeout(1_000)
    await expect(card(page)).toHaveCount(0)
    await page.unrouteAll({ behavior: "ignoreErrors" })
    await context.close()
  })

  test(`a returning visitor on iOS, which never offers, gets the Share steps at ${device}`, async ({ browser }, testInfo) => {
    test.setTimeout(120_000)
    const context = await browser.newContext({ ...use, userAgent: ios })
    const page = await context.newPage()
    await stubBackend(page, testInfo, HOME_READS)
    await returning(page)
    const switched = await asCustomersBuild(page)
    await page.goto("/app/home", { waitUntil: "domcontentloaded", timeout: 120_000 })
    await expectHomeSettled(page)

    await expect(card(page)).toBeVisible({ timeout: 30_000 })
    expect(switched()).toBe(1)
    await expect(card(page)).toContainText("Tap Share, then Add to Home Screen.")
    await expect(card(page).locator("strong")).toHaveText("Add to Home Screen")
    await expect(card(page).getByRole("button", { name: "Install" })).toHaveCount(0)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    for (const theme of SHOT_THEMES) {
      // Home's orbits turn for minutes on a computer, and a review shot waits for a still page.
      await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" })
      await reviewShot(page, "pwa-ios-steps", theme)
    }

    const notNow = card(page).getByRole("button", { name: "Not now" })
    if (use.viewport.width < 768) await notNow.tap()
    else await notNow.click()
    await expect(card(page)).toHaveCount(0)
    await page.unrouteAll({ behavior: "ignoreErrors" })
    await context.close()
  })
}

// The card's words and buttons come in a chunk of their own; when that code
// can't come (the network dropped), no card is left with only its logo.
test("a card whose words can't come shows nothing, not a logo alone, at 390 with touch", async ({ browser }, testInfo) => {
  test.setTimeout(120_000)
  const context = await browser.newContext({ ...DEVICES["390 with touch"].use, userAgent: ANDROID_PHONE })
  const page = await context.newPage()
  await stubBackend(page, testInfo, HOME_READS)
  await returning(page)
  await asCustomersBuild(page)
  let dropped = 0
  // Registered last, so it runs first: the chunk that carries the card's words never arrives.
  await page.route(/\/_next\/static\/chunks\/[^/]+\.js$/, async (route: Route) => {
    const response = await route.fetch().catch(() => null)
    if (response && (await response.text()).includes(TITLE)) {
      dropped++
      return route.abort("internetdisconnected")
    }
    return route.fallback()
  })
  await page.goto("/app/home", { waitUntil: "domcontentloaded", timeout: 120_000 })
  await expectHomeSettled(page)
  await offerInstall(page)
  await expect.poll(() => dropped, { timeout: 30_000 }).toBeGreaterThan(0)
  await page.waitForTimeout(1_000)
  await expect(page.locator("[data-corner-stack='left'] [data-corner-card]").filter({ has: page.locator("img[src*='logo.svg']") })).toHaveCount(0)
  await expect(card(page)).toHaveCount(0)
  await page.unrouteAll({ behavior: "ignoreErrors" })
  await context.close()
})

// A computer is never asked, offer or not, and no page's code carries the card:
// it is fetched only when there is something to suggest.
test("a computer is never asked, and no page fetches the card's code for it", async ({ browser }, testInfo) => {
  test.setTimeout(120_000)
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const page = await context.newPage()
  await stubBackend(page, testInfo, HOME_READS)
  await returning(page)
  const scripts: Array<Promise<string>> = []
  page.on("response", (r) => {
    if (/\/_next\/static\/chunks\/[^/]+\.js$/.test(r.url())) scripts.push(r.text().catch(() => ""))
  })
  await page.goto("/app/home", { waitUntil: "domcontentloaded", timeout: 120_000 })
  await expectHomeSettled(page)
  await offerInstall(page)
  await page.waitForTimeout(1_000)
  await expect(card(page)).toHaveCount(0)

  const bodies = await Promise.all(scripts)
  expect(bodies.some((b) => b.includes(VISITS_KEY)), "the prompt itself listens on the page").toBe(true)
  expect(bodies.filter((b) => b.includes(TITLE)).length, "a script that carries the card's words").toBe(0)
  await page.unrouteAll({ behavior: "ignoreErrors" })
  await context.close()
})
