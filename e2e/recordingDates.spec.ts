import { expect, test } from "@playwright/test"

import { stubBackend } from "./stubbedApp"

// The recordings list's date range (components/dateRangePicker/dateRangeField): on a phone a sheet, a chunk of
// its own that the field's button opens; on a computer a popover. A day picked there changes the range the button
// names, and focus comes back to the button as the picker closes. With SHOTS_DIR set, the picker is shot open.
//
// The page's clock is pinned. The list opens on the last 30 days (RecordingsView), and the picker opens on the
// range's first month: one month on a phone, two on a computer. So which days it offers depends on the date. On
// 31 Oct 2026 the range ran 1 Oct to 31 Oct, every day of the phone's month was in it, and a test reading the real
// clock found no day outside the range to pick (CI, 31 Oct: both themes at 390). That shape comes back whenever the
// range starts on a month's 1st and covers the month: 1 Dec, 31 Dec, 31 Jan, 3 Mar. Each shape has its leg.
const DAYS = [
  // 5 Oct to 4 Nov: October's first four days are outside the range, and picking the 1st grows it.
  { on: "4 Nov 2026", now: new Date(2026, 10, 4, 10), before: "5 Oct to 4 Nov", pick: "1", after: "1 Oct to 4 Nov" },
  // 1 Oct to 31 Oct: the whole month shown is in the range, and picking a day inside it ends the range there.
  { on: "31 Oct 2026", now: new Date(2026, 9, 31, 10), before: "1 Oct to 31 Oct", pick: "15", after: "1 Oct to 15 Oct" },
] as const

for (const [width, height, phone] of [
  [390, 844, true],
  [1280, 800, false],
] as const) {
  for (const theme of ["light", "dark"] as const) {
    for (const day of DAYS) {
      test.describe(`the recordings' date range at ${width}, ${theme}, on ${day.on}`, () => {
        test.use({ viewport: { width, height }, isMobile: phone, hasTouch: phone })

        test("a day picked from the field's button changes the range it names", async ({ page }, testInfo) => {
          await page.clock.setFixedTime(day.now)
          await page.addInitScript((t) => localStorage.setItem("ui-theme", t), theme)
          await stubBackend(page, testInfo, { "/user/recordingList": { msg: "ok", data: { recordings: [], has_more: false } } })
          await page.goto("/app/recordings", { waitUntil: "domcontentloaded", timeout: 120_000 })
          // Found by its words, not its role: a phone's sheet hides the page under it from the accessibility tree
          // while it is open.
          const field = page.locator("button", { hasText: /^\d{1,2} [A-Z][a-z]{2}( \d{4})? to \d{1,2} [A-Z][a-z]{2}/ })
          await expect(field).toBeVisible({ timeout: 60_000 })
          await expect(field).toHaveText(day.before)
          if (phone) await field.tap()
          else await field.click()
          const DAY = 'button[name="day"]'
          const picker = phone ? page.getByRole("dialog", { name: "Pick dates" }) : page.locator("[data-radix-popper-content-wrapper]").filter({ has: page.locator(DAY) })
          await expect(picker.locator(DAY).first()).toBeVisible()
          // The range's first month comes first, on a phone and a computer alike.
          const target = picker.locator(`${DAY}:not(.day-outside)`).filter({ hasText: new RegExp(`^${day.pick}$`) }).first()
          if (phone) await target.tap()
          else await target.click()
          await expect(field).toHaveText(day.after)
          if (process.env.SHOTS_DIR && day === DAYS[0]) await page.screenshot({ path: `${process.env.SHOTS_DIR}/recording-dates-open-${width}-${theme}.png` })
          if (phone) await page.touchscreen.tap(width / 2, 40)
          else await page.keyboard.press("Escape")
          await expect(picker).toHaveCount(0)
          await expect(field).toBeFocused()
        })
      })
    }
  }
}
