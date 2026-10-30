import { expect, test, type Page, type Request, type TestInfo } from "@playwright/test"

import { SAM, stubBackend } from "./stubbedApp"

// Calendar A3: your time zone, the day your week starts and your working
// hours in settings, saved as each changes; the week drawing them; Find a
// time's ranked times, a time only some can meet saying why; and the event
// form saying when a time is outside a guest's hours. With SHOTS_DIR set,
// each state is saved for review.

// The zone every test here runs in, pinned for the browser (timezoneId) and the
// account (its zone) alike, never read from the runner: CI runs in UTC, a laptop
// in IST, and the hours below are this zone's (+05:30 all year). India's zone by
// the name Chromium reports for it (ICU's id; IANA's newer name is Asia/Kolkata):
// the app matches the account's zone to the browser's by name, and given
// "Asia/Kolkata" Chromium still says "Asia/Calcutta".
const ZONE = "Asia/Calcutta"
const at = (day: number, h: number, m = 0) =>
  new Date(`2026-10-${String(day).padStart(2, "0")}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00+05:30`)
const NOW = at(21, 10)
const MAYA = { user_uuid: "5e1f0000-0000-4000-8000-0000000000a2", user_name: "Maya Chen", user_full_name: "Maya Chen" }

async function open(page: Page, testInfo: TestInfo, path: string, prefs: Record<string, unknown>) {
  const puts: { key: string; value: unknown }[] = []
  await page.clock.setFixedTime(NOW)
  await stubBackend(page, testInfo, {
    "/user/preferences": (url: URL, request: Request) => {
      if (request.method() === "PUT") {
        const key = decodeURIComponent(url.pathname.split("/").pop() ?? "")
        const value = (request.postDataJSON() as { value: unknown }).value
        puts.push({ key, value })
        prefs[key] = value
        return { status: "success" }
      }
      return { msg: "ok", data: prefs }
    },
    "/event/getEvents": { msg: "ok", data: [] },
    "/event/hours": { msg: "ok", data: { [MAYA.user_uuid]: { tz: "America/Los_Angeles", week: { "1": [{ start: "09:00", end: "17:00" }], "2": [{ start: "09:00", end: "17:00" }], "3": [{ start: "09:00", end: "17:00" }], "4": [{ start: "09:00", end: "17:00" }], "5": [{ start: "09:00", end: "17:00" }] } } } },
    "/event/suggestTimes": {
      msg: "ok",
      data: {
        suggestions: [
          { start: at(22, 10, 0).toISOString(), end: at(22, 10, 30).toISOString(), free: [SAM.user_uuid, MAYA.user_uuid], reason: "Everyone's free" },
          { start: at(22, 11, 0).toISOString(), end: at(22, 11, 30).toISOString(), free: [SAM.user_uuid, MAYA.user_uuid], reason: "Everyone's free" },
          { start: at(22, 16, 0).toISOString(), end: at(22, 16, 30).toISOString(), free: [SAM.user_uuid], away: [MAYA.user_uuid], reason: "1 of 2 free · outside Maya's hours" },
        ],
      },
    },
    "/user/searchUserAndChannelList": { msg: "ok", data: [MAYA] },
    "/integration/google-calendar/status": { msg: "ok", data: { isConnected: false } },
    "/user/assignedTaskList": { msg: "ok", data: { user_tasks: [] } },
    "/event/bookingPages": { msg: "ok", data: [] },
  })
  page.on("response", (r) => {
    if (r.status() === 404) console.log(`UNSTUBBED ${r.request().method()} ${new URL(r.url()).pathname}`)
  })
  await page.goto(path, { waitUntil: "domcontentloaded", timeout: 120_000 })
  return puts
}

async function shot(page: Page, name: string, theme: string) {
  const dir = process.env.SHOTS_DIR
  if (!dir) return
  await expect(page.getByText("Not in this test")).toHaveCount(0)
  await page.waitForTimeout(450)
  await page.screenshot({ path: `${dir}/${name}-${page.viewportSize()?.width}-${theme}.png` })
}

