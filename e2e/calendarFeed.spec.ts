import { expect, test, type Page, type Request, type TestInfo } from "@playwright/test"

import { LAYERED_SCRIM, footIsGutter, scrimOverLayerBelow, scrollsInItsBody, topScrimFill } from "./sheetLayout"
import { SAM, reviewShot, stubBackend, withStatus } from "./stubbedApp"
import { BUSY_LOOK, FIELD_LOOK, busyPrimaryLook, disabledPrimaryLook } from "./controlLook"
import { animationsSettled } from "./settled"
import { expectTouchSize } from "./touchTarget"

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

const ASHA = { user_uuid: "u-asha", user_name: "Asha Rao", user_full_name: "Asha Rao", user_profile_object_key: "" }
/** The link to everything you can see, which a workspace admin stopped (basecamp-05). */
const STOPPED = { live: false, most: "full", stopped_by: ASHA, stopped_at: new Date(2026, 9, 19, 16).toISOString() }

/**
 * What the server answers for Personal's link: none yet, a live one, a failed
 * read, or a live one in a workspace that has turned links off (links_allowed).
 */
type Feed = "none" | "live" | "fails" | "off"

/** `made`: the link is made when it settles (a slow server), at once without it. */
/** Answers the test holds back until it lets them go: the link's read, and its stop. */
interface Held {
  read?: Promise<void>
  stop?: Promise<void>
}

async function open(page: Page, testInfo: TestInfo, feed: Feed = "none", made?: Promise<void>, held: Held = {}) {
  const puts: unknown[] = []
  await page.clock.setFixedTime(NOW)
  // A calendar's own link: Personal's, or a project's (basecamp-05 head 3), answered alike;
  // each link made is kept with the path it was made on.
  const calendarFeed = async (url: URL, request: Request) => {
      if (request.method() === "PUT") {
        puts.push({ path: url.pathname, ...request.postDataJSON() })
        await made
        return { msg: "ok", data: { live: true, url: "https://api.onecamp.example/public/calendar/7rKq2mX9vN4pL8sT1wY6zB3cF5hJ0dG.ics", scope: "full", most: "full", created_at: NOW.toISOString() } }
      }
      if (request.method() === "DELETE") {
        await held.stop
        return { msg: "ok", data: { live: false, most: "full" } }
      }
      if (feed === "fails") return withStatus(500, { msg: "internal error" })
      await held.read
      return {
        msg: "ok",
        data:
          feed === "none"
            ? { live: false, most: "full" }
            : { live: true, scope: "busy", most: "full", created_at: new Date(2026, 9, 18, 9).toISOString(), ...(feed === "off" ? { links_allowed: false } : {}) },
      }
    }
  await stubBackend(page, testInfo, {
    "/event/getEvents": { msg: "ok", data: [] },
    "/integration/google-calendar/status": { msg: "ok", data: { isConnected: false } },
    "/user/assignedTaskList": { msg: "ok", data: { user_tasks: [] } },
    "/event/bookingPages": { msg: "ok", data: [] },
    "/calendar/calendars/events": { msg: "ok", data: [], truncated: false },
    "/calendar/calendars/cal-me/feed": calendarFeed,
    "/calendar/calendars/cal-launch/feed": calendarFeed,
    // basecamp-05: the link to everything you can see; an admin stopped the last one.
    "/calendar/calendars/workspace/feed": (_url: URL, request: Request) =>
      request.method() === "PUT"
        ? (puts.push({ workspace: true, ...request.postDataJSON() }),
          { msg: "ok", data: { live: true, url: "https://api.onecamp.example/public/calendar/Qe8rT2yU5iO9pA3sD6fG1hJ4kL7zX0cV.ics", scope: "full", most: "full", created_at: NOW.toISOString() } })
        : { msg: "ok", data: STOPPED },
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
      await dialog.getByRole("radio", { name: "Everything", exact: true }).click()
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
      await animationsSettled(dialog)
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
      expectTouchSize(reach, "Close under a finger")
      await shot(page, "b8-feed-phone", theme)
    })
  })
}

