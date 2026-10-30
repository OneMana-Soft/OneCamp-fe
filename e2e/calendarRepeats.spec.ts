import { expect, test, type Page, type TestInfo } from "@playwright/test"

import { reviewShot, SHOT_THEMES, stubBackend } from "./stubbedApp"

// Calendar head 9 (gcal-1b): what repeats on the grid beside the events. A
// channel's check-in at each time it asks, on your own row, nobody moves it,
// and it opens its channel; a task that repeats on a schedule on each date it
// comes due next, with the repeat glyph, opening the task. In a real browser
// with every request answered here, at 1280 and on a phone, with shots for
// review when SHOTS_DIR is set.

const NOW = new Date(2026, 9, 19, 8, 0)
const CHANNEL = "5c000000-0000-4000-8000-000000000001"
const TASK = "5d000000-0000-4000-8000-000000000001"
const at = (day: number, hour: number) => new Date(2026, 9, day, hour).toISOString()
const REPEATS = {
  checkins: [{ id: "5e000000-0000-4000-8000-000000000001", channel_uuid: CHANNEL, channel_name: "engineering", question: "What did you work on today?", at: [at(19, 17), at(20, 17), at(21, 17)] }],
  tasks: [{ task_uuid: TASK, task_name: "Plan the week", project_uuid: "5f000000-0000-4000-8000-000000000001", project_name: "Ops", rule: "FREQ=WEEKLY;BYDAY=WE", due: [at(21, 0)] }],
}

async function open(page: Page, testInfo: TestInfo, view: "week" | "day") {
  await page.clock.setFixedTime(NOW)
  const asked: string[] = []
  await stubBackend(page, testInfo, {
    "/event/getEvents": { msg: "ok", data: [] },
    "/integration/google-calendar/status": { msg: "ok", data: { isConnected: false } },
    "/user/assignedTaskList": { msg: "ok", data: { user_tasks: [] } },
    "/event/bookingPages": { msg: "ok", data: [] },
    "/calendar/sync/google": { msg: "ok", data: { provider: "google", state: "none", progress: 0, moved: 0, unchanged: 0 } },
    "/calendar/calendars/events": { msg: "ok", data: [], truncated: false },
    "/calendar/calendars": { msg: "ok", data: [{ id: "cal-me", name: "Personal", kind: "personal", access: "manage", mine: true }] },
    "/calendar/repeats": (url: URL) => {
      asked.push(url.search)
      return { msg: "ok", data: REPEATS }
    },
  })
  await page.goto(`/app/calendar?date=2026-10-${view === "day" ? 21 : 19}&view=${view}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
  return asked
}

for (const theme of SHOT_THEMES) {
  test.describe(`what repeats on the calendar on a computer, ${theme}`, () => {
    test.use({ viewport: { width: 1280, height: 860 }, colorScheme: theme })

    test("check-ins at their times and a repeating task on its next date", async ({ page }, testInfo) => {
      test.setTimeout(240_000)
      const asked = await open(page, testInfo, "week")
      const checkIns = page.locator('[data-calendar] [data-event-uuid^="checkin-"]')
      await expect(checkIns).toHaveCount(3, { timeout: 120_000 })
      await expect(checkIns.first()).toContainText("#engineering check-in")
      const ahead = page.locator(`[data-all-day-rail] [data-event-uuid="${TASK}@${at(21, 0)}"][data-task-ahead]`)
      await expect(ahead).toHaveCount(1)
      await expect(ahead.locator("svg.lucide-repeat")).toBeVisible()
      expect(asked[0]).toMatch(/^\?from=.+&to=.+/)
      await reviewShot(page, "calendar-repeats-week", theme)
      // A check-in opens its channel.
      await checkIns.first().click()
      await expect(page).toHaveURL(new RegExp(CHANNEL))
    })
  })

  test.describe(`what repeats on the calendar on a phone, ${theme}`, () => {
    test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: theme })

    test("the day keeps the check-in and the repeating task", async ({ page }, testInfo) => {
      test.setTimeout(240_000)
      await open(page, testInfo, "day")
      await expect(page.locator('[data-calendar] [data-event-uuid^="checkin-"]')).toHaveCount(1, { timeout: 120_000 })
      await expect(page.locator(`[data-event-uuid="${TASK}@${at(21, 0)}"][data-task-ahead]`)).toHaveCount(1)
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
      await reviewShot(page, "calendar-repeats-day", theme)
    })
  })
}
