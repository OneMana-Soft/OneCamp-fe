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
  await expect(page.locator("[data-cancel-link]")).toContainText("To change or cancel, use the link in your email, or this one")
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

// gcal-7: a guest moves their booking from its link (/booking/<token>), to one
// of the page's own free times, on a phone with a finger and on a computer.
// With SHOTS_DIR set, each state is saved as booking-move-<width>-<state>.png.
const TOKEN = "secret-token"
const MOVE_TOO_OFTEN = "This booking has been moved too often today. Try again tomorrow."

/** The booking as its link shows it: tomorrow 11:00, local time, on the page `SLUG`. */
function bookingView(today: Date, extra: Record<string, unknown> = {}) {
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1, 11, 0)
  return {
    booking_id: "b-123",
    title: "Intro call",
    owner_name: "Sam Rivera",
    start: start.toISOString(),
    end: new Date(start.getTime() + 30 * 60_000).toISOString(),
    cancelled: false,
    slug: SLUG,
    page_live: true,
    ...extra,
  }
}

/** Stubs the booking, the page's times, and the move itself (answered by `answer`); returns the moves' bodies. */
async function stubBooking(page: Page, testInfo: TestInfo, answer: (start: string) => { status: number; json: unknown }, view = bookingView(NOW)) {
  const app = new URL(String(testInfo.project.use.baseURL || "http://localhost:3001"))
  await page.clock.setFixedTime(NOW)
  await stubBackend(page, testInfo, { [`/public/book/${SLUG}`]: { data: PAGE(NOW) }, [`/public/booking/${TOKEN}`]: { data: view } })
  const moves: { start: string }[] = []
  await page.route(
    (url) => url.origin !== app.origin && url.pathname.endsWith(`/public/booking/${TOKEN}/reschedule`),
    async (route) => {
      if (route.request().method() !== "POST") return route.fallback()
      const origin = route.request().headers()["origin"] || app.origin
      const body = route.request().postDataJSON() as { start: string }
      moves.push(body)
      const { status, json } = answer(body.start)
      await route.fulfill({ status, headers: { "access-control-allow-origin": origin, "access-control-allow-credentials": "true", "retry-after": "3600" }, json })
    },
  )
  return moves
}

async function moveShot(page: Page, width: number, state: string) {
  const dir = process.env.SHOTS_DIR
  if (!dir) return
  await page.waitForTimeout(400)
  await page.screenshot({ path: `${dir}/booking-move-${width}-${state}.png`, fullPage: true })
}