test.use({ timezoneId: ZONE })

for (const theme of ["light", "dark"] as const) {
  test.describe(`working hours at 1280, ${theme}`, () => {
    test.use({ viewport: { width: 1280, height: 900 }, colorScheme: theme })

    test("settings suggest the zone in one line, and keep hours as they change", async ({ page }, testInfo) => {
      test.setTimeout(180_000)
      const puts = await open(page, testInfo, "/app/settings/profile", { zone: null, week_start: 1, clock: "auto", "calendar.working_hours": null, "calendar.default_length": 60 })
      const section = page.locator("[data-working-hours]")
      await expect(section).toBeVisible({ timeout: 60_000 })
      await section.scrollIntoViewIfNeeded()
      await shot(page, "hours-unset", theme)
      await section.getByRole("button", { name: "Use it" }).click()
      await expect.poll(() => puts.find((p) => p.key === "zone")?.value).toBe(ZONE)
      await section.getByRole("switch", { name: /Set working hours/ }).click()
      await expect.poll(() => Object.keys((puts.find((p) => p.key === "calendar.working_hours")?.value ?? {}) as object)).toEqual(["1", "2", "3", "4", "5"])
      await expect(section.locator("[data-hours-day]")).toHaveCount(7)
      await shot(page, "hours-set", theme)
    })

    test("the week draws your hours", async ({ page }, testInfo) => {
      test.setTimeout(180_000)
      await open(page, testInfo, "/app/calendar?date=2026-10-21&view=week", { zone: ZONE, week_start: 1, clock: "auto", "calendar.working_hours": { "1": [{ start: "08:00", end: "12:00" }, { start: "13:00", end: "16:00" }], "3": [{ start: "08:00", end: "16:00" }] }, "calendar.default_length": 60 })
      const monday = page.locator('[data-day-col="0"]')
      await expect(monday).toBeVisible({ timeout: 60_000 })
      // Monday: before 8, lunch, after 16. Tuesday: off all day.
      await expect(monday.locator("[data-off-hours]")).toHaveCount(3)
      await expect(page.locator('[data-day-col="1"] [data-off-hours]')).toHaveCount(1)
      await shot(page, "week-hours", theme)
    })

    // Calendar head 6 (gcal-3): up to two zones beside yours, a column each.
    test("settings keep other zones beside yours, each with a name", async ({ page }, testInfo) => {
      test.setTimeout(180_000)
      const puts = await open(page, testInfo, "/app/settings/profile", { zone: ZONE, week_start: 1, clock: "auto", "calendar.working_hours": null, "calendar.zones": [] })
      const zones = page.locator("[data-other-zones]")
      await expect(zones).toBeVisible({ timeout: 60_000 })
      await zones.scrollIntoViewIfNeeded()
      await zones.getByRole("button", { name: "Add a time zone" }).click()
      await page.getByRole("textbox", { name: "Search time zones" }).fill("Tokyo")
      await page.getByRole("option", { name: /Tokyo/ }).first().click()
      await expect.poll(() => puts.at(-1)).toEqual({ key: "calendar.zones", value: [{ zone: "Asia/Tokyo" }] })
      const name = zones.getByRole("textbox", { name: "Name for Tokyo" })
      await name.fill("Tokyo office")
      await name.press("Enter")
      await expect.poll(() => puts.at(-1)).toEqual({ key: "calendar.zones", value: [{ zone: "Asia/Tokyo", label: "Tokyo office" }] })
      await shot(page, "zones-settings", theme)
    })

    test.describe("read in London", () => {
      test.use({ timezoneId: "Europe/London" })

      test("the week shows the zones you keep beside yours, each with its name", async ({ page }, testInfo) => {
        test.setTimeout(180_000)
        await open(page, testInfo, "/app/calendar?date=2026-10-21&view=week", { zone: "Europe/London", week_start: 1, clock: "auto", "calendar.working_hours": null, "calendar.zones": [{ zone: "America/New_York", label: "NYC office" }, { zone: "Asia/Tokyo" }] })
        const ny = page.locator('[data-zone-hours="America/New_York"]')
        await expect(ny).toBeVisible({ timeout: 60_000 })
        // 9 AM in London on Wednesday 21 October is 4 AM in New York and 5 PM in Tokyo.
        await expect(ny.locator(":scope > div").nth(9)).toHaveText("4am")
        await expect(page.locator('[data-zone-hours="Asia/Tokyo"] > div').nth(9)).toHaveText("5pm")
        await expect(page.locator("[data-zone-name]")).toHaveText(["NYC office", "Tokyo", "London"])
        await shot(page, "week-zones", theme)
      })
    })

    test("Find a time says why a time suits only some, and the form says when it's outside a guest's hours", async ({ page }, testInfo) => {
      test.setTimeout(180_000)
      await open(page, testInfo, "/app/calendar?date=2026-10-21&view=week", { zone: ZONE, week_start: 1, clock: "auto", "calendar.working_hours": null, "calendar.default_length": 60 })
      await page.locator("[data-new-event]").click()
      const dialog = page.locator("[data-event-dialog]")
      await dialog.getByRole("textbox", { name: "Title" }).fill("Pricing walkthrough")
      await dialog.getByRole("combobox", { name: "Guests" }).fill("Maya")
      await page.getByRole("option", { name: "Maya Chen" }).click()
      const partial = dialog.locator("[data-partial]")
      await expect(partial).toHaveCount(1, { timeout: 20_000 })
      await expect(partial).toHaveAttribute("title", "1 of 2 free · outside Maya's hours")
      await dialog.locator("[data-find-time]").scrollIntoViewIfNeeded()
      await shot(page, "find-time-ranked", theme)
      await partial.click()
      await expect(dialog.locator("[data-outside-hours]")).toContainText("outside their working hours")
      await expect(dialog.locator("[data-guest-times]")).toContainText("for Maya (Los Angeles)")
      await dialog.locator("[data-outside-hours]").scrollIntoViewIfNeeded()
      await shot(page, "form-outside-hours", theme)
    })
  })
}

