import { expect, test, type Page, type Request, type TestInfo } from "@playwright/test"

import { scrollsInItsBody } from "./sheetLayout"
import { SAM, SHOT_THEMES, reviewShot, stubBackend, withStatus } from "./stubbedApp"

// Calendar B8: a calendar by its address. The Calendars panel subscribes to
// India's public holidays in one press; the calendar is yours under My
// calendars, and its events show with yours, read only: the card names the
// calendar and offers no edit. An address that isn't a calendar says why.
// With SHOTS_DIR set, each state is saved for review.

const NOW = new Date(2026, 10, 5, 10, 0)
const HOLIDAYS = { id: "cal-hol", name: "Holidays in India", kind: "subscribed", access: "view", mine: true }
const DIWALI = {
  event_uuid: "0b8a3c1e-1d2f-4a5b-8c7d-9e0f1a2b3c99",
  event_title: "Diwali",
  event_start_time: "2026-11-08T00:00:00Z",
  event_end_time: "2026-11-09T00:00:00Z",
  event_all_day: true,
  event_start_date: "2026-11-08",
  event_end_date: "2026-11-09",
  event_created_by: SAM,
  event_calendar_id: "cal-hol",
  event_read_only: true,
}

async function open(page: Page, testInfo: TestInfo) {
  const posts: { address?: string; name?: string }[] = []
  let subscribed = false
  await page.clock.setFixedTime(NOW)
  await stubBackend(page, testInfo, {
    "/event/getEvents": () => ({ msg: "ok", data: subscribed ? [DIWALI] : [] }),
    "/integration/google-calendar/status": { msg: "ok", data: { isConnected: false } },
    "/user/assignedTaskList": { msg: "ok", data: { user_tasks: [] } },
    "/event/bookingPages": { msg: "ok", data: [] },
    "/calendar/calendars/events": { msg: "ok", data: [], truncated: false },
    "/calendar/subscriptions": (_url: URL, request: Request) => {
      if (request.method() === "POST") {
        const body = request.postDataJSON() as { address?: string; name?: string }
        posts.push(body)
        if (!body.address?.includes("holiday")) return withStatus(400, { msg: "There's no calendar at that address. Check it, or copy it again from where it's published." })
        subscribed = true
        return { msg: "ok", data: { calendar_id: "cal-hol", name: "Holidays in India", host: "calendar.google.com", reading: false, events: 42 } }
      }
      return { msg: "ok", data: subscribed ? [{ calendar_id: "cal-hol", name: "Holidays in India", host: "calendar.google.com", read_at: NOW.toISOString() }] : [] }
    },
    "/calendar/calendars": () => ({ msg: "ok", data: [{ id: "cal-me", name: "Personal", kind: "personal", access: "manage", mine: true }, ...(subscribed ? [HOLIDAYS] : [])] }),
  })
  await page.goto("/app/calendar?date=2026-11-05&view=week", { waitUntil: "domcontentloaded", timeout: 120_000 })
  await expect(page.locator("[data-period]")).toBeVisible({ timeout: 240_000 })
  return posts
}

async function shot(page: Page, name: string, theme: string) {
  const dir = process.env.SHOTS_DIR
  if (!dir) return
  await page.waitForTimeout(450)
  await page.screenshot({ path: `${dir}/${name}-${page.viewportSize()?.width}-${theme}.png` })
}

/** The Add a calendar dialog, from the Calendars panel, or a phone's calendar options. */
async function subscribeDialog(page: Page, phone = false) {
  if (phone) {
    await page.getByRole("button", { name: "Calendar options" }).click({ timeout: 60_000 })
    await page.getByRole("button", { name: "Subscribe to a calendar" }).click()
  } else {
    await page.getByRole("button", { name: /^Calendars/ }).click()
    await page.locator("[data-calendars-panel]").getByRole("button", { name: "Subscribe to a calendar" }).click()
  }
  return page.locator("[data-subscribe-dialog]")
}

