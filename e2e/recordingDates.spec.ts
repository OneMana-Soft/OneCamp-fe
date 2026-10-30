import { expect, test } from "@playwright/test"

import { stubBackend } from "./stubbedApp"

// The recordings list's date range (components/dateRangePicker/dateRangeField): on a phone a sheet, a chunk of
// its own that the field's button opens; on a computer a popover. A day picked there changes the range the button
// names, and focus comes back to the button as the picker closes. With SHOTS_DIR set, the picker is shot open.
for (const [width, height, phone] of [
  [390, 844, true],
  [1280, 800, false],
] as const) {
  for (const theme of ["light", "dark"] as const) {
    test.describe(`the recordings' date range at ${width}, ${theme}`, () => {
      test.use({ viewport: { width, height }, isMobile: phone, hasTouch: phone })

      test("a day picked from the field's button changes the range it names", async ({ page }, testInfo) => {
        await page.addInitScript((t) => localStorage.setItem("ui-theme", t), theme)
        await stubBackend(page, testInfo, { "/user/recordingList": { msg: "ok", data: { recordings: [], has_more: false } } })
        await page.goto("/app/recordings", { waitUntil: "domcontentloaded", timeout: 120_000 })
        // The list opens on the last 30 days: "25 Sep to 25 Oct". Found by its words, not its role: a phone's sheet
        // hides the page under it from the accessibility tree while it is open.
        const field = page.locator("button", { hasText: /^\d{1,2} [A-Z][a-z]{2}( \d{4})? to \d{1,2} [A-Z][a-z]{2}/ })
        await expect(field).toBeVisible({ timeout: 60_000 })
        const before = await field.textContent()
        if (phone) await field.tap()
        else await field.click()
        const DAY = 'button[name="day"]'
        const picker = phone ? page.getByRole("dialog", { name: "Pick dates" }) : page.locator("[data-radix-popper-content-wrapper]").filter({ has: page.locator(DAY) })
        await expect(picker.locator(DAY).first()).toBeVisible()
        // A day of the month shown that isn't in the range: the range grows to it.
        const day = picker.locator(`${DAY}:not(.day-outside):not([aria-selected="true"])`).first()
        if (phone) await day.tap()
        else await day.click()
        await expect(field).not.toHaveText(before ?? "")
        if (process.env.SHOTS_DIR) await page.screenshot({ path: `${process.env.SHOTS_DIR}/recording-dates-open-${width}-${theme}.png` })
        if (phone) await page.touchscreen.tap(width / 2, 40)
        else await page.keyboard.press("Escape")
        await expect(picker).toHaveCount(0)
        await expect(field).toBeFocused()
      })
    })
  }
}
