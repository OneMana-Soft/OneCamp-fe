import { expect, test, type Locator, type Page, type Request, type TestInfo } from "@playwright/test"

import { AI_READS, CALENDAR_READS, SAM, rescheduleOptions, reviewShot, stubBackend } from "./stubbedApp"
import { expectTouchSize } from "./touchTarget"

// gcal-16: a reschedule offer after declines. Jonas can't go to Sam's launch
// review: the inbox tells Sam, and the notice opens the event, where under the
// guests one calm line says who can't go, with "Find a better time" (the
// assistant's one dialog: a sheet on a phone). The dialog proposes times and
// writes nothing until one is picked; the pick moves the event, and the offer
// goes. A guest never sees the offer, on an event where someone declined. At
// 1280 and at 390 by touch; with SHOTS_DIR set, each state is saved for
// review, light and dark.

// Wednesday 21 October 2026, 10:00 on the browser's clock.
const NOW = new Date(2026, 9, 21, 10, 0)
const at = (day: number, h: number, m = 0) => new Date(2026, 9, day, h, m).toISOString()
const person = (uuid: string, name: string) => ({ user_uuid: uuid, user_name: name, user_full_name: name, user_email_id: `${name.split(" ")[0].toLowerCase()}@example.com` })
const ME = { ...SAM, user_name: "Sam Rivera" }
const MAYA = person("5e1f0000-0000-4000-8000-0000000000a2", "Maya Chen")
const JONAS = person("5e1f0000-0000-4000-8000-0000000000b3", "Jonas Weber")

const LAUNCH = "0b8a3c1e-1d2f-4a5b-8c7d-9e0f1a2b3c11"
const CRIT = "0b8a3c1e-1d2f-4a5b-8c7d-9e0f1a2b3c12"
// The times the assistant proposes instead of Wednesday 2 PM: Thursday 11 AM, all free.
const THURSDAY = { start: at(22, 11), end: at(22, 12) }

const guest = (p: { user_uuid: string }, response: string) => ({ user_uuid: p.user_uuid, role: "required", response })

/** Sam's launch review (Jonas can't go) at its time, and Maya's crit, where Sam is a guest and Jonas can't go either. */
function events(launch: { start: string; end: string }) {
  return [
    {
      event_uuid: LAUNCH, event_title: "Launch review", event_start_time: launch.start, event_end_time: launch.end,
      event_description: "<p>Walk the checklist, then decide go or no-go.</p>",
      event_created_by: ME, event_participants: [MAYA, JONAS],
      event_guests: [guest(MAYA, "accepted"), guest(JONAS, "declined")],
    },
    {
      event_uuid: CRIT, event_title: "Design crit", event_start_time: at(22, 15), event_end_time: at(22, 15, 45),
      event_created_by: MAYA, event_participants: [ME, JONAS],
      event_guests: [guest(SAM, "accepted"), guest(JONAS, "declined")],
    },
  ]
}

interface Confirmed {
  event_uuid?: string
  start?: string
  end?: string
}