for (const theme of ["light", "dark"] as const) {
  test.describe(`a calendar by its address at 1280, ${theme}`, () => {
    test.use({ viewport: { width: 1280, height: 900 }, colorScheme: theme })

    test("India's public holidays in one press, read only on the week", async ({ page }, testInfo) => {
      test.setTimeout(420_000)
      const posts = await open(page, testInfo)
      const dialog = await subscribeDialog(page)
      await expect(dialog.getByRole("heading", { name: "Add a calendar" })).toBeVisible()
      // The field's label names its select (DESIGN-BUILD-14's M1).
      await expect(dialog.getByRole("combobox", { name: "Country" })).toContainText("India")
      await shot(page, "b8s-add", theme)
      await dialog.getByRole("button", { name: "Add calendar" }).click()
      await expect(dialog).toHaveCount(0, { timeout: 20_000 })
      expect(posts[0].address).toContain("en.indian%23holiday")
      await page.getByRole("button", { name: /^Calendars/ }).click()
      const row = page.locator("[data-calendars-panel] [data-calendar-row='cal-hol']")
      await expect(row.getByRole("checkbox", { name: "Holidays in India" })).toBeVisible({ timeout: 20_000 })
      await shot(page, "b8s-panel", theme)
      await page.keyboard.press("Escape")
      await page.goto("/app/calendar?date=2026-11-08&view=week", { waitUntil: "domcontentloaded", timeout: 120_000 })
      const diwali = page.locator(`[data-event-uuid="${DIWALI.event_uuid}"]`).first()
      await expect(diwali).toBeVisible({ timeout: 60_000 })
      await diwali.click()
      const card = page.getByRole("dialog", { name: "Diwali" })
      await expect(card).toContainText("Holidays in India")
      await expect(card.getByRole("button", { name: "Edit event" })).toHaveCount(0)
      await expect(card).not.toContainText("Organised by")
      await shot(page, "b8s-card", theme)
    })
  })
}

test.describe("a calendar by its address on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: "light" })
  test("the calendar options subscribe to one", async ({ page }, testInfo) => {
    test.setTimeout(420_000)
    const posts = await open(page, testInfo)
    const dialog = await subscribeDialog(page, true)
    await expect(dialog.getByRole("button", { name: "Add calendar" })).toBeVisible()
    const width = await page.evaluate(() => document.documentElement.scrollWidth)
    expect(width).toBeLessThanOrEqual(390)
    await shot(page, "b8s-add-phone", "light")
    await dialog.getByRole("button", { name: "Add calendar" }).click()
    await expect(dialog).toHaveCount(0, { timeout: 20_000 })
    expect(posts[0].address).toContain("en.indian%23holiday")
  })
})

test.describe("an address that isn't a calendar", () => {
  test.use({ viewport: { width: 1280, height: 900 }, colorScheme: "light" })
  test("says why, and adds nothing", async ({ page }, testInfo) => {
    test.setTimeout(420_000)
    await open(page, testInfo)
    const dialog = await subscribeDialog(page)
    await dialog.getByRole("radio", { name: "By its address" }).click()
    await dialog.getByRole("textbox", { name: "Address" }).fill("https://calendar.example/nope.ics")
    await dialog.getByRole("button", { name: "Add calendar" }).click()
    await expect(dialog.getByText("There's no calendar at that address. Check it, or copy it again from where it's published.")).toBeVisible()
    await expect(dialog.getByRole("textbox", { name: "Address" })).toHaveAttribute("aria-invalid", "true")
    await shot(page, "b8s-error", "light")
  })
})

// A short screen, an address refused: the dialog scrolls in its body, and its title, its close and its actions
// stay put.
for (const theme of SHOT_THEMES) {
  for (const phone of [false, true]) {
    test.describe(`adding a calendar on a short screen ${phone ? "on a phone" : "at 1280"}, ${theme}`, () => {
      test.use(phone ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: theme } : { viewport: { width: 1280, height: 900 }, colorScheme: theme })
      test("scrolls in its body, its title, close and actions in place", async ({ page }, testInfo) => {
        test.setTimeout(420_000)
        await open(page, testInfo)
        const dialog = await subscribeDialog(page, phone)
        await dialog.getByRole("radio", { name: "By its address" }).click()
        await dialog.getByRole("textbox", { name: "Address" }).fill("https://calendar.example/nope.ics")
        await dialog.getByRole("button", { name: "Add calendar" }).click()
        await expect(dialog.getByText("There's no calendar at that address. Check it, or copy it again from where it's published.")).toBeVisible()
        await reviewShot(page, "c5d-subscribe-refused", theme)
        await scrollsInItsBody(page, dialog)
        await reviewShot(page, "c5d-subscribe-end", theme)
      })
    })
  }
}
