import { expect, test, type Locator, type Page, type Request, type TestInfo } from "@playwright/test"

import { finger } from "./finger"
import { animationsSettled } from "./settled"
import { footIsGutter } from "./sheetLayout"
import { CALENDAR_READS, SAM, SHOT_THEMES, logFailures, reviewShot, stubBackend, withStatus } from "./stubbedApp"
import { expectFingerReach } from "./toasts"

// CAL-40 (UX-CALPLAN H1): a delete said "This can't be undone." though the
// event goes to the calendar's Trash, offered no Undo, and never asked
// whether to tell its guests. An event with nobody else on it now goes at
// once, through the calendar's own API, with Undo, which brings it back
// (POST /calendar/events/{id}/restore); a meeting with guests asks "Tell your
// guests it's cancelled?" as its one question. At 1280 by the Delete key, and
// at 390 from the menu a held finger opens. The event's panel (1280) and its
// own page (390) delete the same way: they said "can't be undone" and offered
// no Undo; they close as the toast comes, never drawing "This event isn't
// available" between. A refused delete (a 500, then a 409) keeps the event and
// its panel or page, with the request's own "Couldn't delete the event" and no
// "Deleted". An instance of a series, once its scope and its guests are asked,
// and a booked meeting, once its own question names its guest, go to the Trash
// and offer Open Trash rather than Undo; it opens over the calendar, a dialog
// at 1280 and a drawer with Done at its foot at 390, the event listed. With
// SHOTS_DIR set, the toasts, the questions and the Trash are saved, light and
// dark.

const NOW = new Date(2026, 9, 19, 8, 0)
const at = (day: number, hour: number) => new Date(2026, 9, day, hour).toISOString()
const DENTIST = "0c1d2e3f-0000-4000-8000-00000000d001"
const REVIEW = "0c1d2e3f-0000-4000-8000-00000000d002"
// One instance of a repeating standup (lib/calendar/instanceId), and a meeting booked through a booking page.
const STANDUP = "0c1d2e3f-0000-4000-8000-00000000d003_20261019T053000Z"
const BOOKED = "0c1d2e3f-0000-4000-8000-00000000d004"
const ALEX = { email: "alex@example.com", name: "Alex Kim", role: "required", response: "needs_action" }

interface Sent {
  method: string
  path: string
  query: string
}

interface More {
  /** The standup's instance and the booked meeting on the day too. */
  extra?: boolean
  /** The DELETEs the server refuses, in turn, by their status and its words. */
  refusals?: { status: number; msg: string }[]
}