// basecamp-05: one link to everything you can see, on the same dialog, which
// says who stopped the last one; and Settings > Permissions lists every
// member's link for an admin (never its address), each with Stop. At 1280 and
// on a phone (a sheet, its actions on its foot), in both themes.
const FEEDS = [
  { id: "f1", person: ASHA, target: "workspace", scope: "full", created_at: new Date(2026, 9, 20, 9).toISOString(), last_read_at: new Date(2026, 9, 21, 9).toISOString() },
  { id: "f2", person: { ...ASHA, user_uuid: "u-jonas", user_name: "Jonas Berg", user_full_name: "Jonas Berg" }, target: "calendar", calendar: { id: "cal-launch", kind: "project", name: "Launch" }, scope: "busy", created_at: new Date(2026, 9, 2, 9).toISOString() },
]

for (const theme of ["light", "dark"] as const) {
  for (const phone of [false, true]) {
    test.describe(`calendar links for everything ${phone ? "on a phone" : "at 1280"}, ${theme}`, () => {
      test.use(phone ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: theme } : { viewport: { width: 1280, height: 900 }, colorScheme: theme })

      test("the link to everything you can see says who stopped the last one, and makes a new one", async ({ page }, testInfo) => {
        test.setTimeout(420_000)
        const puts = await open(page, testInfo)
        const dialog = await feedDialog(page, phone)
        await dialog.getByRole("radio", { name: "Everything you can see" }).click()
        await expect(dialog.getByRole("heading", { name: "Show everything you can see in another app" })).toBeVisible()
        await expect(dialog.getByText("Asha Rao stopped this link on 19 Oct.", { exact: false })).toBeVisible()
        if (phone) {
          await expect(dialog).toHaveAttribute("data-v3-sheet", "")
          await animationsSettled(dialog)
          await footIsGutter(dialog, "the link to everything's sheet")
          expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
        }
        await shot(page, "bc05-everything-stopped", theme)
        await dialog.getByRole("radio", { name: "Everything", exact: true }).click()
        await dialog.getByRole("button", { name: "Make a link" }).click()
        await expect.poll(() => JSON.stringify(puts)).toContain('"workspace":true,"scope":"full"')
        await expect(dialog.getByRole("textbox", { name: "The link to everything you can see" })).toHaveValue(/\/public\/calendar\/.+\.ics$/)
        await shot(page, "bc05-everything-made", theme)
      })

      test("an admin sees every member's calendar link, never its address, and stops one", async ({ page }, testInfo) => {
        test.setTimeout(420_000)
        const stopped: string[] = []
        const policy = (key: string) => ({ key, kind: "bool", label: "", help: "", value: true, default: true, is_set: false })
        await page.clock.setFixedTime(NOW)
        await stubBackend(page, testInfo, {
          "/user/profile": { msg: "ok", data: { ...SAM, user_is_admin: true } },
          // The Calendars switches above the card read their policies, so the frame shows them, not a failed read.
          "/admin/policies": { msg: "ok", data: [policy("calendar.freebusy.members"), policy("calendar.feeds.allowed")] },
          "/admin/calendar/feeds": (url: URL, request: Request) =>
            request.method() === "DELETE" ? (stopped.push(url.pathname), { msg: "ok" }) : { msg: "ok", data: { feeds: FEEDS, more: false } },
        })
        await page.goto("/app/admin?tab=permissions", { waitUntil: "domcontentloaded", timeout: 120_000 })
        const card = page.locator("#permissions-calendar-links")
        const asha = card.locator("[data-calendar-feed='f1']")
        await expect(asha).toContainText("All calendars · Everything · Made yesterday · Last read 1h ago", { timeout: 120_000 })
        await expect(card.locator("[data-calendar-feed='f2']")).toContainText("Launch · When it's busy · Made 2 Oct · Never read")
        expect(await card.textContent()).not.toMatch(/https?:|\.ics/)
        // On a phone the frame shows the first row itself, with Stop on its own line
        // under the name (CR-326 F4), not the top of Permissions.
        await (phone ? asha : card).scrollIntoViewIfNeeded()
        await expect(asha).toBeInViewport()
        if (phone) {
          const named = await asha.getByText("Asha Rao", { exact: true }).boundingBox()
          const stopAt = await asha.getByRole("button", { name: "Stop Asha Rao's link" }).boundingBox()
          expect(stopAt!.y, "Stop sits on its own line under the name").toBeGreaterThanOrEqual(named!.y + named!.height)
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(phone ? 390 : 1280)
        await reviewShot(page, "bc05-admin-links", theme)
        await asha.getByRole("button", { name: "Stop Asha Rao's link" }).click()
        const confirm = page.getByRole("alertdialog", { name: "Stop Asha Rao's link?" })
        await expect(confirm).toBeVisible()
        if (phone) {
          await animationsSettled(confirm)
          await footIsGutter(confirm, "Stop Asha Rao's link?")
        }
        await reviewShot(page, "bc05-admin-stop", theme)
        await confirm.getByRole("button", { name: "Stop link" }).click()
        await expect(asha).toHaveCount(0)
        expect(stopped).toEqual(["/admin/calendar/feeds/f1"])
        await expect(page.locator(".toast-root").filter({ hasText: "Asha Rao's link is stopped" })).toBeVisible()
      })
      // Feeds are bearer links: a workspace admin turns every one off with one switch (calendar.feeds.allowed).
      test("an admin turns every calendar link off with one switch beside the links", async ({ page }, testInfo) => {
        test.setTimeout(420_000)
        const saved: unknown[] = []
        const policy = (key: string, value: boolean) => ({ key, kind: "bool", label: "", help: "", value, default: true, is_set: !value })
        let allowed = true
        await page.clock.setFixedTime(NOW)
        await stubBackend(page, testInfo, {
          "/user/profile": { msg: "ok", data: { ...SAM, user_is_admin: true } },
          "/admin/calendar/feeds": { msg: "ok", data: { feeds: FEEDS, more: false } },
          "/admin/policies": (url: URL, request: Request) => {
            if (request.method() !== "PUT") return { msg: "ok", data: [policy("calendar.freebusy.members", true), policy("calendar.feeds.allowed", allowed)] }
            saved.push([url.pathname, request.postDataJSON()])
            allowed = (request.postDataJSON() as { value: boolean }).value
            return { msg: "ok", data: policy("calendar.feeds.allowed", allowed) }
          },
        })
        await page.goto("/app/admin?tab=permissions", { waitUntil: "domcontentloaded", timeout: 120_000 })
        const sw = page.getByRole("switch", { name: /Members can show a calendar in another app/ })
        await expect(sw).toHaveAttribute("aria-checked", "true", { timeout: 120_000 })
        await expect(page.locator("#permissions-calendar-links")).toBeVisible()
        await sw.scrollIntoViewIfNeeded()
        // What Off does comes first, and all of it fits SwitchRow's two lines (CR-326 F2).
        const said = page.locator(`[id="${await sw.getAttribute("aria-describedby")}"]`)
        await expect(said).toHaveText("Off stops every link at once. On, members make their own secret links.")
        expect(await said.evaluate((el) => el.scrollHeight <= el.clientHeight + 1), "the switch's words are not cut off").toBe(true)
        // The whole row turns it, so the row is what a finger reaches.
        if (phone) expectTouchSize((await sw.locator("xpath=ancestor::*[contains(@class,'set-row')][1]").boundingBox())?.height, "the links switch's row under a finger")
        await sw.click()
        await expect(sw).toHaveAttribute("aria-checked", "false")
        expect(saved).toEqual([["/admin/policies/calendar.feeds.allowed", { value: false }]])
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(phone ? 390 : 1280)
        await reviewShot(page, "bc05-links-switch-off", theme)
      })
      test("with links off, a member's dialog says so and offers nothing to make or copy, before anything is pressed", async ({ page }, testInfo) => {
        test.setTimeout(420_000)
        // The link's read says the workspace has turned links off: the dialog says so as it opens.
        const puts = await open(page, testInfo, "off")
        const dialog = await feedDialog(page, phone)
        await expect(dialog.getByText("Links to other apps are off for this workspace", { exact: false })).toBeVisible()
        await expect(dialog.getByRole("button", { name: /Make a/ })).toHaveCount(0)
        await expect(dialog.getByRole("radio")).toHaveCount(0)
        await expect(dialog.getByRole("button", { name: "Copy" })).toHaveCount(0)
        await expect(dialog.getByRole("button", { name: "Stop the link" })).toBeVisible()
        if (phone) {
          await expect(dialog).toHaveAttribute("data-v3-sheet", "")
          await animationsSettled(dialog)
          await footIsGutter(dialog, "the links-off sheet")
          expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
        }
        await shot(page, "bc05-links-off", theme)
        await dialog.getByRole("button", { name: "Done" }).click()
        await expect(dialog).toHaveCount(0)
        expect(puts).toEqual([])
      })
    })
  }
}