/** Signs Sam in with the assistant on; what it returns is every time confirmed in "Find a better time". */
async function signIn(page: Page, testInfo: TestInfo, ai = true): Promise<Confirmed[]> {
  const confirmed: Confirmed[] = []
  let launch = { start: at(21, 14), end: at(21, 15) }
  const one = (id: string) => ({ msg: "ok", data: events(launch).find((e) => e.event_uuid === id) })
  await page.clock.setFixedTime(NOW)
  await page.addInitScript(() => {
    try {
      localStorage.setItem("oc_keys_tip_seen", "1")
    } catch {
      /* storage blocked */
    }
  })
  await stubBackend(page, testInfo, {
    ...AI_READS,
    ...CALENDAR_READS,
    "/config/client": { msg: "ok", data: { features: { calendar_repeats: true, ai } } },
    "/activity/unified": {
      msg: "ok",
      data: {
        has_more: false,
        activities: [
          {
            activity_type: "NOTICE",
            time: at(21, 9, 40),
            priority: "normal",
            actor_kind: "person",
            notice: {
              id: "7c0d4e2a-1b3c-4d5e-8f6a-9b0c1d2e3f40",
              kind: "calendar.rsvp",
              resource_kind: "event",
              resource_uuid: LAUNCH,
              title: "Launch review",
              can_open: true,
              reason: "organiser",
              actor: JONAS,
              data: { response: "declined", start: at(21, 14), end: at(21, 15) },
              created_at: at(21, 9, 40),
            },
          },
        ],
      },
    },
    "/event/getEvents": () => ({ msg: "ok", data: events(launch) }),
    "/event/getEvent/": (url: URL) => one(decodeURIComponent(url.pathname.split("/").pop() ?? "")),
    "/calendar/events/": (url: URL) => {
      const id = decodeURIComponent(url.pathname.split("/")[3] ?? "")
      if (url.pathname.endsWith("/artefacts")) return { msg: "ok", data: [] }
      const e = events(launch).find((x) => x.event_uuid === id)
      return { msg: "ok", data: e ? { id, title: e.event_title, notes: "", start: { at: e.event_start_time }, end: { at: e.event_end_time }, all_day: false, sequence: 1, kind: "event", attendees: [], organiser: { user_uuid: e.event_created_by.user_uuid }, email_on_answers: false } : null }
    },
    "/event/bookingPages": { msg: "ok", data: [] },
    "/ai/schedule/reschedule/confirm": (_url: URL, request: Request) => {
      const body = request.postDataJSON() as Confirmed
      confirmed.push(body)
      // Moved, as the calendar's update path does: the event reads at its new time.
      launch = { start: body.start ?? launch.start, end: body.end ?? launch.end }
      return { msg: "ok", data: { event_uuid: body.event_uuid, title: "Launch review", start: body.start, end: body.end } }
    },
    "/ai/schedule/reschedule": () =>
      rescheduleOptions({ uuid: LAUNCH, title: "Launch review", ...launch }, [{ ...THURSDAY, free: 3, total: 3 }, { start: at(22, 16), end: at(22, 17), free: 2, total: 3 }], ["Sam Rivera", "Maya Chen", "Jonas Weber"]),
  })
  return confirmed
}

const offer = (page: Page) => page.locator("[data-reschedule-offer]")
const press = (target: Locator, phone: boolean) => (phone ? target.tap() : target.click())

