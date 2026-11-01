import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test"

import { CollabRelay } from "./docs/collabRelay"
import { holdChunk } from "./holdChunk"
import { docInfo, reviewShot, SAM, SHOT_THEMES, stubBackend } from "./stubbedApp"

// V-180: an event opened cold on a slow line stayed a blank white frame for 30 s, with no header, no skeleton and no
// error (meet-02's LIVE look, 1 Nov). Now the event's shape holds the room while the panel's code or the event itself
// comes; at about 10 s it says so, with Try again; and the event still comes in by itself once it lands. At 1280 the
// right panel's code is held back; on a phone, where the event opens on its own page, the event's read is.

// Wednesday 21 October 2026, 10:00 on the browser's clock.
const NOW = new Date(2026, 9, 21, 10, 0)
const at = (day: number, h: number, m = 0) => new Date(2026, 9, day, h, m).toISOString()
const ME = { ...SAM, user_name: "Sam Rivera" }
const LAUNCH = "0b8a3c1e-1d2f-4a5b-8c7d-9e0f1a2b3c11"
const EVENT = {
  event_uuid: LAUNCH,
  event_title: "Launch review",
  event_start_time: at(21, 14),
  event_end_time: at(21, 15),
  event_description: "<p>Walk the checklist, then decide go or no-go.</p>",
  event_created_by: ME,
  event_participants: [],
  event_guests: [],
  event_reminders: [10],
  event_reminders_default: true,
}
// The panel tells the slow line from a failure by these words (lib/http/slowLine).
const SLOW_WORDS = "taking longer than it should"

/** The calendar's stubs; `read` answers GET /event/getEvent/{id}, after any hold the test makes. */
async function stub(page: Page, testInfo: TestInfo, read: () => Promise<unknown> | unknown = () => ({ msg: "ok", data: EVENT })) {
  await page.clock.setFixedTime(NOW)
  // The first-run keys tip has been seen: it isn't this test's screen.
  await page.addInitScript(() => {
    try {
      localStorage.setItem("oc_keys_tip_seen", "1")
    } catch {
      /* storage blocked */
    }
  })
  await stubBackend(page, testInfo, {
    "/event/getEvents": { msg: "ok", data: [EVENT] },
    "/event/getEvent/": () => read(),
    "/integration/google-calendar/status": { msg: "ok", data: { isConnected: false } },
    "/user/assignedTaskList": { msg: "ok", data: { user_tasks: [] } },
    "/config/client": { msg: "ok", data: { features: {} } },
    "/event/bookingPages": { msg: "ok", data: [] },
  })
}

const shape = (page: Page) => page.getByRole("status", { name: "Loading the event" })
/** The right panel's Close in its frame while a panel's code comes (DB-71's MUST 1: Escape was the only way out). */
const close = (page: Page) => page.locator("[data-panel-frame]").getByRole("button", { name: "Close panel" })

/** Waits for the slow word, then says how long after `since` it came. */
async function saysSlow(page: Page, subject: string, since: number): Promise<{ alert: Locator; after: number }> {
  const alert = page.getByRole("alert").filter({ hasText: `Couldn't load ${subject}` })
  await expect(alert, `at about 10 s it says ${subject} is slow`).toBeVisible({ timeout: 20_000 })
  const after = Date.now() - since
  await expect(alert, "in the slow line's words, not a failure's").toContainText(SLOW_WORDS)
  await expect(alert.getByRole("button", { name: "Try again" })).toBeVisible()
  return { alert, after }
}

for (const theme of SHOT_THEMES) {
  test.describe(`at 1280, the right panel's code on a slow line, ${theme}`, () => {
    test.use({ viewport: { width: 1280, height: 860 }, colorScheme: theme })

    test("holds the event's shape while the panel's code comes, says so at 10 s with Try again, and comes in by itself", async ({ page }, testInfo) => {
      test.setTimeout(180_000)
      const code = await holdChunk(page, "data-event-panel-foot")
      await stub(page, testInfo)
      await page.goto("/app/calendar?date=2026-10-21&view=week", { waitUntil: "domcontentloaded", timeout: 120_000 })
      await page.locator(`[data-event-uuid="${LAUNCH}"]`).first().click({ timeout: 60_000 })
      await page.locator("[data-event-card]").getByRole("button", { name: "Open details" }).click()
      // Its shape at once, never a blank frame.
      await expect(shape(page), "the event's shape while the panel's code comes").toBeVisible({ timeout: 5_000 })
      const shown = Date.now()
      expect(code.asked(), "the panel asked for its code").toBe(true)
      await expect(close(page), "Close is live in the head over the shape").toBeVisible()
      await reviewShot(page, "event-panel-shape", theme)
      const { alert, after } = await saysSlow(page, "the event", shown)
      expect(after, "not before about 10 s").toBeGreaterThan(8_500)
      await expect(close(page), "and over the slow line").toBeVisible()
      await reviewShot(page, "event-panel-slow", theme)
      // Try again waits once more, on the shape.
      await alert.getByRole("button", { name: "Try again" }).click()
      await expect(shape(page), "Try again puts the shape back while it waits").toBeVisible()
      await expect(alert).toHaveCount(0)
      // Close by mouse in the shape closes the panel; opening the event again brings the shape back, the code still coming.
      await close(page).click()
      await expect(page.locator("[data-panel-frame]"), "Close in the shape closes the panel").toHaveCount(0)
      await expect(shape(page)).toHaveCount(0)
      await page.locator(`[data-event-uuid="${LAUNCH}"]`).first().click()
      await page.locator("[data-event-card]").getByRole("button", { name: "Open details" }).click()
      await expect(shape(page), "the shape again on a second open").toBeVisible({ timeout: 5_000 })
      // The code lands: the panel comes in by itself.
      code.release()
      await expect(page.locator("[data-event-panel]").getByText("Launch review").first(), "the event comes in once its code lands").toBeVisible({ timeout: 30_000 })
      await expect(shape(page)).toHaveCount(0)
      await expect(alert).toHaveCount(0)
      await code.done()
    })
  })
}

