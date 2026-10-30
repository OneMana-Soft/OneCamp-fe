import { expect, test, type Page, type TestInfo } from "@playwright/test"

import { reviewShot, SHOT_THEMES, stubBackend } from "./stubbedApp"

// Calendar B3 (gcal-new-time-insights): Your week. The header's chart button
// opens where your own time went in the week on screen: meetings against the
// usual week, the bar by kind, invitations to answer, and the people you meet
// most. In a real browser with every request answered here, at 1280 and on a
// phone (a sheet there), with shots for review when SHOTS_DIR is set.

const NOW = new Date(2026, 9, 19, 8, 0)
const WEEK = {
  from: "2026-10-19T00:00:00Z", to: "2026-10-26T00:00:00Z",
  meeting_minutes: 390, one_on_one_minutes: 120, group_minutes: 270, meetings: 7, average_meeting_minutes: 56,
  focus_minutes: 240, own_minutes: 60, away_minutes: 0, has_hours: true, working_minutes: 2400, free_minutes: 1710,
  to_answer: 2, usual_meeting_minutes: 300,
  people: [
    { user_uuid: "5a000000-0000-4000-8000-000000000001", name: "Maya Chen", minutes: 180, meetings: 3 },
    { user_uuid: "5a000000-0000-4000-8000-000000000002", name: "Sam Rivera", minutes: 120, meetings: 2 },
  ],
}

async function open(page: Page, testInfo: TestInfo) {
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
    "/calendar/repeats": { msg: "ok", data: { checkins: [], tasks: [] } },
    "/calendar/insights": (url: URL) => {
      asked.push(url.search)
      return { msg: "ok", data: WEEK }
    },
  })
  await page.goto("/app/calendar?date=2026-10-19&view=week", { waitUntil: "domcontentloaded", timeout: 120_000 })
  await page.getByRole("button", { name: "Your week" }).click({ timeout: 120_000 })
  const panel = page.locator("[data-your-week]")
  await expect(panel.locator("[data-your-week-meetings]")).toHaveText("6h 30m", { timeout: 60_000 })
  return { asked, panel }
}

for (const theme of SHOT_THEMES) {
  test.describe(`your week on a computer, ${theme}`, () => {
    test.use({ viewport: { width: 1280, height: 860 }, colorScheme: theme })

    test("where the week went, beside the usual one", async ({ page }, testInfo) => {
      test.setTimeout(240_000)
      const { asked, panel } = await open(page, testInfo)
      expect(asked[0]).toMatch(/^\?from=.+&to=.+/)
      await expect(panel).toContainText("in 7 meetings")
      await expect(panel).toContainText("1h 30m more than usual")
      await expect(panel.locator("[data-your-week-part]")).toHaveCount(5)
      await expect(panel.locator("[data-your-week-to-answer]")).toHaveText("2 invitations")
      await expect(panel.locator("[data-your-week-person]").first()).toContainText("Maya Chen")
      await reviewShot(page, "calendar-your-week", theme)
    })
  })

  test.describe(`your week on a phone, ${theme}`, () => {
    test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: theme })

    test("a sheet with the week, no sideways scroll", async ({ page }, testInfo) => {
      test.setTimeout(240_000)
      const { panel } = await open(page, testInfo)
      await expect(panel.locator("[data-your-week-person]")).toHaveCount(2)
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
      await reviewShot(page, "calendar-your-week-phone", theme)
    })
  })
}
