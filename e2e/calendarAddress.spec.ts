import { expect, test, type Page, type TestInfo } from "@playwright/test"

import { stubBackend } from "./stubbedApp"

// The calendar's place in the address (fluid-10): written by the one address
// writer once the place has been still a second, it is where a reload and
// Back land, and nothing ever writes an older place back. Booking pages
// leaves through the calendar's router leaf (RouterInto).

const NOW = new Date(2026, 9, 21, 10, 0)

async function open(page: Page, testInfo: TestInfo) {
  await page.clock.setFixedTime(NOW)
  await stubBackend(page, testInfo, {
    "/event/getEvents": { msg: "ok", data: [] },
    "/integration/google-calendar/status": { msg: "ok", data: { isConnected: false } },
    "/user/assignedTaskList": { msg: "ok", data: { user_tasks: [] } },
    "/event/bookingPages": { msg: "ok", data: [] },
    "/calendar/sync/google": { msg: "ok", data: { provider: "google", state: "none", progress: 0, moved: 0, unchanged: 0 } },
    "/calendar/calendars/events": { msg: "ok", data: [], truncated: false },
    "/calendar/calendars": { msg: "ok", data: [{ id: "cal-me", name: "Personal", kind: "personal", access: "manage", mine: true }] },
  })
  await page.goto("/app/calendar?date=2026-10-21&view=week", { waitUntil: "domcontentloaded", timeout: 120_000 })
  await expect(page.locator("[data-period]")).toBeVisible({ timeout: 240_000 })
}

const dateIn = (page: Page) => new URL(page.url()).searchParams.get("date")

test("a reload and Back land on the latest place, and the address never goes back", async ({ page }, testInfo) => {
  test.setTimeout(300_000)
  await open(page, testInfo)
  const period = page.locator("[data-period]")
  await expect(period).toHaveAttribute("data-period", "week:2026-10-19")
  await page.keyboard.press("j")
  await page.keyboard.press("j")
  await expect.poll(() => dateIn(page), { timeout: 10_000 }).toBe("2026-11-04")
  const there = "week:2026-11-02"
  await expect(period).toHaveAttribute("data-period", there)
  await page.waitForTimeout(2500)
  expect(dateIn(page)).toBe("2026-11-04")

  await page.reload({ waitUntil: "domcontentloaded" })
  await expect(period).toHaveAttribute("data-period", there, { timeout: 120_000 })
  expect(dateIn(page)).toBe("2026-11-04")

  await page.getByRole("button", { name: /^Calendars/ }).click()
  await page.getByRole("button", { name: /Booking pages/ }).click()
  await expect(page).toHaveURL(/\/app\/calendar\/booking/, { timeout: 60_000 })
  await page.goBack()
  await expect(period).toHaveAttribute("data-period", there, { timeout: 60_000 })
  expect(dateIn(page)).toBe("2026-11-04")
  await page.waitForTimeout(2500)
  expect(dateIn(page)).toBe("2026-11-04")
})
