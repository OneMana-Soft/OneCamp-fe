import { expect, test, type Page } from "@playwright/test"

import { stubBackend } from "./stubbedApp"

// The public booking page, signed out, against a stubbed server.
//   CAL-BUG-20: it built about 1,800 date formatters on load, for two time
//   zone pickers nobody had opened. It builds a handful, mounts one picker,
//   and builds the zone list when that opens.
//   CAL-BUG-15: the confirmation promised an invite that wasn't sent and hid
//   the cancel link once the email went out.

const SLUG = "sam-rivera"

/** Ten weekday slots from tomorrow, 10:00 and 10:30 UTC. */
function slots() {
  const out: { start: string; end: string }[] = []
  const d = new Date()
  d.setUTCHours(0, 0, 0, 0)
  for (let i = 1; out.length < 10; i++) {
    const day = new Date(d.getTime() + i * 864e5)
    if (day.getUTCDay() === 0 || day.getUTCDay() === 6) continue
    for (const m of [600, 630]) {
      const start = new Date(day.getTime() + m * 60_000)
      out.push({ start: start.toISOString(), end: new Date(start.getTime() + 30 * 60_000).toISOString() })
    }
  }
  return out
}

const PAGE = () => ({
  slug: SLUG,
  title: "Intro call",
  description: "",
  duration_minutes: 30,
  owner_name: "Sam Rivera",
  owner_tz: "UTC",
  slots: slots(),
  bookable_until: new Date(Date.now() + 30 * 864e5).toISOString(),
})

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
    await stubBackend(page, testInfo, { [`/public/book/${SLUG}`]: { data: PAGE() } })
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
  await stubBackend(page, testInfo, { [`/public/book/${SLUG}`]: { data: PAGE() } })
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
