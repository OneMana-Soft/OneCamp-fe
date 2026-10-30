import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test"

import { contrastRatio } from "../lib/color/oklch"
import { reviewShot, stubBackend } from "./stubbedApp"

// B1's Year (gcal-2; Google's, Y or 6): twelve months, each day shaded by how
// much is on it. A day opens its day, a month's name its month; hovering a
// day lists what is on it. With SHOTS_DIR set, the year is saved for review.

const NOW = new Date(2026, 9, 21, 10, 0)
const at = (m: number, d: number, h: number) => new Date(2026, m, d, h).toISOString()
const EVENTS = [
  ...[9, 11, 14, 16].map((h) => ({ event_uuid: `busy-${h}`, event_title: `Review ${h}`, event_start_time: at(9, 22, h), event_end_time: at(9, 22, h + 1) })),
  // A day of two, and the busiest kind of day: six.
  ...[9, 13].map((h) => ({ event_uuid: `pair-${h}`, event_title: `Sync ${h}`, event_start_time: at(9, 26, h), event_end_time: at(9, 26, h + 1) })),
  ...[8, 10, 12, 14, 16, 18].map((h) => ({ event_uuid: `full-${h}`, event_title: `Session ${h}`, event_start_time: at(9, 27, h), event_end_time: at(9, 27, h + 1) })),
  { event_uuid: "standup", event_title: "Standup", event_start_time: at(9, 21, 9), event_end_time: at(9, 21, 10) },
  { event_uuid: "away", event_title: "Leave", event_start_time: at(10, 3, 0), event_end_time: at(10, 4, 0), event_is_away: true },
]

async function open(page: Page, testInfo: TestInfo, at = "/app/calendar?date=2026-10-21&view=year") {
  await page.clock.setFixedTime(NOW)
  await stubBackend(page, testInfo, {
    "/event/getEvents": { msg: "ok", data: EVENTS },
    "/integration/google-calendar/status": { msg: "ok", data: { isConnected: false } },
    "/user/assignedTaskList": { msg: "ok", data: { user_tasks: [] } },
    "/event/bookingPages": { msg: "ok", data: [] },
    "/calendar/sync/google": { msg: "ok", data: { provider: "google", state: "none", progress: 0, moved: 0, unchanged: 0 } },
    "/calendar/calendars/events": { msg: "ok", data: [], truncated: false },
    "/calendar/calendars": { msg: "ok", data: [{ id: "cal-me", name: "Personal", kind: "personal", access: "manage", mine: true }] },
  })
  await page.goto(at, { waitUntil: "domcontentloaded", timeout: 120_000 })
  await expect(page.locator("[data-year]")).toBeVisible({ timeout: 240_000 })
}


/** A day's number on its shade, as a contrast ratio, once the shade has settled (a hover fades in). */
async function numberContrast(cell: Locator): Promise<number> {
  const { ink, ground } = await cell.evaluate(async (el) => {
    const shade = () => getComputedStyle(el).backgroundColor
    for (let last = shade(), i = 0; i < 120; i++) {
      await new Promise((r) => requestAnimationFrame(r))
      const now = shade()
      if (now === last) break
      last = now
    }
    // Painting the computed colour has the browser resolve it (color-mix too) to sRGB.
    const ctx = document.createElement("canvas").getContext("2d")!
    const rgb = (css: string) => {
      ctx.clearRect(0, 0, 1, 1)
      ctx.fillStyle = css
      ctx.fillRect(0, 0, 1, 1)
      const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data
      return { r, g, b }
    }
    return { ink: rgb(getComputedStyle(el).color), ground: rgb(shade()) }
  })
  return contrastRatio(ink, ground)
}

for (const theme of ["light", "dark"] as const) {
  test.describe(`the year at 1280, ${theme}`, () => {
    test.use({ viewport: { width: 1280, height: 900 }, colorScheme: theme })

    test("shades its days by what is on them, lists a day on hover, and opens it", async ({ page }, testInfo) => {
      test.setTimeout(300_000)
      await open(page, testInfo)
      await expect(page.locator("[data-year-month]")).toHaveCount(12)
      // As shown: the title's text also holds FitLabel's hidden measuring copies.
      await expect(page.locator("[data-period-title]")).toHaveText("2026", { useInnerText: true })
      const busy = page.locator('[data-year-day="2026-10-22"]')
      await expect(busy).toHaveAttribute("data-heat", "3")
      await expect(page.locator('[data-year-day="2026-10-21"]')).toHaveAttribute("data-heat", "1")
      await expect(page.locator('[data-year-day="2026-11-03"]')).toHaveAttribute("data-away", "true")
      // DESIGN-BUILD-22's must-fix (27 Oct): every shade's number reads at 4.5:1 or more, hovered too.
      for (const [day, heat] of [["2026-10-21", "1"], ["2026-10-26", "2"], ["2026-10-22", "3"], ["2026-10-27", "4"]] as const) {
        const cell = page.locator(`[data-year-day="${day}"]`)
        await expect(cell).toHaveAttribute("data-heat", heat)
        expect(await numberContrast(cell), `${day}'s number (heat ${heat})`).toBeGreaterThanOrEqual(4.5)
        await cell.hover()
        expect(await numberContrast(cell), `${day}'s number (heat ${heat}), hovered`).toBeGreaterThanOrEqual(4.5)
      }
      await page.locator('[data-year-day="2026-10-27"]').hover()
      await expect(page.locator("[data-year-card]")).toContainText("Session 8")
      await reviewShot(page, "year-busiest", theme)
      await busy.hover()
      await expect(page.locator("[data-year-card]")).toContainText("Review 9")
      await reviewShot(page, "year", theme)
      // No sideways scroll: the months wrap to the width.
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1280)
      await busy.click()
      await expect(page.locator("[data-period]")).toHaveAttribute("data-period", "day:2026-10-22")
      await page.keyboard.press("y")
      await expect(page.locator("[data-year]")).toBeVisible()
      // The month by its name alone: each of March's days is named "… March: …".
      await page.getByRole("button", { name: "March", exact: true }).click()
      await expect(page.locator("[data-month-grid]")).toBeVisible()
    })
  })
}

test.describe("the year on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: "light" })

  test("wraps its months to the phone, and a tap opens the day", async ({ page }, testInfo) => {
    test.setTimeout(300_000)
    await open(page, testInfo)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
    const day = page.locator('[data-year-day="2026-10-22"]')
    const box = (await day.boundingBox())!
    // A finger's target: the shared day cell's 32 px, with its 44 px reach.
    expect(box.width).toBeGreaterThanOrEqual(32)
    // The switch shows Year as the view that's on.
    await expect(page.locator("[data-phone-bar] [data-calendar-views]").getByRole("button", { name: "Year", exact: true })).toHaveAttribute("aria-pressed", "true")
    // Today's ring sits on today in the week strip: under a finger the cell's
    // ::before is its 44 px reach, so the ring is its ::after, centred on it.
    const ring = await page.locator("[data-phone-bar] button[data-today]").evaluate((el) => {
      const after = getComputedStyle(el, "::after")
      const box = el.getBoundingClientRect()
      return { left: parseFloat(after.left), top: parseFloat(after.top), width: box.width, height: box.height, shadow: after.boxShadow }
    })
    expect(ring.left).toBeCloseTo(ring.width / 2, 0)
    expect(ring.top).toBeCloseTo(ring.height / 2, 0)
    expect(ring.shadow).not.toBe("none")
    await reviewShot(page, "year-phone", "light")
    await day.tap()
    await expect(page.locator("[data-period]")).toHaveAttribute("data-period", "day:2026-10-22")
  })
})