async function open(page: Page, testInfo: TestInfo, view: "week" | "day", panel?: string, more: More = {}) {
  const sent: Sent[] = []
  const deleted = new Set<string>()
  const refusals = [...(more.refusals ?? [])]
  const events = [
    { event_uuid: DENTIST, event_title: "Dentist", event_start_time: at(19, 10), event_end_time: at(19, 11), event_created_by: SAM, event_participants: [] },
    { event_uuid: REVIEW, event_title: "Design review", event_start_time: at(19, 14), event_end_time: at(19, 15), event_created_by: SAM, event_participants: [], event_guests: [ALEX] },
    ...(more.extra
      ? [
          { event_uuid: STANDUP, event_title: "Standup", event_start_time: at(19, 11), event_end_time: at(19, 12), event_created_by: SAM, event_participants: [], event_guests: [ALEX] },
          {
            event_uuid: BOOKED,
            event_title: "Intro call",
            event_start_time: at(19, 16),
            event_end_time: at(19, 17),
            event_created_by: SAM,
            event_participants: [],
            event_booking: { guest_name: "Priya Shah", page_title: "Intro calls", guest_told: true },
          },
        ]
      : []),
  ]
  await page.clock.setFixedTime(NOW)
  await page.addInitScript(() => {
    try {
      localStorage.setItem("oc_keys_tip_seen", "1")
    } catch {
      /* storage blocked */
    }
  })
  await stubBackend(page, testInfo, {
    ...CALENDAR_READS,
    "/config/client": { msg: "ok", data: { features: { calendar_repeats: true } } },
    "/event/getEvents": () => ({ msg: "ok", data: events.filter((e) => !deleted.has(e.event_uuid)) }),
    "/event/bookingPages": { msg: "ok", data: [] },
    "/calendar/sync/google": { msg: "ok", data: { provider: "google", state: "none", progress: 0, moved: 0, unchanged: 0 } },
    "/calendar/calendars/events": { msg: "ok", data: [], truncated: false },
    // The calendar's Trash (lib/calendar/trash): what was deleted, newest first.
    "/calendar/events/trash": () => ({
      msg: "ok",
      data: events
        .filter((e) => deleted.has(e.event_uuid))
        .reverse()
        .map((e) => ({ id: e.event_uuid, title: e.event_title, start: { at: e.event_start_time }, end: { at: e.event_end_time }, all_day: false, hue: "sky", deleted_at: NOW.toISOString(), deleted_by: SAM })),
    }),
    "/calendar/events/": (url: URL, request: Request) => {
      // As the API has it, whatever the backend's base path.
      const path = url.pathname.slice(url.pathname.indexOf("/calendar/events/"))
      const id = decodeURIComponent(path.split("/")[3] ?? "")
      if (request.method() !== "GET") sent.push({ method: request.method(), path, query: url.search })
      if (request.method() === "DELETE") {
        const refused = refusals.shift()
        if (refused) return withStatus(refused.status, { msg: refused.msg })
        deleted.add(id)
      }
      if (request.method() === "POST" && url.pathname.endsWith("/restore")) deleted.delete(id)
      if (request.method() === "GET" && path.endsWith("/call/artefacts")) return { msg: "ok", data: [] }
      const e = events.find((x) => x.event_uuid === id)
      // The panel's read of the calendar's own API: the version a delete is sent at.
      if (request.method() === "GET" && e) return { msg: "ok", data: { id, kind: "event", title: e.event_title, sequence: 1, all_day: false, start: { at: e.event_start_time }, end: { at: e.event_end_time }, attendees: [], organiser: { user_uuid: SAM.user_uuid } } }
      return { msg: "ok", data: {} }
    },
    // The event's panel reads it by its id.
    "/event/getEvent/": (url: URL) => {
      const e = events.find((x) => url.pathname.endsWith(`/${x.event_uuid}`) && !deleted.has(x.event_uuid))
      return e ? { msg: "ok", data: e } : withStatus(404, { msg: "not found" })
    },
  })
  if (panel) {
    // The event beside the week (1280), or its own page (390).
    await page.goto(view === "day" ? `/app/calendar/event/${panel}` : `/app/calendar?date=2026-10-19&view=week&event=${panel}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
    await expect(page.getByText(events.find((e) => e.event_uuid === panel)!.event_title).first()).toBeVisible({ timeout: 240_000 })
    await page.waitForTimeout(800)
    return { sent, block: (id: string) => page.locator(`[data-hue-block][data-event-uuid="${id}"]`) }
  }
  await page.goto(`/app/calendar?date=2026-10-19&view=${view}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
  await expect(page.locator("[data-period]")).toBeVisible({ timeout: 240_000 })
  await expect(page.locator(`[data-hue-block][data-event-uuid="${DENTIST}"]`)).toBeVisible({ timeout: 30_000 })
  // The reveal is over, so nothing is still moving in.
  await page.waitForTimeout(800)
  return { sent, block: (id: string) => page.locator(`[data-hue-block][data-event-uuid="${id}"]`) }
}

/** A finger held still on a block, then lifted: the block's menu, open. */
async function heldMenu(page: Page, block: Locator): Promise<Locator> {
  const b = (await block.boundingBox())!
  const touch = await finger(page)
  await touch.down(b.x + b.width / 2, b.y + b.height / 2)
  await page.waitForTimeout(400)
  await touch.up()
  const menu = page.locator("[data-event-menu]")
  await expect(menu).toBeVisible({ timeout: 10_000 })
  return menu
}

const toastOf = (page: Page, title: string) => page.locator(".toast-card").filter({ hasText: title })
const UNAVAILABLE = "This event isn't available"

/**
 * From now on, each time `text` is drawn, if only for a frame: a MutationObserver over the whole page sees what a
 * still or a poll between frames can miss. The reader gives null once the page has loaded again, so a reload never
 * passes for a page that drew nothing.
 */
async function watchFor(page: Page, text: string): Promise<() => Promise<string[] | null>> {
  await page.evaluate((t) => {
    const drawn: string[] = []
    const has = (n: Node) => (n.textContent ?? "").includes(t)
    if (has(document.body)) drawn.push("drawn already")
    new MutationObserver((records) => {
      for (const r of records) if (r.type === "characterData" ? has(r.target) : [...r.addedNodes].some(has)) drawn.push(`drawn at ${Math.round(performance.now())} ms`)
    }).observe(document.body, { childList: true, subtree: true, characterData: true })
    ;(window as unknown as { drawn?: string[] }).drawn = drawn
  }, text)
  return () => page.evaluate(() => (window as unknown as { drawn?: string[] }).drawn ?? null)
}

/**
 * The Trash that a toast's Open Trash opens, `title` listed in it, over the calendar: a dialog at 1280, and at 390 a
 * drawer the screen's width on its bottom edge, Done pinned at its foot.
 */
async function trashListing(page: Page, id: string, title: string): Promise<Locator> {
  const trash = page.getByRole("dialog", { name: "Trash" })
  await expect(trash.locator(`[data-trash-event="${id}"]`)).toContainText(title, { timeout: 20_000 })
  await expect(page.locator("[data-period]")).toBeVisible()
  await animationsSettled(trash)
  const box = (await trash.boundingBox())!
  if (page.viewportSize()!.width > 640) {
    expect(box.width, "a dialog, not the screen's width").toBeLessThan(900)
    return trash
  }
  expect(box.width, "the screen's width").toBeGreaterThanOrEqual(389)
  expect(Math.abs(box.y + box.height - 844), "on the bottom edge").toBeLessThanOrEqual(1)
  await footIsGutter(trash, "the Trash's drawer")
  await expect(trash.getByRole("button", { name: "Done" })).toBeInViewport()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  return trash
}

// The refused deletes: the server's fault, then a newer version; each toast in the request's own words.
const REFUSALS = [
  { status: 500, msg: "internal error", why: "The server hit a problem. Try again in a moment." },
  { status: 409, msg: "", why: "Someone changed this at the same time. Refresh and try again." },
]

/** A refused delete's toast, and no "Deleted" toast, a moment on too. */
async function saysRefused(page: Page, why: string) {
  await expect(toastOf(page, why)).toContainText("Couldn't delete the event")
  await page.waitForTimeout(500)
  await expect(page.locator(".toast-card").filter({ hasText: /Deleted “/ })).toHaveCount(0)
}

for (const theme of SHOT_THEMES) {
  test.describe(`deleting from the week at 1280, ${theme}`, () => {
    test.use({ viewport: { width: 1280, height: 900 }, colorScheme: theme })
    test.beforeEach(({ page }) => logFailures(page))

    test("an event deleted with the Delete key goes at once, and comes back with Undo", async ({ page }, testInfo) => {
      test.setTimeout(420_000)
      const { sent, block } = await open(page, testInfo, "week")
      await block(DENTIST).focus()
      await page.keyboard.press("Delete")
      await expect.poll(() => sent.length).toBe(1)
      expect(sent[0]).toEqual({ method: "DELETE", path: `/calendar/events/${DENTIST}`, query: "?scope=all" })
      await expect(page.getByRole("alertdialog")).toHaveCount(0)
      await expect(block(DENTIST)).toHaveCount(0)
      const deleted = toastOf(page, "Deleted “Dentist”")
      await expect(deleted).toBeVisible()
      await expect(deleted).not.toContainText("can't be undone")
      await reviewShot(page, "delete-undo-toast", theme)

      await deleted.getByRole("button", { name: "Undo" }).click()
      await expect.poll(() => sent.length).toBe(2)
      expect(sent[1]).toEqual({ method: "POST", path: `/calendar/events/${DENTIST}/restore`, query: "" })
      await expect(block(DENTIST)).toBeVisible({ timeout: 15_000 })
      await expect(toastOf(page, "Undone")).toBeVisible()
    })

    test("a meeting with guests asks whether to tell them it's cancelled, and Don't send deletes it without emailing them", async ({ page }, testInfo) => {
      test.setTimeout(420_000)
      const { sent, block } = await open(page, testInfo, "week")
      await block(REVIEW).focus()
      await page.keyboard.press("Delete")
      const ask = page.getByRole("dialog", { name: "Tell your guests it's cancelled?" })
      await expect(ask).toBeVisible({ timeout: 15_000 })
      expect(sent).toEqual([])
      await reviewShot(page, "delete-tell-guests", theme)
      // Closed, it stays.
      await page.keyboard.press("Escape")
      await expect(ask).toHaveCount(0)
      await page.waitForTimeout(500)
      expect(sent).toEqual([])
      await expect(block(REVIEW)).toBeVisible()

      await block(REVIEW).focus()
      await page.keyboard.press("Delete")
      await page.getByRole("dialog", { name: "Tell your guests it's cancelled?" }).getByRole("button", { name: "Don't send" }).click()
      await expect.poll(() => sent.length).toBe(1)
      expect(sent[0]).toEqual({ method: "DELETE", path: `/calendar/events/${REVIEW}`, query: "?scope=all&notify=none" })
      await expect(toastOf(page, "Deleted “Design review”")).toContainText("Guests weren't emailed.")
      await expect(block(REVIEW)).toHaveCount(0)
    })

    test("the event's panel asks whether to tell its guests, never that it can't be undone, and Undo brings it back", async ({ page }, testInfo) => {
      test.setTimeout(420_000)
      const { sent, block } = await open(page, testInfo, "week", REVIEW)
      await page.getByRole("button", { name: "Delete event" }).click()
      const ask = page.getByRole("dialog", { name: "Tell your guests it's cancelled?" })
      await expect(ask).toBeVisible({ timeout: 15_000 })
      await expect(page.getByText("can't be undone")).toHaveCount(0)
      expect(sent).toEqual([])
      await reviewShot(page, "delete-panel-tell-guests", theme)
      const unavailable = await watchFor(page, UNAVAILABLE)
      await ask.getByRole("button", { name: "Send", exact: true }).click()
      await expect.poll(() => sent.length).toBe(1)
      expect(sent[0]).toEqual({ method: "DELETE", path: `/calendar/events/${REVIEW}`, query: "?scope=all&sequence=1" })
      const deleted = toastOf(page, "Deleted “Design review”")
      await expect(deleted).toBeVisible()
      await expect(deleted).not.toContainText("can't be undone")
      // The panel closed as the toast came, without "This event isn't available" between.
      await expect(page.getByRole("button", { name: "Delete event" })).toHaveCount(0)
      expect(await unavailable(), `"${UNAVAILABLE}" as the panel closed`).toEqual([])
      await reviewShot(page, "delete-panel-undo-toast", theme)
      await deleted.getByRole("button", { name: "Undo" }).click()
      await expect.poll(() => sent.length).toBe(2)
      expect(sent[1]).toEqual({ method: "POST", path: `/calendar/events/${REVIEW}/restore`, query: "" })
      await expect(block(REVIEW)).toBeVisible({ timeout: 15_000 })
    })

    test("a refused delete keeps the event and its panel open, and says why in the request's own words, never Deleted", async ({ page }, testInfo) => {
      test.setTimeout(420_000)
      const { sent, block } = await open(page, testInfo, "week", REVIEW, { refusals: REFUSALS })
      for (const [i, { why }] of REFUSALS.entries()) {
        await page.getByRole("button", { name: "Delete event" }).click()
        const ask = page.getByRole("dialog", { name: "Tell your guests it's cancelled?" })
        await ask.getByRole("button", { name: "Send", exact: true }).click()
        await expect.poll(() => sent.length).toBe(i + 1)
        expect(sent[i]).toEqual({ method: "DELETE", path: `/calendar/events/${REVIEW}`, query: "?scope=all&sequence=1" })
        await saysRefused(page, why)
        await expect(ask).toHaveCount(0)
        // It stays, on the week and in its open panel.
        await expect(block(REVIEW)).toBeVisible()
        await expect(page.getByRole("button", { name: "Delete event" })).toBeVisible()
        await expect(page).toHaveURL(new RegExp(`event=${REVIEW}`))
        if (i === 0) await reviewShot(page, "delete-refused", theme)
      }
    })

    test("an instance of a series asks which of it, then about its guest, and goes to the Trash, which Open Trash opens over the week", async ({ page }, testInfo) => {
      test.setTimeout(420_000)
      const { sent, block } = await open(page, testInfo, "week", undefined, { extra: true })
      await block(STANDUP).focus()
      await page.keyboard.press("Delete")
      const which = page.getByRole("dialog", { name: "Delete a repeating event" })
      await which.getByRole("radio", { name: "This and following events" }).click()
      await which.getByRole("button", { name: "Delete", exact: true }).click()
      await page.getByRole("dialog", { name: "Tell your guests it's cancelled?" }).getByRole("button", { name: "Don't send" }).click()
      await expect.poll(() => sent.length).toBe(1)
      expect(sent[0]).toEqual({ method: "DELETE", path: `/calendar/events/${STANDUP}`, query: "?scope=following&notify=none" })
      await expect(block(STANDUP)).toHaveCount(0)
      const moved = toastOf(page, "Moved “Standup” to the Trash")
      await expect(moved).toContainText("This and the following events. Guests weren't emailed.")
      await expect(moved.getByRole("button", { name: "Undo" })).toHaveCount(0)
      await reviewShot(page, "delete-series-trash-toast", theme)
      await moved.getByRole("button", { name: "Open Trash" }).click()
      await trashListing(page, STANDUP, "Standup")
      // The week it was showing.
      await expect(page).toHaveURL(/date=2026-10-19/)
      await expect(page).toHaveURL(/view=week/)
    })

    test("a booked meeting asks in its own words, and offers the Trash, which opens over the week its panel was beside", async ({ page }, testInfo) => {
      test.setTimeout(420_000)
      const { sent } = await open(page, testInfo, "week", BOOKED, { extra: true })
      await page.getByRole("button", { name: "Delete event" }).click()
      const ask = page.getByRole("alertdialog", { name: "Delete this booked meeting?" })
      await expect(ask).toContainText("Priya Shah booked it through Intro calls. We'll email them that it's cancelled.")
      await ask.getByRole("button", { name: "Delete and tell Priya Shah" }).click()
      await expect.poll(() => sent.length).toBe(1)
      expect(sent[0]).toEqual({ method: "DELETE", path: `/calendar/events/${BOOKED}`, query: "?scope=all&sequence=1" })
      const deleted = toastOf(page, "Deleted “Intro call”")
      await expect(deleted).toContainText("It's in your calendar's Trash.")
      await expect(deleted.getByRole("button", { name: "Undo" })).toHaveCount(0)
      await reviewShot(page, "delete-booked-trash-toast", theme)
      await deleted.getByRole("button", { name: "Open Trash" }).click()
      await trashListing(page, BOOKED, "Intro call")
      // The week the panel was beside, the deleted event no longer open, and the Trash not in the address.
      await expect(page).toHaveURL(/date=2026-10-19/)
      await expect(page).toHaveURL(/view=week/)
      await expect(page).not.toHaveURL(/event=|trash=/)
      await reviewShot(page, "delete-open-trash", theme)
    })
  })

  test.describe(`deleting from a held finger's menu at 390, ${theme}`, () => {
    test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: theme })
    test.beforeEach(({ page }) => logFailures(page))

    test("an event deleted from its menu comes back with Undo", async ({ page }, testInfo) => {
      test.setTimeout(420_000)
      const { sent, block } = await open(page, testInfo, "day")
      const menu = await heldMenu(page, block(DENTIST))
      await menu.getByRole("menuitem", { name: "Delete" }).tap()
      await expect.poll(() => sent.length).toBe(1)
      expect(sent[0].query).toBe("?scope=all")
      await expect(block(DENTIST)).toHaveCount(0)
      const deleted = toastOf(page, "Deleted “Dentist”")
      await expect(deleted).toBeVisible()
      // The toast is said while the menu still leaves (220ms), and its mark keeps the toast under the top bar until
      // then (html[data-float]); it lands at the foot after. It is read and tapped where it stays.
      await expect(menu).toHaveCount(0)
      await reviewShot(page, "delete-undo-toast-phone", theme)
      // V-889: a finger takes Undo 9px past its 26px look. A tap 7px above it, on the card's padding before, undoes.
      const look = await expectFingerReach(deleted.getByRole("button", { name: "Undo" }))
      await page.touchscreen.tap(look.left + look.width / 2, look.top - 7)
      await expect.poll(() => sent.length).toBe(2)
      expect(sent[1].path).toBe(`/calendar/events/${DENTIST}/restore`)
      await expect(block(DENTIST)).toBeVisible({ timeout: 15_000 })
    })

    test("the event's own page asks whether to tell its guests in a drawer, and Undo is offered", async ({ page }, testInfo) => {
      test.setTimeout(420_000)
      const { sent } = await open(page, testInfo, "day", REVIEW)
      await page.getByRole("button", { name: "More actions" }).tap()
      await page.getByRole("menuitem", { name: "Delete event" }).tap()
      const ask = page.getByRole("dialog", { name: "Tell your guests it's cancelled?" })
      await expect(ask).toBeVisible({ timeout: 15_000 })
      await expect(page.getByText("can't be undone")).toHaveCount(0)
      // A drawer, its actions pinned at its foot.
      await page.waitForTimeout(600)
      const sheet = (await ask.boundingBox())!
      const send = (await ask.getByRole("button", { name: "Send", exact: true }).boundingBox())!
      expect(Math.round(sheet.y + sheet.height), "the drawer meets the screen's foot").toBeGreaterThanOrEqual(840)
      expect(send.y + send.height, "Send at the drawer's foot").toBeGreaterThan(sheet.y + sheet.height - 120)
      expect(sent).toEqual([])
      await reviewShot(page, "delete-page-tell-guests-phone", theme)
      const unavailable = await watchFor(page, UNAVAILABLE)
      await ask.getByRole("button", { name: "Don't send" }).tap()
      await expect.poll(() => sent.length).toBe(1)
      expect(sent[0]).toEqual({ method: "DELETE", path: `/calendar/events/${REVIEW}`, query: "?scope=all&sequence=1&notify=none" })
      const deleted = toastOf(page, "Deleted “Design review”")
      await expect(deleted).toContainText("Guests weren't emailed.")
      await expect(deleted.getByRole("button", { name: "Undo" })).toBeVisible()
      // The page gave way to the calendar as the toast came, without "This event isn't available" between.
      await expect(page).toHaveURL(/\/app\/calendar(\?|$)/)
      expect(await unavailable(), `"${UNAVAILABLE}" as the page closed`).toEqual([])
      await reviewShot(page, "delete-page-undo-toast-phone", theme)
    })

    test("a refused delete keeps the event's page open, and says why in the request's own words, never Deleted", async ({ page }, testInfo) => {
      test.setTimeout(420_000)
      const { sent } = await open(page, testInfo, "day", REVIEW, { refusals: REFUSALS })
      for (const [i, { why }] of REFUSALS.entries()) {
        await page.getByRole("button", { name: "More actions" }).tap()
        await page.getByRole("menuitem", { name: "Delete event" }).tap()
        const ask = page.getByRole("dialog", { name: "Tell your guests it's cancelled?" })
        await ask.getByRole("button", { name: "Send", exact: true }).tap()
        await expect.poll(() => sent.length).toBe(i + 1)
        expect(sent[i]).toEqual({ method: "DELETE", path: `/calendar/events/${REVIEW}`, query: "?scope=all&sequence=1" })
        await saysRefused(page, why)
        await expect(ask).toHaveCount(0)
        // It stays, its page open.
        await expect(page).toHaveURL(new RegExp(`/app/calendar/event/${REVIEW}$`))
        await expect(page.getByText("Design review").first()).toBeVisible()
        await expect(page.getByRole("button", { name: "More actions" })).toBeVisible()
        if (i === 0) await reviewShot(page, "delete-refused", theme)
      }
    })

    test("an instance of a series, from its menu, asks in drawers, and goes to the Trash, which Open Trash opens as a drawer", async ({ page }, testInfo) => {
      test.setTimeout(420_000)
      const { sent, block } = await open(page, testInfo, "day", undefined, { extra: true })
      const menu = await heldMenu(page, block(STANDUP))
      await menu.getByRole("menuitem", { name: "Delete" }).tap()
      const which = page.getByRole("dialog", { name: "Delete a repeating event" })
      await which.getByRole("radio", { name: "This and following events" }).tap()
      await which.getByRole("button", { name: "Delete", exact: true }).tap()
      await page.getByRole("dialog", { name: "Tell your guests it's cancelled?" }).getByRole("button", { name: "Don't send" }).tap()
      await expect.poll(() => sent.length).toBe(1)
      expect(sent[0]).toEqual({ method: "DELETE", path: `/calendar/events/${STANDUP}`, query: "?scope=following&notify=none" })
      await expect(block(STANDUP)).toHaveCount(0)
      const moved = toastOf(page, "Moved “Standup” to the Trash")
      await expect(moved).toContainText("This and the following events. Guests weren't emailed.")
      await expect(moved.getByRole("button", { name: "Undo" })).toHaveCount(0)
      await reviewShot(page, "delete-series-trash-toast", theme)
      await moved.getByRole("button", { name: "Open Trash" }).tap()
      await trashListing(page, STANDUP, "Standup")
    })

    test("a booked meeting's own page asks in its own words, and offers the Trash, which opens as a drawer over the calendar", async ({ page }, testInfo) => {
      test.setTimeout(420_000)
      const { sent } = await open(page, testInfo, "day", BOOKED, { extra: true })
      await page.getByRole("button", { name: "More actions" }).tap()
      await page.getByRole("menuitem", { name: "Delete event" }).tap()
      const ask = page.getByRole("alertdialog", { name: "Delete this booked meeting?" })
      await expect(ask).toContainText("Priya Shah booked it through Intro calls. We'll email them that it's cancelled.")
      await ask.getByRole("button", { name: "Delete and tell Priya Shah" }).tap()
      await expect.poll(() => sent.length).toBe(1)
      expect(sent[0]).toEqual({ method: "DELETE", path: `/calendar/events/${BOOKED}`, query: "?scope=all&sequence=1" })
      const deleted = toastOf(page, "Deleted “Intro call”")
      await expect(deleted).toContainText("It's in your calendar's Trash.")
      await expect(deleted.getByRole("button", { name: "Undo" })).toHaveCount(0)
      await reviewShot(page, "delete-booked-trash-toast", theme)
      await deleted.getByRole("button", { name: "Open Trash" }).tap()
      await trashListing(page, BOOKED, "Intro call")
      // The calendar, the Trash not in its address.
      await expect(page).toHaveURL(/\/app\/calendar(\?|$)/)
      await expect(page).not.toHaveURL(/trash=/)
      await reviewShot(page, "delete-open-trash", theme)
    })
  })
}
