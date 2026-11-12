import { expect, test, type Locator, type Page } from "@playwright/test"

import { REVIEW, askOf, at, holdAndDrag, openMeeting } from "./calendarMove"
import { SHOT_THEMES, logFailures, reviewShot } from "./stubbedApp"

// CAL-11 (UX-CALPLAN H1): a meeting dragged on the grid asks "Send an update
// to your guests?" before anyone is emailed, as the Event Form's save does,
// and sends its new times alone, at the version it read, through the
// calendar's own API (PATCH /calendar/events/{id}): its title, notes and
// guests stay as the server has them. Don't send sends notify=none; closing
// the question puts the block back and sends nothing; Undo sends the move
// back with the same answer and asks nothing. At 1280 by the mouse, and at
// 390 by a held finger, where the question is the shared Dialog's sheet.
// With SHOTS_DIR set, the question and the toast are saved, light and dark.

/** Drags the block `days` columns on and `hours` later, by the mouse. */
async function drag(page: Page, block: Locator, days: number, hours: number) {
  const b = (await block.boundingBox())!
  const to = (await page.locator(`[data-day-col="${days}"]`).boundingBox())!
  const hour = to.height / 24
  const x = b.x + b.width / 2
  const y = b.y + 12
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(to.x + to.width / 2, y + hour * hours, { steps: 14 })
  await page.mouse.up()
}

for (const theme of SHOT_THEMES) {
  test.describe(`a meeting moved on the week at 1280, ${theme}`, () => {
    test.use({ viewport: { width: 1280, height: 900 }, colorScheme: theme })
    test.beforeEach(({ page }) => logFailures(page))

    test("asks before its guests are emailed, sends its times alone, and Undo goes back with the same answer", async ({ page }, testInfo) => {
      test.setTimeout(420_000)
      const { sent, block } = await openMeeting(page, testInfo, "week")
      // Two days on and an hour later: Wednesday at 11:00.
      await drag(page, block, 2, 1)
      const ask = askOf(page)
      await expect(ask).toBeVisible({ timeout: 15_000 })
      await expect(ask).toContainText("emails anyone invited by email")
      await expect(ask.getByRole("button", { name: "Send", exact: true })).toBeFocused()
      expect(sent, "nothing goes before the question is answered").toEqual([])
      // Drawn where it was dropped while it asks.
      await expect(page.locator('[data-day-col="2"]').locator(`[data-event-uuid="${REVIEW}"]`)).toBeVisible()
      await reviewShot(page, "move-tell-guests", theme)

      await ask.getByRole("button", { name: "Don't send" }).click()
      await expect.poll(() => sent.length).toBe(1)
      expect(sent[0]).toEqual({ sequence: 2, start: { at: at(21, 11), zone: expect.any(String) }, end: { at: at(21, 12) }, notify: "none" })
      const moved = page.locator(".toast-card").filter({ hasText: "Moved “Design review”" })
      await expect(moved).toContainText("Guests weren't emailed.")
      await expect(page.locator('[data-day-col="2"]').locator(`[data-event-uuid="${REVIEW}"]`)).toBeVisible()
      await reviewShot(page, "move-not-emailed", theme)

      await moved.getByRole("button", { name: "Undo" }).click()
      await expect.poll(() => sent.length).toBe(2)
      expect(sent[1]).toMatchObject({ sequence: 3, start: { at: at(19, 10) }, end: { at: at(19, 11) }, notify: "none" })
      await expect(page.getByRole("dialog")).toHaveCount(0)
      await expect(page.locator('[data-day-col="0"]').locator(`[data-event-uuid="${REVIEW}"]`)).toBeVisible()
    })

    test("closing the question puts the block back and sends nothing", async ({ page }, testInfo) => {
      test.setTimeout(420_000)
      const { sent, block } = await openMeeting(page, testInfo, "week")
      await drag(page, block, 2, 1)
      const ask = askOf(page)
      await expect(ask).toBeVisible({ timeout: 15_000 })
      await page.keyboard.press("Escape")
      await expect(ask).toHaveCount(0)
      await page.waitForTimeout(800)
      expect(sent).toEqual([])
      await expect(page.locator('[data-day-col="0"]').locator(`[data-event-uuid="${REVIEW}"]`)).toBeVisible()
      await expect(page.locator(".toast-card").filter({ hasText: "Moved" })).toHaveCount(0)
    })

    test("asks once for a burst of Alt and the arrows, a second after the last", async ({ page }, testInfo) => {
      test.setTimeout(420_000)
      const { sent, block } = await openMeeting(page, testInfo, "week")
      const hour = (await page.locator('[data-day-col="0"]').boundingBox())!.height / 24
      const top = (await block.boundingBox())!.y
      await block.focus()
      for (let i = 0; i < 3; i++) await page.keyboard.press("Alt+ArrowDown")
      // Drawn at once, a quarter hour a press; nothing goes while the keys move it.
      await expect.poll(async () => Math.round(((await block.boundingBox())!.y - top) / (hour / 4))).toBe(3)
      expect(sent).toEqual([])
      const ask = askOf(page)
      await expect(ask).toBeVisible({ timeout: 15_000 })
      await ask.getByRole("button", { name: "Send", exact: true }).click()
      await expect.poll(() => sent.length).toBe(1)
      expect(sent[0]).toEqual({ sequence: 2, start: { at: at(19, 10, 45), zone: expect.any(String) }, end: { at: at(19, 11, 45) } })
      await page.waitForTimeout(1500)
      expect(sent).toHaveLength(1)
      await expect(askOf(page)).toHaveCount(0)
    })
  })

  // A phone's drag is a held finger (PRESS_LIFT): the same question, as the shared Dialog's sheet.
  test.describe(`a meeting moved by a held finger at 390, ${theme}`, () => {
    test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: theme })
    test.beforeEach(({ page }) => logFailures(page))

    test("asks the same question as a sheet, and Send sends the move", async ({ page }, testInfo) => {
      test.setTimeout(420_000)
      const { sent, block } = await openMeeting(page, testInfo, "day")
      await holdAndDrag(page, block)
      const ask = askOf(page)
      await expect(ask).toBeVisible({ timeout: 15_000 })
      await expect(ask).toHaveAttribute("data-v3-sheet", "")
      expect(sent).toEqual([])
      const send = ask.getByRole("button", { name: "Send", exact: true })
      await reviewShot(page, "move-tell-guests-phone", theme)
      await send.tap()
      await expect.poll(() => sent.length).toBe(1)
      expect(sent[0]).not.toHaveProperty("notify")
      expect((sent[0].start as { at: string }).at, "the meeting moved later the same day").not.toBe(at(19, 10))
      await expect(page.locator(".toast-card").filter({ hasText: "Moved “Design review”" })).toBeVisible()
    })
  })
}
