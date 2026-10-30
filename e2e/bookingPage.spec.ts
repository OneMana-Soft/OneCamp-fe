import { expect, test, type Page, type TestInfo } from "@playwright/test"

import { stubBackend } from "./stubbedApp"
import { overlapping, reachesIn } from "./touchReach"

// The public booking page, signed out, against a stubbed server.
//   CAL-BUG-20: it built about 1,800 date formatters on load, for two time
//   zone pickers nobody had opened. It builds a handful, mounts one picker,
//   and builds the zone list when that opens.
//   CAL-BUG-15: the confirmation promised an invite that wasn't sent and hid
//   the cancel link once the email went out.
// The page opens on the visitor's month, and the slots below start the day
// after "today". Every test pins the page's clock to its own today and builds
// its slots from it, so no test reads the day the suite runs on. Unpinned,
// they all failed on Fri 30 and Sat 31 Oct 2026: no slot was left in October,
// and the month the page opened on said "No free times in October".

const SLUG = "sam-rivera"

/** Wed 21 Oct 2026, 10:00 where the suite runs (the browser takes the host's zone): October has slots after it. */
const NOW = new Date(2026, 9, 21, 10, 0)

/** Ten weekday slots from the day after `today`, at 10:00 and 10:30 local time, so each falls on the day it says in any zone. */
function slots(today: Date) {
  const out: { start: string; end: string }[] = []
  for (let i = 1; out.length < 10; i++) {
    const day = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i)
    if (day.getDay() === 0 || day.getDay() === 6) continue
    for (const m of [0, 30]) {
      const start = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 10, m)
      out.push({ start: start.toISOString(), end: new Date(start.getTime() + 30 * 60_000).toISOString() })
    }
  }
  return out
}

/** The page as the server answers it on `today`: its slots, and bookable for `days` more. */
const PAGE = (today: Date, days = 30) => ({
  slug: SLUG,
  title: "Intro call",
  description: "",
  duration_minutes: 30,
  owner_name: "Sam Rivera",
  owner_tz: "UTC",
  slots: slots(today),
  bookable_until: new Date(today.getTime() + days * 864e5).toISOString(),
})

/** Pins the page's clock to `today`, and stubs the server with the page as it answers then. */
async function stubAt(page: Page, testInfo: TestInfo, today: Date, data = PAGE(today)) {
  await page.clock.setFixedTime(today)
  await stubBackend(page, testInfo, { [`/public/book/${SLUG}`]: { data } })
}

/** Counts every date formatter the page builds, from its first script on. */
async function countFormatters(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __dtf: number }
    w.__dtf = 0
    const Real = Intl.DateTimeFormat
    Intl.DateTimeFormat = new Proxy(Real, {
      construct(target, args) {
        w.__dtf++
        return Reflect.construct(target, args)
      },
      apply(target, self, args) {
        w.__dtf++
        return Reflect.apply(target, self, args)
      },
    })
  })
}

for (const [name, viewport] of [
  ["a phone", { width: 390, height: 844 }],
  ["a computer", { width: 1280, height: 900 }],
] as const) {
  test(`on ${name}, the page builds a handful of date formatters and one time zone picker`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport)
    await countFormatters(page)
    await stubAt(page, testInfo, NOW)
    await page.goto(`/book/${SLUG}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
    await expect(page.locator("[data-available]").first()).toBeVisible({ timeout: 30_000 })
    const onLoad = await page.evaluate(() => (window as unknown as { __dtf: number }).__dtf)
    expect(onLoad, `date formatters built on load: ${onLoad}`).toBeLessThan(40)
    const pickers = page.getByRole("button", { name: /^Time zone:/ })
    await expect(pickers).toHaveCount(1)
    await pickers.click()
    await expect(page.getByRole("listbox", { name: "Time zones" })).toBeVisible()
    expect(await page.evaluate(() => (window as unknown as { __dtf: number }).__dtf)).toBeGreaterThan(onLoad + 100)
  })
}

test("the confirmation says the invite was emailed, and keeps the cancel link", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  const app = new URL(String(testInfo.project.use.baseURL || "http://localhost:3001"))
  await stubAt(page, testInfo, NOW)
  // The booking itself: a POST to the page's address (the stub answers by path, so this comes first).
  await page.route(
    (url) => url.origin !== app.origin && url.pathname.endsWith(`/public/book/${SLUG}`),
    async (route) => {
      if (route.request().method() !== "POST") return route.fallback()
      const origin = route.request().headers()["origin"] || app.origin
      const body = route.request().postDataJSON() as { start: string }
      await route.fulfill({
        status: 200,
        headers: { "access-control-allow-origin": origin, "access-control-allow-credentials": "true" },
        json: {
          data: {
            title: "Intro call",
            owner_name: "Sam Rivera",
            start: body.start,
            end: new Date(new Date(body.start).getTime() + 30 * 60_000).toISOString(),
            cancel_token: "secret-token",
            booking_id: "b-123",
            emailed: true,
            owner_told: true,
          },
        },
      })
    },
  )
  await page.goto(`/book/${SLUG}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
  await page.locator("[data-available]").first().click({ timeout: 30_000 })
  await page.locator("[data-slot] button").first().click()
  await page.locator("[data-slot-next]").click()
  await page.getByLabel("Name").fill("Jordan")
  await page.getByLabel("Email").fill("jordan@example.com")
  await page.locator("[data-book-button]").click()
  const booked = page.locator("[data-booked]")
  await expect(booked).toContainText("We've emailed you the invite", { timeout: 30_000 })
  await expect(booked).not.toContainText("The invite is in your email")
  await expect(page.locator("[data-cancel-link]")).toContainText("To cancel, use the link in your email, or this one")
  await expect(page.locator("[data-cancel-link] a")).toHaveAttribute("href", /\/booking\/secret-token$/)
  await expect(page.getByRole("link", { name: "Add to calendar (.ics)" })).toBeVisible()
  await expect(page.getByRole("link", { name: "Google Calendar" })).toBeVisible()
})