// Calendar A3b: the clock kept on the account, and booking pages from your hours.
test.describe("the account's clock and booking hours at 1280", () => {
  test.use({ viewport: { width: 1280, height: 900 }, colorScheme: "light", locale: "en-US" })

  test("a 24-hour clock kept on the account writes the week's hours that way, over the browser's", async ({ page }, testInfo) => {
    test.setTimeout(180_000)
    const prefs = { zone: ZONE, week_start: 1, clock: "auto", "calendar.working_hours": null, "calendar.default_length": 60 }
    const puts = await open(page, testInfo, "/app/settings/profile", prefs)
    const section = page.locator("[data-working-hours]")
    await expect(section).toBeVisible({ timeout: 60_000 })
    const clock = section.getByRole("radiogroup", { name: /Clock/ })
    await clock.scrollIntoViewIfNeeded()
    await clock.getByRole("radio", { name: "24-hour" }).click()
    await expect.poll(() => puts.find((p) => p.key === "clock")?.value).toBe("24")
    await shot(page, "clock-24", "light")
    await page.goto("/app/calendar?date=2026-10-21&view=week", { waitUntil: "domcontentloaded", timeout: 120_000 })
    await expect(page.locator('[data-day-col="0"]')).toBeVisible({ timeout: 60_000 })
    await expect(page.getByText("15:00", { exact: true }).first()).toBeVisible()
    await expect(page.getByText("3 PM", { exact: true })).toHaveCount(0)
    await shot(page, "week-24", "light")
  })

  test("a new booking page starts from your working days and hours", async ({ page }, testInfo) => {
    test.setTimeout(180_000)
    await open(page, testInfo, "/app/calendar/booking", { zone: ZONE, week_start: 1, clock: "auto", "calendar.working_hours": { "2": [{ start: "10:00", end: "12:00" }, { start: "13:00", end: "18:00" }], "4": [{ start: "10:00", end: "16:00" }] }, "calendar.default_length": 60 })
    await page.getByRole("button", { name: /New booking page/ }).click({ timeout: 60_000 })
    const days = page.getByRole("group", { name: "Days" })
    await expect(days.locator('[aria-pressed="true"]')).toHaveText(["Tue", "Thu"])
    await expect(page.locator("[data-booking-preview]")).toContainText("10:00")
    // The zone as people know it, never its database name ("Asia/Calcutta").
    await expect(page.locator("[data-booking-preview]")).not.toContainText(ZONE)
    await expect(page.getByRole("combobox", { name: "Time zone" })).not.toContainText(ZONE)
    await shot(page, "booking-from-hours", "light")
  })
})

