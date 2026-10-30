import { expect, test, type Page, type Request, type TestInfo } from "@playwright/test"

import { LAYERED_SCRIM, footIsGutter, scrimOverLayerBelow, scrollsInItsBody, topScrimFill } from "./sheetLayout"
import { reviewShot, stubBackend, withStatus } from "./stubbedApp"
import { BUSY_LOOK, FIELD_LOOK, busyPrimaryLook, disabledPrimaryLook } from "./controlLook"

// Calendar B8: a calendar in another app. Personal's menu offers Show in
// another app; the dialog makes a link showing everything, gives it once
// with Copy, and a phone has the same in its calendar options. A read that
// failed says so with Try again, and a live link is replaced only after a
// question. With SHOTS_DIR set, each state is saved for review.

const NOW = new Date(2026, 9, 21, 10, 0)

const CALENDARS = [
  { id: "cal-me", name: "Personal", kind: "personal", access: "manage", mine: true },
  { id: "cal-launch", name: "Launch", kind: "project", container_kind: "project", container_id: "p-launch", access: "edit" },
]

/** What the server answers for Personal's link: none yet, a live one, or a failed read. */
type Feed = "none" | "live" | "fails"

/** `made`: the link is made when it settles (a slow server), at once without it. */
/** Answers the test holds back until it lets them go: the link's read, and its stop. */
interface Held {
  read?: Promise<void>
  stop?: Promise<void>
}

async function open(page: Page, testInfo: TestInfo, feed: Feed = "none", made?: Promise<void>, held: Held = {}) {
  const puts: unknown[] = []
  await page.clock.setFixedTime(NOW)
  await stubBackend(page, testInfo, {
    "/event/getEvents": { msg: "ok", data: [] },
    "/integration/google-calendar/status": { msg: "ok", data: { isConnected: false } },
    "/user/assignedTaskList": { msg: "ok", data: { user_tasks: [] } },
    "/event/bookingPages": { msg: "ok", data: [] },
    "/calendar/calendars/events": { msg: "ok", data: [], truncated: false },
    "/calendar/calendars/cal-me/feed": async (_url: URL, request: Request) => {
      if (request.method() === "PUT") {
        puts.push(request.postDataJSON())
        await made
        return { msg: "ok", data: { live: true, url: "https://api.onecamp.example/public/calendar/7rKq2mX9vN4pL8sT1wY6zB3cF5hJ0dG.ics", scope: "full", most: "full", created_at: NOW.toISOString() } }
      }
      if (request.method() === "DELETE") {
        await held.stop
        return { msg: "ok", data: { live: false, most: "full" } }
      }
      if (feed === "fails") return withStatus(500, { msg: "internal error" })
      await held.read
      return { msg: "ok", data: feed === "live" ? { live: true, scope: "busy", most: "full", created_at: new Date(2026, 9, 18, 9).toISOString() } : { live: false, most: "full" } }
    },
    "/calendar/calendars": { msg: "ok", data: CALENDARS },
  })
  await page.goto("/app/calendar?date=2026-10-21&view=week", { waitUntil: "domcontentloaded", timeout: 120_000 })
  await expect(page.locator("[data-period]")).toBeVisible({ timeout: 240_000 })
  return puts
}

/** The link's dialog, from Personal's menu in the Calendars panel, or a phone's calendar options. */
async function feedDialog(page: Page, phone = false) {
  if (phone) {
    await page.getByRole("button", { name: "Calendar options" }).click({ timeout: 60_000 })
    await page.getByRole("button", { name: "Show my calendar in another app" }).click()
  } else {
    await page.getByRole("button", { name: /^Calendars/ }).click()
    const personal = page.locator("[data-calendars-panel] [data-calendar-row='onecamp']")
    await personal.hover()
    await personal.getByRole("button", { name: "Personal options" }).click()
    await page.getByRole("menuitem", { name: "Show in another app" }).click()
  }
  return page.locator("[data-feed-dialog]")
}

async function shot(page: Page, name: string, theme: string) {
  const dir = process.env.SHOTS_DIR
  if (!dir) return
  await page.waitForTimeout(450)
  await page.screenshot({ path: `${dir}/${name}-${page.viewportSize()?.width}-${theme}.png` })
}