// basecamp-05 head 3: a phone makes a link to a project's calendar from beside its row in the
// calendar options, in the same dialog as the computer's row menu: made and copied; a live one stopped.
for (const theme of ["light", "dark"] as const) {
  test.describe(`a project's calendar in another app on a phone, ${theme}`, () => {
    test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: theme })
    test("makes and copies its link from beside its row", async ({ page }, testInfo) => {
      test.setTimeout(420_000)
      const puts = await open(page, testInfo)
      await page.getByRole("button", { name: "Calendar options" }).click({ timeout: 60_000 })
      const entry = page.getByRole("button", { name: "Show Launch in another app" })
      const box = await entry.boundingBox()
      expectTouchSize(Math.min(box?.width ?? 0, box?.height ?? 0), "Show Launch in another app under a finger")
      await shot(page, "h3-project-row", theme)
      await entry.click()
      const dialog = page.locator("[data-feed-dialog]")
      await expect(dialog.getByText("Show \u201cLaunch\u201d in another app")).toBeVisible()
      await dialog.getByRole("button", { name: "Make a link" }).click()
      await expect.poll(() => puts.length).toBe(1)
      // Made on Launch's calendar, not Personal's.
      expect(puts[0]).toMatchObject({ path: expect.stringMatching(/\/calendar\/calendars\/cal-launch\/feed$/) })
      const link = dialog.getByRole("textbox", { name: "The calendar's link" })
      await expect(link).toHaveValue(/\/public\/calendar\/.+\.ics$/)
      await dialog.getByRole("button", { name: /^Copy/ }).click()
      // The Copied button (it reads Copied for 1.5 s) sits whole inside the sheet: the box
      // that clips the sheet's body hides what runs past its content edge, so the sheet
      // never scrolls and only the button's own edge shows it.
      const copied = dialog.getByRole("button", { name: "Copied" })
      await expect(copied).toBeVisible()
      const fit = await copied.evaluate((b) => {
        let box = b.parentElement
        while (box && getComputedStyle(box).overflowX === "visible") box = box.parentElement
        const s = box && getComputedStyle(box)
        const edge = box && s ? box.getBoundingClientRect().right - parseFloat(s.borderRightWidth) - parseFloat(s.paddingRight) : window.innerWidth
        return { right: Math.round(b.getBoundingClientRect().right), edge: Math.round(edge) }
      })
      expect(fit.right).toBeLessThanOrEqual(fit.edge)
      await shot(page, "h3-project-made", theme)
      // Nothing on the sheet is wider than the phone.
      const wide = await dialog.evaluate((d) => d.scrollWidth - d.clientWidth)
      expect(wide).toBeLessThanOrEqual(0)
      // A link just made is shown once, with Done: it's stopped from the dialog when it's opened again.
      await dialog.getByRole("button", { name: "Done" }).click()
      await expect(dialog).toHaveCount(0)
    })
    test("stops a live link from beside its row", async ({ page }, testInfo) => {
      test.setTimeout(420_000)
      const puts = await open(page, testInfo, "live")
      await page.getByRole("button", { name: "Calendar options" }).click({ timeout: 60_000 })
      await page.getByRole("button", { name: "Show Launch in another app" }).click()
      const dialog = page.locator("[data-feed-dialog]")
      await dialog.getByRole("button", { name: "Stop the link" }).click()
      await expect(dialog.getByRole("button", { name: "Make a link" })).toBeVisible()
      expect(puts).toEqual([])
      await shot(page, "h3-project-stopped", theme)
    })
  })
}