test.describe("working hours on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: "light" })
  test("the settings fit a phone", async ({ page }, testInfo) => {
    test.setTimeout(180_000)
    await open(page, testInfo, "/app/settings/profile", { zone: ZONE, week_start: 1, clock: "auto", "calendar.working_hours": { "1": [{ start: "09:00", end: "12:30" }, { start: "13:30", end: "17:00" }] }, "calendar.default_length": 60 })
    const section = page.locator("[data-working-hours]")
    await expect(section).toBeVisible({ timeout: 60_000 })
    await section.locator("[data-hours-week]").scrollIntoViewIfNeeded()
    const width = await page.evaluate(() => document.documentElement.scrollWidth)
    expect(width).toBeLessThanOrEqual(390)
    await shot(page, "hours-set", "light")
  })
})

// Calendar head 6 (gcal-3): a phone's day keeps the other zones' columns, and
// their settings fit, with nothing wider than the screen.
for (const theme of ["light", "dark"] as const) {
  test.describe(`other zones on a phone, ${theme}`, () => {
    // Read in Kolkata, where New York's and Tokyo's hours fall on the half hour ("12:30pm").
    test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: theme, timezoneId: "Asia/Kolkata" })
    test("the day shows them beside yours, and their settings fit", async ({ page }, testInfo) => {
      test.setTimeout(180_000)
      await open(page, testInfo, "/app/calendar?date=2026-10-21&view=day", { zone: ZONE, week_start: 1, clock: "auto", "calendar.working_hours": null, "calendar.zones": [{ zone: "America/New_York", label: "NYC" }, { zone: "Asia/Tokyo" }] })
      await expect(page.locator('[data-zone-hours="Asia/Tokyo"]')).toBeVisible({ timeout: 60_000 })
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
      // Each zone's hours stay in its own column: at 48 px "1:30pm" ran into Tokyo's "12:30pm".
      for (const zone of ["America/New_York", "Asia/Tokyo"]) {
        const column = (await page.locator(`[data-zone-hours="${zone}"]`).boundingBox())!
        for (const label of await page.locator(`[data-zone-hours="${zone}"] span`).all()) {
          const box = (await label.boundingBox())!
          expect(box.x >= column.x && box.x + box.width <= column.x + column.width, `${zone} ${await label.innerText()}`).toBe(true)
        }
      }
      // The empty day's note sits over the day, clear of the hours' columns.
      const note = (await page.locator("[data-calendar-blank]").boundingBox())!
      const hours = (await page.locator('[data-zone-hours="Asia/Tokyo"]').boundingBox())!
      expect(note.x).toBeGreaterThanOrEqual(hours.x + hours.width)
      await shot(page, "day-zones", theme)
      await page.goto("/app/settings/profile", { waitUntil: "domcontentloaded", timeout: 120_000 })
      const zones = page.locator("[data-other-zones]")
      await expect(zones).toBeVisible({ timeout: 60_000 })
      await zones.scrollIntoViewIfNeeded()
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
      await shot(page, "zones-settings", theme)
    })
  })
}