for (const [name, viewport, touch] of [
  ["a phone", { width: 390, height: 844 }, true],
  ["a computer", { width: 1280, height: 900 }, false],
] as const) {
  test.describe(`moving a booking on ${name}`, () => {
    test.use({ viewport, isMobile: touch, hasTouch: touch })
    const press = async (target: ReturnType<Page["locator"]>) => (touch ? target.tap() : target.click())

    test("picks another of the page's times on the page, and shows the new one with its calendar file", async ({ page }, testInfo) => {
      const moves = await stubBooking(page, testInfo, (start) => ({
        status: 200,
        json: { data: bookingView(NOW, { start, end: new Date(new Date(start).getTime() + 30 * 60_000).toISOString(), owner_told: true }) },
      }))
      await page.goto(`/booking/${TOKEN}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
      const ticket = page.locator("[data-ticket]")
      await expect(ticket).toContainText("11:00", { timeout: 30_000 })
      await moveShot(page, viewport.width, "1-booking")
      await press(page.getByRole("button", { name: "Change time" }))
      await expect(page.getByRole("region", { name: "Pick a day" })).toBeVisible({ timeout: 30_000 })
      await expect(page.getByRole("dialog")).toHaveCount(0)
      await press(page.locator("[data-available]").first())
      await press(page.locator("[data-slot] button").nth(1))
      await moveShot(page, viewport.width, "2-picker")
      await press(page.locator("[data-slot-next]"))
      await expect(page.locator("[data-moved-line]")).toHaveText("Sam has been told.", { timeout: 30_000 })
      expect(moves).toEqual([{ start: PAGE(NOW).slots[1].start }])
      await expect(ticket).toContainText("10:30")
      await expect(ticket).not.toContainText("11:30")
      await expect(page.getByRole("link", { name: "Add to calendar (.ics)" })).toBeVisible()
      await expect(page.getByRole("button", { name: "Cancel booking" })).toBeVisible()
      expect(new URL(page.url()).pathname).toBe(`/booking/${TOKEN}`)
      expect(new URL(page.url()).search).toBe("")
      const width = await page.evaluate(() => document.documentElement.scrollWidth)
      expect(width).toBeLessThanOrEqual(viewport.width)
      await moveShot(page, viewport.width, "3-moved")
    })

    test("keeps the time: Keep this time closes the times, brings back Change time and Cancel booking, and moves nothing", async ({ page }, testInfo) => {
      const moves = await stubBooking(page, testInfo, () => ({ status: 200, json: {} }))
      await page.goto(`/booking/${TOKEN}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
      const ticket = page.locator("[data-ticket]")
      await expect(ticket).toContainText("11:00", { timeout: 30_000 })
      await press(page.getByRole("button", { name: "Change time" }))
      await expect(page.getByRole("region", { name: "Pick a day" })).toBeVisible({ timeout: 30_000 })
      const keep = page.getByRole("button", { name: "Keep this time" })
      await expect(keep).toBeVisible()
      await moveShot(page, viewport.width, "6-keep")
      // A thumb's target on a phone: the row's buttons are 44 px there, and stay even.
      const tall = async (name: string) => (await page.getByRole("button", { name }).boundingBox())!.height
      if (touch) expect(await tall("Keep this time")).toBeGreaterThanOrEqual(44)
      await press(keep)
      await expect(page.getByRole("region", { name: "Change time" })).toHaveCount(0)
      await expect(page.getByRole("button", { name: "Change time" })).toBeVisible()
      await expect(page.getByRole("button", { name: "Cancel booking" })).toBeVisible()
      if (touch) for (const name of ["Change time", "Cancel booking"]) expect(await tall(name)).toBeGreaterThanOrEqual(44)
      await expect(ticket).toContainText("11:00")
      expect(moves).toEqual([])
    })

    test("says the server's words when moved too often, and still cancels", async ({ page }, testInfo) => {
      await stubBooking(page, testInfo, () => ({ status: 429, json: { msg: MOVE_TOO_OFTEN } }))
      await page.goto(`/booking/${TOKEN}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
      await press(page.getByRole("button", { name: "Change time" }))
      await press(page.locator("[data-available]").first())
      await press(page.locator("[data-slot] button").first())
      await press(page.locator("[data-slot-next]"))
      // Inside the page's main: Next's route announcer is an alert of its own.
      await expect(page.getByRole("main").getByRole("alert")).toHaveText(MOVE_TOO_OFTEN, { timeout: 30_000 })
      await expect(page.locator("[data-ticket]")).toContainText("11:00")
      await expect(page.getByRole("region", { name: "Pick a day" })).toHaveCount(0)
      await moveShot(page, viewport.width, "4-too-often")
      await press(page.getByRole("button", { name: "Cancel booking" }))
      await expect(page.getByText("Cancel this meeting?")).toBeVisible()
    })

    test("offers no change on a cancelled booking", async ({ page }, testInfo) => {
      await stubBooking(page, testInfo, () => ({ status: 200, json: {} }), bookingView(NOW, { cancelled: true }))
      await page.goto(`/booking/${TOKEN}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
      await expect(page.locator("[data-cancelled-line]")).toHaveText("This meeting is cancelled.", { timeout: 30_000 })
      await expect(page.getByRole("button", { name: "Change time" })).toHaveCount(0)
      await moveShot(page, viewport.width, "5-cancelled")
    })
  })
}