// The days at a month's end that the unpinned suite failed on, and the 1st after them. The first slot is Mon 2 Nov
// 2026 from each of them.
for (const [when, today] of [
  ["the last weekday of a month", new Date(2026, 9, 30, 10, 0)], // Fri 30 Oct 2026: Sat 31 ends the month
  ["a Saturday at a month's end", new Date(2026, 9, 31, 10, 0)], // Sat 31 Oct 2026
] as const) {
  test(`on ${when}, the month says it has no free times, and its Next month opens on the first free day`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await stubAt(page, testInfo, today)
    await page.goto(`/book/${SLUG}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
    const month = page.getByRole("region", { name: "Pick a day" })
    const none = month.getByText("No free times in October")
    await expect(none).toBeVisible({ timeout: 30_000 })
    await expect(month.getByRole("heading", { level: 2 })).toHaveText("October 2026")
    await expect(month.locator("[data-available]")).toHaveCount(0)
    await none.getByRole("button", { name: "Next month" }).click()
    await expect(month.getByRole("heading", { level: 2 })).toHaveText("November 2026")
    await expect(month.locator("[data-available]").first()).toHaveAttribute("data-day", "2026-11-02")
  })
}

test("on the 1st, the page opens on its month and the first free day", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await stubAt(page, testInfo, new Date(2026, 10, 1, 10, 0)) // Sun 1 Nov 2026
  await page.goto(`/book/${SLUG}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
  const month = page.getByRole("region", { name: "Pick a day" })
  await expect(month.locator("[data-available]").first()).toHaveAttribute("data-day", "2026-11-02", { timeout: 30_000 })
  await expect(month.getByRole("heading", { level: 2 })).toHaveText("November 2026")
  await expect(month.getByText(/^No free times/)).toHaveCount(0)
})

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })

  // REVIEW-FE-SHELL (15 Oct 2026): the month arrows sat 2px apart and each
  // one's reach under a finger (app/phone.css F3) ran over the other's edge,
  // so a tap 23-27px into Previous month went to Next month. A row of small
  // controls is a touch group now (F3b), its controls far enough apart.
  test("a tap on the edge of Previous month goes back a month", async ({ page }, testInfo) => {
    test.setTimeout(120_000)
    // Bookable for 70 days, so Next has a month to go to.
    await stubAt(page, testInfo, NOW, PAGE(NOW, 70))
    await page.goto(`/book/${SLUG}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
    await expect(page.locator("[data-available]").first()).toBeVisible({ timeout: 30_000 })
    const month = page.getByRole("region", { name: "Pick a day" })
    expect(overlapping(await reachesIn(page, 'section[aria-label="Pick a day"] [data-touch-group]'))).toEqual([])
    const heading = month.getByRole("heading", { level: 2 })
    const first = (await heading.textContent())!.trim()
    await month.getByRole("button", { name: "Next month" }).tap()
    await expect(heading).not.toHaveText(first)
    const previous = (await month.getByRole("button", { name: "Previous month" }).boundingBox())!
    // 3px inside its right edge, where Next's reach used to cover it.
    await page.touchscreen.tap(previous.x + previous.width - 3, previous.y + previous.height / 2)
    await expect(heading).toHaveText(first)
  })
})
