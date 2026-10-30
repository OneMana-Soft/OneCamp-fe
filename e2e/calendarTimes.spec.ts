import { expect, test, type Page, type TestInfo } from "@playwright/test"

import { SAM, stubBackend } from "./stubbedApp"

// The calendar's P1 design musts (DESIGN-BUILD-22/23, 27 Oct): event times
// read at full strength on their hue (they drew at 70-75 % and read
// 3.6-4.0:1), the draft block's label clears 4.5:1, and a multi-day event's
// chip keeps its title on one line beside its "From" ("Laun / ch..." broke
// inside the word). With SHOTS_DIR set, each view is saved for review.

const NOW = new Date(2026, 9, 21, 10, 0)
const at = (day: number, h: number, m = 0) => new Date(2026, 9, day, h, m).toISOString()
const REVIEW = "0b8a3c1e-1d2f-4a5b-8c7d-9e0f1a2b3c11"
const LAUNCH = "0b8a3c1e-1d2f-4a5b-8c7d-9e0f1a2b3c12"
const event = (event_uuid: string, event_title: string, event_start_time: string, event_end_time: string, event_hue?: string) => ({
  event_uuid,
  event_title,
  event_start_time,
  event_end_time,
  ...(event_hue ? { event_hue } : {}),
  event_created_by: SAM,
  event_participants: [],
})
const EVENTS = [
  event(REVIEW, "Launch review", at(21, 14), at(21, 15), "moss"),
  // A day and a half: on the all-day rail on both its days, "From 9:30 AM" and "Until 11:00 AM".
  event(LAUNCH, "Launch day", at(22, 9, 30), at(23, 11)),
  event("0b8a3c1e-1d2f-4a5b-8c7d-9e0f1a2b3c13", "Design crit", at(20, 11), at(20, 11, 45), "sky"),
]

async function open(page: Page, testInfo: TestInfo, path: string) {
  await page.clock.setFixedTime(NOW)
  await page.addInitScript(() => {
    try {
      localStorage.setItem("oc_keys_tip_seen", "1")
    } catch {
      /* storage blocked */
    }
  })
  await stubBackend(page, testInfo, {
    "/event/getEvents": { msg: "ok", data: EVENTS },
    "/calendar/events": { msg: "ok", data: [] },
    "/integration/google-calendar/status": { msg: "ok", data: { isConnected: false } },
    "/user/assignedTaskList": { msg: "ok", data: { user_tasks: [] } },
    "/config/client": { msg: "ok", data: { features: { calendar_repeats: true } } },
    "/event/bookingPages": { msg: "ok", data: [] },
  })
  await page.goto(path, { waitUntil: "domcontentloaded", timeout: 120_000 })
}

async function shot(page: Page, name: string, theme: string) {
  const dir = process.env.SHOTS_DIR
  if (!dir) return
  await expect(page.getByText("Not in this test")).toHaveCount(0)
  await page.waitForTimeout(450)
  await page.screenshot({ path: `${dir}/${name}-${page.viewportSize()?.width}-${theme}.png` })
}

const opacityOf = (el: Element) => getComputedStyle(el).opacity

for (const theme of ["light", "dark"] as const) {
  test.describe(`event times at 1280, ${theme}`, () => {
    test.use({ viewport: { width: 1280, height: 860 }, colorScheme: theme })

    test("the week's times read at full strength, and a multi-day chip keeps its title on one line", async ({ page }, testInfo) => {
      test.setTimeout(180_000)
      await open(page, testInfo, "/app/calendar?date=2026-10-21&view=week")
      const block = page.locator(`[data-day-col] [data-event-uuid="${REVIEW}"]`).first()
      await expect(block).toBeVisible({ timeout: 60_000 })
      expect(await block.locator(".cal-block-at, .cal-block-when").first().evaluate(opacityOf)).toBe("1")
      const chip = page.locator(`[data-all-day-rail] [data-event-uuid="${LAUNCH}"]`).first()
      await expect(chip).toContainText("From")
      expect(await chip.getByText("From", { exact: false }).first().evaluate(opacityOf)).toBe("1")
      const title = chip.getByText("Launch day")
      expect(await title.evaluate((el) => [getComputedStyle(el).whiteSpace, getComputedStyle(el).textOverflow])).toEqual(["nowrap", "ellipsis"])
      await shot(page, "week-times", theme)
    })

    test("the draft block's label, and the month's and the year's times", async ({ page }, testInfo) => {
      test.setTimeout(180_000)
      await open(page, testInfo, "/app/calendar?date=2026-10-21&view=week")
      await expect(page.locator(`[data-day-col] [data-event-uuid="${REVIEW}"]`).first()).toBeVisible({ timeout: 60_000 })
      // An empty slot on Thursday at 4 PM: the draft and its card.
      const col = page.locator('[data-day-col="3"]')
      const box = (await col.boundingBox())!
      await page.locator("[data-time-grid-scroll]").evaluate((el, y) => (el.scrollTop = y), (box.height / 24) * 12)
      const b = (await col.boundingBox())!
      await page.mouse.click(b.x + b.width / 2, b.y + (b.height / 24) * 16 + 4)
      await expect(page.locator("[data-calendar-ghost]")).toBeVisible({ timeout: 20_000 })
      await shot(page, "week-draft", theme)
      await page.keyboard.press("Escape")
      await page.goto("/app/calendar?date=2026-10-21&view=month", { waitUntil: "domcontentloaded", timeout: 120_000 })
      await expect(page.getByText("Launch review").first()).toBeVisible({ timeout: 60_000 })
      await shot(page, "month-times", theme)
      await page.goto("/app/calendar?date=2026-10-21&view=year", { waitUntil: "domcontentloaded", timeout: 120_000 })
      await expect(page.locator("[data-year]")).toBeVisible({ timeout: 60_000 })
      await shot(page, "year", theme)
    })
  })

  test.describe(`event times on a phone, ${theme}`, () => {
    test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: theme })

    test("the day's chip keeps its title on one line beside its From", async ({ page }, testInfo) => {
      test.setTimeout(180_000)
      await open(page, testInfo, "/app/calendar?date=2026-10-22&view=day")
      const chip = page.locator(`[data-all-day-rail] [data-event-uuid="${LAUNCH}"]`).first()
      await expect(chip).toBeVisible({ timeout: 60_000 })
      expect(await chip.getByText("Launch day").evaluate((el) => getComputedStyle(el).whiteSpace)).toBe("nowrap")
      await shot(page, "day-times", theme)
    })
  })
}
