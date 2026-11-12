import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test"

import { reviewShot, stubBackend } from "./stubbedApp"
import { animationsSettled } from "./settled"
import { expectPinWhole, fadeOf, scrollRoom, timelines } from "./sheetFade"

// A drawer taller than the phone stopped on a whole row and read as its end:
// the calendar's options at 390x844 showed "Show weekends" last, with Week
// numbers, Week starts on and Done below and no sign of them (V-619, 6 Nov
// 2026). The sheet's one scroller fades the edge it has more past, with the
// column fade every scroller has (app/interaction.css, data-edge-fade="block"):
// at rest only its foot fades, at its end only its top, and a sheet that fits
// fades nothing. A pinned footer sits outside the scroller, never under the
// fade, and a part pinned to an edge inside it (the emoji sheet's search) keeps
// that edge whole, as a menu's group that destroys keeps its foot. Where scroll
// timelines aren't, the scroller clips as before. An empty week has a second
// "New event" (its own line's), so the toolbar's is found by its label. With
// SHOTS_DIR set, each sheet is saved for review.

const NOW = new Date(2026, 9, 21, 10, 0)

async function openCalendar(page: Page, testInfo: TestInfo, google = false) {
  await page.clock.setFixedTime(NOW)
  await page.addInitScript(() => {
    try {
      localStorage.setItem("oc_keys_tip_seen", "1")
    } catch {
      /* storage blocked */
    }
  })
  await stubBackend(page, testInfo, {
    "/event/getEvents": { msg: "ok", data: [] },
    "/integration/google-calendar/status": { msg: "ok", data: google ? { isConnected: true, accountEmail: "sam@example.com" } : { isConnected: false } },
    "/user/assignedTaskList": { msg: "ok", data: { user_tasks: [] } },
    "/event/bookingPages": { msg: "ok", data: [] },
    "/calendar/sync/google": { msg: "ok", data: { provider: "google", state: "none", progress: 0, moved: 0, unchanged: 0 } },
    "/calendar/calendars/events": { msg: "ok", data: [], truncated: false },
    "/calendar/calendars": { msg: "ok", data: [{ id: "cal-me", name: "Personal", kind: "personal", access: "manage", mine: true }] },
  })
  await page.goto("/app/calendar?date=2026-10-21&view=week", { waitUntil: "domcontentloaded", timeout: 120_000 })
  await expect(page.locator("[data-period]")).toBeVisible({ timeout: 240_000 })
}

/** What the scroller fades at rest, then at its end: only its foot, then only its top (or, with no scroll timelines, nothing, unmasked). */
async function expectFadesTheEdgeWithMore(page: Page, scroller: Locator) {
  await expect.poll(() => scrollRoom(scroller), { message: "the sheet fits: no scroll room to fade" }).toBeGreaterThan(48)
  const on = await timelines(page)
  const atRest = on ? { mark: "block", masked: true, top: "0px", foot: "24px" } : { mark: "block", masked: false, top: "0px", foot: "0px" }
  const atEnd = on ? { mark: "block", masked: true, top: "24px", foot: "0px" } : atRest
  await expect.poll(() => fadeOf(scroller), { message: "at rest, with more below" }).toEqual(atRest)
  await scroller.evaluate((el) => void (el.scrollTop = el.scrollHeight))
  await expect.poll(() => fadeOf(scroller), { message: "at its end" }).toEqual(atEnd)
  await scroller.evaluate((el) => void (el.scrollTop = 0))
  await expect.poll(() => fadeOf(scroller)).toEqual(atRest)
}