for (const theme of ["light", "dark"] as const) {
  test.describe(`a calendar in another app at 1280, ${theme}`, () => {
    test.use({ viewport: { width: 1280, height: 900 }, colorScheme: theme })

    test("a link of your own, given once, showing everything", async ({ page }, testInfo) => {
      test.setTimeout(420_000)
      const puts = await open(page, testInfo)
      const dialog = await feedDialog(page)
      await expect(dialog.getByRole("heading", { name: "Show your calendar in another app" })).toBeVisible()
      // A computer keeps the centred dialog.
      await expect(dialog).not.toHaveAttribute("data-v3-sheet")
      await expect(dialog.getByText("No link yet.")).toBeVisible()
      // Out of the box the link shows only when it's busy; everything is a choice.
      await expect(dialog.getByRole("radio", { name: "When it's busy" })).toHaveAttribute("aria-checked", "true")
      await shot(page, "b8-feed-open", theme)
      await dialog.getByRole("radio", { name: "Everything" }).click()
      await dialog.getByRole("button", { name: "Make a link" }).click()
      await expect.poll(() => JSON.stringify(puts)).toContain('"scope":"full"')
      await expect(dialog.getByRole("textbox", { name: "The calendar's link" })).toHaveValue(/\/public\/calendar\/.+\.ics$/)
      await expect(dialog.getByText(/only time it's shown/)).toBeVisible()
      // DESIGN-BUILD-8 (F1 SF): the link ends in a fade, not a cut glyph.
      await expect(dialog.getByRole("textbox", { name: "The calendar's link" })).toHaveCSS("mask-image", /linear-gradient/)
      await shot(page, "b8-feed-made", theme)
    })
  })
}

// The dialog's two other states (DESIGN-BUILD-8's owed shots), on a computer
// and a phone, in both themes: a read that failed, and the question before a
// new link stops the live one.
for (const theme of ["light", "dark"] as const) {
  for (const phone of [false, true]) {
    test.describe(`the link's dialog ${phone ? "on a phone" : "at 1280"}, ${theme}`, () => {
      test.use(phone ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: theme } : { viewport: { width: 1280, height: 900 }, colorScheme: theme })

      test("says when the link couldn't be read, with Try again", async ({ page }, testInfo) => {
        test.setTimeout(420_000)
        await open(page, testInfo, "fails")
        const dialog = await feedDialog(page, phone)
        await expect(dialog.getByRole("button", { name: "Try again" })).toBeVisible({ timeout: 30_000 })
        // Nothing is made while the link is unknown: the action waits, held (feedDialog.test).
        const make = dialog.getByRole("button", { name: /Make a/ })
        await expect(make).toBeDisabled()
        // And it looks held: a field's ground and ink at full strength, never a dimmed brand fill (DESIGN-BUILD-7).
        await expect.poll(() => disabledPrimaryLook(make)).toEqual(FIELD_LOOK)
        await shot(page, "b8-feed-failed", theme)
      })

      // Busy is not held: while its own link is made, Make a link keeps its
      // brand at full strength and spins, and a second press makes nothing
      // (main's ruling, 23 Oct; DESIGN-BUILD-10, 24 Oct).
      test("keeps Make a link in its colours while the link is made, and takes no second press", async ({ page }, testInfo) => {
        test.setTimeout(420_000)
        let make = () => {}
        const made = new Promise<void>((resolve) => (make = resolve))
        const puts = await open(page, testInfo, "none", made)
        const dialog = await feedDialog(page, phone)
        const making = dialog.getByRole("button", { name: "Make a link" })
        await making.click()
        await expect.poll(() => busyPrimaryLook(making)).toEqual(BUSY_LOOK)
        await making.press("Enter")
        await shot(page, "b8-feed-making", theme)
        make()
        await expect(dialog.getByRole("textbox", { name: "The calendar's link" })).toHaveValue(/\.ics$/)
        expect(puts).toHaveLength(1)
      })

      // While the link is read, the dialog holds the line it will take, and
      // nothing is made yet (DESIGN-BUILD-25, 28 Oct).
      test("holds the link's line while it's read", async ({ page }, testInfo) => {
        test.setTimeout(420_000)
        let answer = () => {}
        const read = new Promise<void>((resolve) => (answer = resolve))
        await open(page, testInfo, "live", undefined, { read })
        const dialog = await feedDialog(page, phone)
        const reading = dialog.getByRole("status", { name: "Reading your link" })
        await expect(reading).toBeVisible({ timeout: 30_000 })
        await expect(dialog.getByRole("button", { name: /Make a/ })).toBeDisabled()
        await shot(page, "b8-feed-reading", theme)
        answer()
        await expect(dialog.locator("[data-feed-live]")).toBeVisible()
        await expect(reading).toHaveCount(0)
      })

      // While the link stops, Stop spins as its own and Make a new link waits
      // (the stop fix, flred1).
      test("while the link stops, Stop is busy and Make a new link waits", async ({ page }, testInfo) => {
        test.setTimeout(420_000)
        let stopped = () => {}
        const stop = new Promise<void>((resolve) => (stopped = resolve))
        await open(page, testInfo, "live", undefined, { stop })
        const dialog = await feedDialog(page, phone)
        const stopping = dialog.getByRole("button", { name: "Stop the link" })
        await stopping.click()
        await expect(stopping).toHaveAttribute("aria-busy", "true")
        await expect(dialog.getByRole("button", { name: "Make a new link" })).toBeDisabled()
        await shot(page, "b8-feed-stopping", theme)
        stopped()
        await expect(dialog.locator("[data-feed-none]")).toBeVisible()
      })

      test("asks before a new link stops the live one", async ({ page }, testInfo) => {
        test.setTimeout(420_000)
        const puts = await open(page, testInfo, "live")
        const dialog = await feedDialog(page, phone)
        await dialog.getByRole("button", { name: "Make a new link" }).click()
        const ask = page.getByRole("alertdialog", { name: "Make a new link?" })
        await expect(ask).toBeVisible()
        expect(await scrimOverLayerBelow(page), "the confirm's scrim dims the feed dialog under it").toBe(true)
        expect(await topScrimFill(page), "the confirm's scrim is the lighter one a layer wears").toBe(LAYERED_SCRIM[theme])
        expect(puts).toHaveLength(0)
        if (phone) expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
        await shot(page, "b8-feed-replace", theme)
      })

      // A short screen: the link's dialog scrolls in its body, and its title, its close and its actions stay put.
      test("scrolls in its body on a short screen, its title, close and actions in place", async ({ page }, testInfo) => {
        test.setTimeout(420_000)
        await open(page, testInfo, "live")
        const dialog = await feedDialog(page, phone)
        await expect(dialog.getByRole("button", { name: "Make a new link" })).toBeVisible({ timeout: 30_000 })
        await reviewShot(page, "c5d-feed-open", theme)
        await scrollsInItsBody(page, dialog)
        await reviewShot(page, "c5d-feed-end", theme)
      })
    })
  }

  test.describe(`a calendar in another app on a phone, ${theme}`, () => {
    test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: theme })
    test("the calendar options make the link", async ({ page }, testInfo) => {
      test.setTimeout(420_000)
      await open(page, testInfo)
      const dialog = await feedDialog(page, true)
      await expect(dialog.getByRole("button", { name: "Make a link" })).toBeVisible()
      const width = await page.evaluate(() => document.documentElement.scrollWidth)
      expect(width).toBeLessThanOrEqual(390)
      // On a phone a dialog is a sheet (components/ui/dialog): the screen's
      // width on its bottom edge once it has risen, and its close in a finger's
      // reach. It sat centred with a gutter (DESIGN-BUILD-8).
      await expect(dialog).toHaveAttribute("data-v3-sheet", "")
      await expect.poll(() => dialog.evaluate((el) => el.getAnimations().filter((a) => a.playState === "running").length)).toBe(0)
      const box = (await dialog.boundingBox())!
      expect(box.width, "the screen's width").toBeGreaterThanOrEqual(389)
      expect(Math.abs(box.y + box.height - 844), "on the bottom edge").toBeLessThanOrEqual(1)
      // Its footer bleeds through the sheet's bottom padding to its foot.
      const foot = (await dialog.locator("[data-dialog-footer]").boundingBox())!
      expect(Math.abs(foot.y + foot.height - 844), "the footer on the sheet's foot").toBeLessThanOrEqual(1)
      // Its foot is its gutter, never under 16px: the one rule for every phone sheet (V-73).
      await footIsGutter(dialog, "the calendar link's sheet")
      const reach = await dialog.getByRole("button", { name: "Close" }).evaluate((b) => {
        const r = getComputedStyle(b, "::before")
        return Math.min(parseFloat(r.width) || 0, parseFloat(r.height) || 0)
      })
      expect(reach, "Close under a finger").toBeGreaterThanOrEqual(44)
      await shot(page, "b8-feed-phone", theme)
    })
  })
}