for (const theme of ["light", "dark"] as const) {
  for (const [width, phone] of [[1280, false], [390, true]] as const) {
    test.describe(`a reschedule offer after a decline at ${width}, ${theme}`, () => {
      test.use({ viewport: { width, height: phone ? 844 : 900 }, isMobile: phone, hasTouch: phone, colorScheme: theme })

      test("the decline's notice opens the event, whose offer finds a better time and moves it", async ({ page }, testInfo) => {
        test.setTimeout(240_000)
        const confirmed = await signIn(page, testInfo)
        await page.goto("/app/inbox", { waitUntil: "domcontentloaded", timeout: 120_000 })
        const notice = page.getByRole("link", { name: /Jonas Weber can't go to Launch review/ })
        await expect(notice).toBeVisible({ timeout: 60_000 })
        await expect(notice).toHaveAttribute("href", `/app/calendar/event/${LAUNCH}`)
        await press(notice, phone)

        // The event, and under its guests the one calm line: who can't go, and the way to a better time.
        // A phone opens the event's own page; a computer opens it in the right panel beside the inbox.
        if (phone) await expect(page).toHaveURL(new RegExp(`/app/calendar/event/${LAUNCH}$`), { timeout: 60_000 })
        await expect(page.locator("[data-event-view] h2")).toHaveText("Launch review", { timeout: 60_000 })
        await expect(offer(page)).toBeVisible({ timeout: 60_000 })
        await expect(offer(page)).toContainText("Jonas Weber can't go")
        const find = offer(page).getByRole("button", { name: "Find a better time" })
        if (phone) expectTouchSize((await find.boundingBox())?.height, "Find a better time")
        await reviewShot(page, "reschedule-offer", theme)

        // The dialog proposes; nothing is written until a time is picked.
        await press(find, phone)
        const dialog = page.getByRole("dialog", { name: "Find a better time" })
        await expect(dialog).toBeVisible()
        // On a phone the dialog is a sheet, at the screen's foot once it has risen.
        if (phone) {
          await expect(dialog).toHaveAttribute("data-v3-sheet", "")
          await expect.poll(async () => Math.round(await dialog.evaluate((el) => el.getBoundingClientRect().bottom))).toBe(844)
        }
        const thursday = dialog.getByRole("button", { name: /All free/ })
        await expect(thursday).toBeVisible({ timeout: 30_000 })
        await reviewShot(page, "reschedule-offer-dialog", theme)
        expect(confirmed).toHaveLength(0)

        await press(thursday, phone)
        await expect.poll(() => confirmed.length).toBe(1)
        expect(confirmed[0]).toMatchObject({ event_uuid: LAUNCH, start: THURSDAY.start, end: THURSDAY.end })
        await expect(dialog).toHaveCount(0)
        // It reads at its new time, and the offer has gone; Jonas's answer still stands in the list.
        await expect(page.locator("[data-event-view] dd").filter({ hasText: "Thursday 22 October 2026" })).toBeVisible({ timeout: 30_000 })
        await expect(offer(page)).toHaveCount(0)
        await expect(page.locator('[data-event-guests] [data-guest-row="declined"]')).toContainText("Jonas Weber")
        await reviewShot(page, "reschedule-offer-moved", theme)
      })

      // With the assistant off its dialogs draw nothing: the line still says who
      // can't go, with no button, and neither the row nor the phone's menu offers
      // Prep brief or Find a better time.
      test("with the assistant off, the offer only says who can't go, and no assistant action is offered", async ({ page }, testInfo) => {
        test.setTimeout(240_000)
        await signIn(page, testInfo, false)
        await page.goto(`/app/calendar/event/${LAUNCH}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
        await expect(offer(page)).toContainText("Jonas Weber can't go", { timeout: 60_000 })
        await expect(offer(page).getByRole("button")).toHaveCount(0)
        const assistant = /^(Prep brief|Find a better time)$/
        await expect(page.getByRole("button", { name: assistant })).toHaveCount(0)
        await reviewShot(page, "reschedule-offer-ai-off", theme)
        if (phone) {
          await press(page.getByRole("button", { name: "More actions" }), phone)
          const items = page.getByRole("menuitem")
          await expect(items.filter({ hasText: "Delete event" })).toBeVisible()
          await expect(items.filter({ hasText: assistant })).toHaveCount(0)
          await reviewShot(page, "reschedule-offer-ai-off-menu", theme)
        }
      })

      // By keyboard: Tab reaches Find a better time (its ring shows), Enter opens
      // the dialog with focus inside it, and Escape closes it and gives the
      // focus back to the button, its ring showing (V-829: a dialog opened with
      // no Trigger gave it to <body>, and Tab started again at the page's top).
      if (!phone) {
        test("by keyboard, the offer's button takes focus, opens the dialog, and Escape closes it and gives focus back", async ({ page }, testInfo) => {
          test.setTimeout(240_000)
          const confirmed = await signIn(page, testInfo)
          await page.goto(`/app/calendar/event/${LAUNCH}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
          const line = offer(page).getByText("Jonas Weber can't go")
          await expect(line).toBeVisible({ timeout: 60_000 })
          const find = offer(page).getByRole("button", { name: "Find a better time" })
          // A click on the line sets where Tab starts; the next stop is the button.
          await line.click()
          await page.keyboard.press("Tab")
          await expect(find).toBeFocused()
          await expect.poll(() => find.evaluate((el) => el.matches(":focus-visible"))).toBe(true)
          await reviewShot(page, "reschedule-offer-keyboard-focus", theme)
          await page.keyboard.press("Enter")
          const dialog = page.getByRole("dialog", { name: "Find a better time" })
          await expect(dialog).toBeVisible()
          await expect.poll(() => dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true)
          await expect(dialog.getByRole("button", { name: /All free/ })).toBeVisible({ timeout: 30_000 })
          await reviewShot(page, "reschedule-offer-keyboard-dialog", theme)
          // Escape closes it, writing nothing, and the focus is back on the button.
          await page.keyboard.press("Escape")
          await expect(dialog).toHaveCount(0)
          await expect(find).toBeFocused()
          await expect.poll(() => find.evaluate((el) => el.matches(":focus-visible"))).toBe(true)
          await reviewShot(page, "reschedule-offer-keyboard-back", theme)
          expect(confirmed).toHaveLength(0)
        })
      }

      test("a guest is offered nothing, on an event someone can't go to", async ({ page }, testInfo) => {
        test.setTimeout(240_000)
        await signIn(page, testInfo)
        await page.goto(`/app/calendar/event/${CRIT}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
        await expect(page.locator('[data-event-guests] [data-guest-row="declined"]')).toContainText("Jonas Weber", { timeout: 60_000 })
        await expect(offer(page)).toHaveCount(0)
      })
    })
  }
}