for (const theme of ["light", "dark"] as const) {
  test.describe(`a sheet taller than the phone, ${theme}`, () => {
    test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: theme })

    test("the calendar's options fade their foot while there is more below, and nothing once they fit", async ({ page }, testInfo) => {
      test.setTimeout(300_000)
      await openCalendar(page, testInfo)
      await page.getByRole("button", { name: "Calendar options" }).tap({ timeout: 60_000 })
      const sheet = page.locator("[data-vaul-drawer]").filter({ has: page.locator("[data-drawer-view-options]") })
      await animationsSettled(sheet)
      const body = sheet.locator("[data-sheet-body]")
      await expectFadesTheEdgeWithMore(page, body)
      await reviewShot(page, "sheet-fade-options", theme)
      await body.evaluate((el) => void (el.scrollTop = el.scrollHeight))
      await expect(sheet.getByRole("button", { name: "Done", exact: true })).toBeInViewport({ ratio: 1 })
      await reviewShot(page, "sheet-fade-options-end", theme)

      // On a phone tall enough to hold it all, the sheet opens with no scroll room, so no timeline and no fade.
      await page.keyboard.press("Escape")
      await expect(sheet).toHaveCount(0)
      await page.setViewportSize({ width: 390, height: 2400 })
      await page.getByRole("button", { name: "Calendar options" }).tap({ timeout: 60_000 })
      await animationsSettled(sheet)
      await expect.poll(() => scrollRoom(body)).toBe(0)
      await expect.poll(() => fadeOf(body)).toEqual({ mark: "block", masked: await timelines(page), top: "0px", foot: "0px" })
    })

    test("New event fades its form above the pinned footer, never the footer", async ({ page }, testInfo) => {
      test.setTimeout(300_000)
      await openCalendar(page, testInfo)
      await page.getByLabel("New event", { exact: true }).tap({ timeout: 60_000 })
      const sheet = page.locator("[data-vaul-drawer][data-event-dialog]")
      await expect(sheet.getByRole("textbox", { name: "Title" })).toBeVisible({ timeout: 60_000 })
      await animationsSettled(sheet)
      // Its form is the body the sheet holds (components/ui/overlay), so the sheet's one scroller.
      const form = sheet.locator("[data-overlay-body]")
      await expectFadesTheEdgeWithMore(page, form)
      await reviewShot(page, "sheet-fade-new-event", theme)

      // The footer is the sheet's, under the scroller, with nothing masked from it up to the sheet.
      const footer = sheet.locator("[data-sheet-footer]")
      await expect(footer.getByRole("button", { name: "Create event" })).toBeInViewport({ ratio: 1 })
      const where = await footer.evaluate((el) => {
        const sheet = el.closest("[data-vaul-drawer]")!
        const masked: string[] = []
        for (let at: Element | null = el; at && at !== sheet.parentElement; at = at.parentElement) {
          const s = getComputedStyle(at)
          if ((s.getPropertyValue("mask-image") || s.getPropertyValue("-webkit-mask-image") || "none") !== "none") masked.push(at.tagName + [...at.attributes].map((a) => `[${a.name}]`).join(""))
        }
        const faded = sheet.querySelectorAll('[data-edge-fade="block"]')
        const under = [...faded].filter((f) => f.contains(el))
        const footTop = el.getBoundingClientRect().top
        const lowest = Math.max(...[...faded].map((f) => f.getBoundingClientRect().bottom))
        return { masked, under: under.length, clear: lowest <= footTop + 0.5 }
      })
      expect(where, "the footer is under a fade").toEqual({ masked: [], under: 0, clear: true })
      // Its Create event takes a tap where it is drawn.
      const hit = await footer.getByRole("button", { name: "Create event" }).evaluate((b) => {
        const r = b.getBoundingClientRect()
        return b.contains(document.elementFromPoint(r.left + r.width / 2, r.bottom - 4))
      })
      expect(hit, "Create event's foot isn't the button's").toBe(true)
    })
  })

  test.describe(`a part pinned to a sheet's edge, ${theme}`, () => {
    test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: theme })

    test("the emoji sheet's search stays whole as its grid scrolls under it", async ({ page }, testInfo) => {
      test.setTimeout(300_000)
      await stubBackend(page, testInfo, {
        "/user/getAllUserEmojiStatusList": { msg: "ok", data: [] },
        // Home's own cards, answered empty: none is left to the stub's toast, whenever the shot is taken.
        "/activity/unified": { msg: "ok", data: { activities: [] } },
        "/user/assignedTaskList": { msg: "ok", data: { user_tasks: [] } },
        "/approvals/waiting": { msg: "ok", data: { items: [] } },
        "/event/getEvents": { msg: "ok", data: [] },
        "/project/overview": { msg: "ok", data: { projects: [] } },
        "/ch/suggested": { msg: "ok", data: [] },
        "/drafts": { msg: "ok", data: { drafts: [], max: 500 } },
        "/checkins": { msg: "ok", data: { checkins: [], can_edit: false } },
      })
      await page.goto("/app/home", { waitUntil: "domcontentloaded", timeout: 180_000 })
      await page.getByRole("button", { name: "Your profile" }).first().click({ timeout: 120_000 })
      await page.getByRole("button", { name: /^(Set a status|Change your status)$/ }).click({ timeout: 60_000 })
      await page.getByRole("button", { name: "Choose a status emoji" }).click({ timeout: 60_000 })
      const sheet = page.locator("[data-vaul-drawer][data-emoji-sheet]")
      const search = sheet.getByRole("searchbox", { name: "Search emoji" })
      await expect(search).toBeVisible({ timeout: 60_000 })
      await animationsSettled(sheet)
      await expect.poll(() => scrollRoom(sheet.locator("[data-sheet-body]"))).toBeGreaterThan(400)
      // Scrolled, with more above and below: the foot fades, and the top, where the search is, doesn't.
      await expectPinWhole(page, search, "top")
      await reviewShot(page, "sheet-fade-emoji-scrolled", theme)
    })

    test("a menu's group that destroys stays whole at its foot, and the top still fades once scrolled", async ({ page }, testInfo) => {
      test.setTimeout(300_000)
      // Google connected: the calendar's options end on Disconnect, alone and last, kept at the menu's foot (app/phone.css C7).
      await openCalendar(page, testInfo, true)
      await page.getByRole("button", { name: "Calendar options" }).tap({ timeout: 60_000 })
      const sheet = page.locator("[data-vaul-drawer]").filter({ has: page.locator("[data-drawer-view-options]") })
      await animationsSettled(sheet)
      const body = sheet.locator("[data-sheet-body]")
      await expect.poll(() => scrollRoom(body)).toBeGreaterThan(48)
      const on = await timelines(page)
      // At rest, with more below: the foot, where Disconnect stays, doesn't fade.
      await expect.poll(() => fadeOf(body)).toEqual({ mark: "block", masked: on, top: "0px", foot: "0px" })
      const danger = sheet.getByRole("group", { name: "Disconnect" })
      const kept = () => danger.evaluate((g) => {
        const el = g.closest("[data-sheet-body]")!
        const b = el.getBoundingClientRect()
        const r = g.getBoundingClientRect()
        // Sticky at bottom: 8px (app/phone.css): its foot sits 8px above the body's visible foot, or 8px above the
        // body's bottom padding where the engine keeps a sticky box inside it; never lower, never further up.
        const foot = Math.min(b.bottom, window.innerHeight)
        const gap = foot - r.bottom
        const pad = parseFloat(getComputedStyle(el).paddingBottom) || 0
        return { atFoot: gap >= 7 && gap <= 8 + pad + 1, whole: r.top >= b.top && r.bottom <= foot, gap, pad }
      })
      const k = await kept()
      expect({ atFoot: k.atFoot, whole: k.whole }, `Disconnect isn't kept whole at the menu's foot (${JSON.stringify(k)})`).toEqual({ atFoot: true, whole: true })
      // What scrolls under it fades into the sheet over its top edge, a band in the sheet's colour, while there is
      // more below; a card's edge cut off behind it read as the menu's end (V-619 F1). Every engine: no timeline.
      const band = () => danger.evaluate((g) => / 0px -20px 16px 0px/.test(getComputedStyle(g).boxShadow))
      await expect.poll(band, { message: "no fade band over Disconnect at rest" }).toBe(true)
      await reviewShot(page, "sheet-fade-menu-danger", theme)
      // Scrolled to its end, with more above: the top fades as any sheet's, and the band, with nothing under it, is gone.
      await body.evaluate((el) => void (el.scrollTop = el.scrollHeight))
      await expect.poll(() => fadeOf(body)).toEqual({ mark: "block", masked: on, top: on ? "24px" : "0px", foot: "0px" })
      await expect.poll(band, { message: "the band over Disconnect stays at the menu's end" }).toBe(false)
      await reviewShot(page, "sheet-fade-menu-danger-end", theme)
    })
  })

  test.describe(`on a computer, ${theme}`, () => {
    test.use({ viewport: { width: 1280, height: 860 }, colorScheme: theme })

    test("the options and New event are a popover and a dialog, drawn as they were", async ({ page }, testInfo) => {
      test.setTimeout(300_000)
      await openCalendar(page, testInfo)
      await page.getByRole("button", { name: "View options" }).click({ timeout: 60_000 })
      await expect(page.getByRole("switch", { name: "Show weekends" })).toBeVisible({ timeout: 30_000 })
      expect(await page.locator("[data-vaul-drawer]").count(), "a sheet on a computer").toBe(0)
      await reviewShot(page, "sheet-fade-options", theme)
      await page.keyboard.press("Escape")
      await page.getByLabel("New event", { exact: true }).click({ timeout: 60_000 })
      const dialog = page.locator('[role="dialog"][data-event-dialog]')
      await expect(dialog.getByRole("textbox", { name: "Title" })).toBeVisible({ timeout: 60_000 })
      expect(await page.locator("[data-vaul-drawer]").count(), "a sheet on a computer").toBe(0)
      expect(await dialog.locator("[data-edge-fade]").count(), "a fade in the computer's dialog").toBe(0)
      await reviewShot(page, "sheet-fade-new-event", theme)
    })
  })
}