// The frame and the slow line are the shared lazyPanel's, so the comments panel, which has no shape of its own, draws
// the same head with Close and says the same slow words. Its chunk is the only one with this list's classes.
const DOC = "5c4b3a29-1807-4f6e-9d5c-4b3a29180716"
const COMMENTS_CODE = "flex flex-1 flex-col gap-2 overflow-y-auto p-3"

test.describe("at 1280, the comments panel's code on a slow line, light", () => {
  test.use({ viewport: { width: 1280, height: 860 }, colorScheme: "light" })

  test("the comments draw the right panel's head with Close at once, say they are slow at 10 s, and Close closes them", async ({ page }, testInfo) => {
    test.setTimeout(180_000)
    const code = await holdChunk(page, COMMENTS_CODE)
    await stubBackend(page, testInfo, {
      [`/doc/getDocInfo/${DOC}`]: docInfo({ doc_uuid: DOC, doc_title: "Launch plan", doc_body: "<p>Walk the checklist.</p>", edit: true }),
      "/user/profile": { msg: "ok", data: SAM },
      "/auth/token": { data: { token: `e2e-${SAM.user_name}` } },
    })
    await new CollabRelay().attach(page, SAM.user_full_name)
    await page.goto(`/app/doc/${DOC}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
    await page.getByRole("button", { name: /^Comments, / }).click({ timeout: 60_000 })
    await expect(close(page), "the right panel's head, with Close, at once").toBeVisible({ timeout: 5_000 })
    const shown = Date.now()
    await expect.poll(code.asked, { message: "the panel asked for its code" }).toBe(true)
    const { after } = await saysSlow(page, "the comments", shown)
    expect(after, "not before about 10 s").toBeGreaterThan(8_500)
    await expect(close(page), "Close over the slow line").toBeVisible()
    await reviewShot(page, "comments-panel-slow", "light")
    await close(page).click()
    await expect(page.locator("[data-panel-frame]"), "Close closes the panel").toHaveCount(0)
    await code.done()
  })
})

for (const theme of SHOT_THEMES) {
  test.describe(`on a phone with touch, the event's read on a slow line, ${theme}`, () => {
    test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: theme })

    test("holds the event's shape on its own page while it is read, says so at 10 s, and Try again reads it once more", async ({ page }, testInfo) => {
      test.setTimeout(180_000)
      let open = () => {}
      const held = new Promise<void>((resolve) => (open = resolve))
      let reads = 0
      await stub(page, testInfo, async () => {
        reads++
        await held
        return { msg: "ok", data: EVENT }
      })
      await page.goto(`/app/calendar/event/${LAUNCH}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
      await expect(shape(page), "the event's shape while it is read").toBeVisible({ timeout: 60_000 })
      const shown = Date.now()
      await expect.poll(() => reads, { message: "the page asked for the event" }).toBeGreaterThan(0)
      await reviewShot(page, "event-page-shape", theme)
      const { alert, after } = await saysSlow(page, "this event", shown)
      expect(after, "not before about 10 s").toBeGreaterThan(8_500)
      await reviewShot(page, "event-page-slow", theme)
      const before = reads
      await alert.getByRole("button", { name: "Try again" }).tap()
      await expect(shape(page), "Try again puts the shape back while it reads").toBeVisible()
      await expect.poll(() => reads, { message: "Try again reads the event once more" }).toBeGreaterThan(before)
      // The read lands: the event, in place of its shape.
      open()
      await expect(page.getByText("Launch review").first(), "the event comes in once it is read").toBeVisible({ timeout: 30_000 })
      await expect(shape(page)).toHaveCount(0)
      await expect(alert).toHaveCount(0)
    })
  })
}
