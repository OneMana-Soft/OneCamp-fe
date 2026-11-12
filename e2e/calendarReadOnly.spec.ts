import { expect, test, type Locator, type Page, type Request, type TestInfo } from "@playwright/test"

import { CALENDAR_READS, reviewShot, SAM, SHOT_THEMES, stubBackend, tidy, withStatus } from "./stubbedApp"

// Calendar head G. V-594: a calendar moved from Google or Outlook that the
// person may only see there is read-only in OneCamp too. Its menu in the
// Calendars panel says so ("Read-only in Google", "Read-only in Outlook"), a
// new event's Calendar choice leaves it out, and when the provider refuses a
// calendar the list still offered (its rights changed since), the server's
// 409 calendar_read_only is said at the form's Calendar row until another is
// picked. V-643: an event made private says so, with Google's lock, on its
// card and in its view (the panel at 1280, its own page on a phone). A phone
// has no menu per calendar (its Calendar options list switches), so the menu
// is the computer's alone. With SHOTS_DIR set, each state is saved for review.

// Wednesday 21 October 2026, 10:00 on the browser's clock.
const NOW = new Date(2026, 9, 21, 10, 0)
const at = (day: number, hour: number) => new Date(2026, 9, day, hour).toISOString()

const REFUSED = "This calendar is read-only in Google. Put the event on another calendar."
const DOWN = "The calendar store didn't answer. Try again in a moment."
const HIRING = "0b8a3c1e-1d2f-4a5b-8c7d-9e0f1a2b3c43"

const CALENDARS = [
  { id: "cal-me", name: "Personal", kind: "personal", access: "manage", mine: true, source: "onecamp" },
  // Moved from Google and from Outlook, where Sam may only see them.
  { id: "cal-family", name: "Family", kind: "external", hue: "berry", access: "manage", mine: true, source: "google", read_only: true },
  { id: "cal-contoso", name: "Contoso team", kind: "external", access: "manage", mine: true, source: "microsoft", read_only: true },
  // From Google too, writable when the list was read: Google refuses it since (the 409).
  { id: "cal-work", name: "Work", kind: "external", access: "manage", mine: true, source: "google" },
  { id: "cal-launch", name: "Launch", kind: "project", container_kind: "project", container_id: "p-launch", access: "edit", source: "onecamp" },
]

/** The project's private event as the calendar's own API sends it: in the week's read of Launch, and by its id. */
const hiringApi = () => ({
  id: HIRING,
  calendar_id: "cal-launch",
  kind: "event",
  title: "Hiring panel",
  start: { at: at(21, 14) },
  end: { at: at(21, 15) },
  all_day: false,
  sequence: 1,
  organiser: { user_uuid: SAM.user_uuid },
  attendees: [],
  transparency: "opaque",
  visibility: "private",
  guests_can_modify: false,
  guests_can_invite: false,
  guests_can_see_guests: true,
})

async function open(page: Page, testInfo: TestInfo, phone: boolean) {
  const posts: unknown[] = []
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
    "/calendar/calendars": { msg: "ok", data: CALENDARS },
    "/calendar/calendars/events": {
      msg: "ok",
      data: [hiringApi(), { id: "e-launch", calendar_id: "cal-launch", title: "Launch review", start: { at: at(22, 11) }, end: { at: at(22, 12) }, all_day: false, visibility: "default" }],
      truncated: false,
    },
    "/calendar/subscriptions": { msg: "ok", data: [] },
    "/calendar/sync/google": { msg: "ok", data: { provider: "google", state: "none", progress: 0, moved: 0, unchanged: 0, available: true } },
    "/calendar/sync/microsoft": { msg: "ok", data: { provider: "microsoft", state: "none", progress: 0, moved: 0, unchanged: 0, available: true } },
    // Outlook offered and not linked now, as Google is: the panel's Outlook row reads it (else "Outlook Calendar couldn't load").
    "/connectors": { msg: "ok", data: { connectors: [{ id: "microsoft_calendar", name: "Outlook Calendar", connected: false }] } },
    "/config/client": { msg: "ok", data: { features: { calendar_repeats: true } } },
    "/event/bookingPages": { msg: "ok", data: [] },
    "/event/suggestTimes": { msg: "ok", data: { suggestions: [] } },
    "/event/getEvents": { msg: "ok", data: [{ event_uuid: "e-review", event_title: "Design review", event_start_time: at(21, 11), event_end_time: at(21, 12), event_calendar_id: "cal-me" }] },
    // The /event read carries no visibility (V-715); the calendar's own read below says it.
    "/event/getEvent/": {
      msg: "ok",
      data: { event_uuid: HIRING, event_title: "Hiring panel", event_start_time: at(21, 14), event_end_time: at(21, 15), event_calendar_id: "cal-launch", event_created_by: SAM, event_participants: [] },
    },
    "/calendar/events": (url: URL, request: Request) => {
      if (request.method() === "POST" && url.pathname.endsWith("/calendar/events")) {
        const sent = request.postDataJSON() as { calendar_id?: string }
        posts.push(sent)
        // Launch's store fails as any server can: a refusal that isn't the calendar's, said in a toast.
        if (sent.calendar_id === "cal-launch") return withStatus(500, { msg: DOWN })
        return withStatus(409, { code: "calendar_read_only", msg: REFUSED })
      }
      if (url.pathname.endsWith("/call/artefacts")) return { msg: "ok", data: [] }
      if (url.pathname.endsWith("/reminders")) return { msg: "ok", data: { minutes: [10], default: true } }
      return { msg: "ok", data: hiringApi() }
    },
  })
  await page.goto(`/app/calendar?date=2026-10-21&view=${phone ? "day" : "week"}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
  await expect(page.locator("[data-period]")).toBeVisible({ timeout: 120_000 })
  await tidy(page)
  return posts
}

/**
 * Whether a box is whole in its nearest scroller's visible part and the window, and nothing (the dialog's footer,
 * a toast) lies over its first and last lines.
 */
function wholeInView(l: Locator) {
  return l.evaluate((el) => {
    let area = el.parentElement
    while (area && !/(auto|scroll)/.test(getComputedStyle(area).overflowY)) area = area.parentElement
    const box = el.getBoundingClientRect()
    const port = (area ?? document.documentElement).getBoundingClientRect()
    const inside = box.top >= Math.max(port.top, 0) - 1 && box.bottom <= Math.min(port.bottom, window.innerHeight) + 1
    const x = box.left + Math.min(8, box.width / 2)
    const seen = (y: number) => el.contains(document.elementFromPoint(x, y))
    return inside && seen(box.top + 2) && seen(box.bottom - 2)
  })
}

const VIEWS = [
  { name: "1280", phone: false, use: { viewport: { width: 1280, height: 900 } } },
  { name: "390", phone: true, use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
] as const

for (const theme of SHOT_THEMES) {
  for (const view of VIEWS) {
    test.describe(`read-only calendars and private events at ${view.name}, ${theme}`, () => {
      test.use({ ...view.use, colorScheme: theme })
      const press = (l: Locator) => (view.phone ? l.tap() : l.click())
      /** The open Calendar choice's options: a sheet's on a phone, the listbox's on a computer. */
      const choices = (page: Page) => (view.phone ? page.locator("[data-sheet-panel]") : page.getByRole("listbox")).getByRole("option")

      async function newEvent(page: Page) {
        await press(page.getByRole("button", { name: "New event" }))
        const form = page.locator("[data-event-dialog]")
        await expect(form.getByRole("textbox", { name: "Title" })).toBeVisible({ timeout: 30_000 })
        const calendar = form.getByRole("combobox", { name: "Calendar", exact: true })
        await calendar.scrollIntoViewIfNeeded()
        return { form, calendar }
      }

      if (!view.phone) {
        test("(a) a calendar Google or Outlook lets OneCamp only read says so in its menu", async ({ page }, testInfo) => {
          test.setTimeout(180_000)
          await open(page, testInfo, view.phone)
          await page.getByRole("button", { name: /^Calendars/ }).click()
          const panel = page.locator("[data-calendars-panel]")
          for (const [id, name, words, shot] of [
            ["cal-family", "Family", "Read-only in Google", "g-ro-a-menu-google"],
            ["cal-contoso", "Contoso team", "Read-only in Outlook", "g-ro-a-menu-outlook"],
          ] as const) {
            const row = panel.locator(`[data-calendar-row='${id}']`)
            await row.hover()
            await row.getByRole("button", { name: `${name} options` }).click()
            const menu = page.getByRole("menu")
            const said = menu.locator("[data-calendar-read-only]")
            // A status atop its menu, not an action (DESIGN-BUILD-123 F1): first, with the private line's lock and a
            // hairline under it; no menu item, never focused (the keys start at Show only this).
            await expect(said).toHaveText(words)
            await expect(menu.locator(":scope > *").first()).toHaveAttribute("data-calendar-read-only", "")
            await expect(said.locator("svg")).toBeVisible()
            await expect(menu.locator("[data-calendar-read-only] + [role='separator']")).toHaveCount(1)
            await expect(page.getByRole("menuitem", { name: words })).toHaveCount(0)
            await expect(said).not.toHaveAttribute("tabindex", /.*/)
            await page.keyboard.press("ArrowDown")
            await expect(page.getByRole("menuitem", { name: "Show only this" })).toBeFocused()
            await reviewShot(page, shot, theme)
            await page.keyboard.press("Escape")
            await expect(page.getByRole("menu")).toHaveCount(0)
          }
          // A calendar Google lets OneCamp change says nothing of the kind.
          const work = panel.locator("[data-calendar-row='cal-work']")
          await work.hover()
          await work.getByRole("button", { name: "Work options" }).click()
          await expect(page.getByRole("menuitem", { name: "Show only this" })).toBeVisible()
          await expect(page.locator("[data-calendar-read-only]")).toHaveCount(0)
        })
      }

      test("(b) a new event's Calendar choice leaves out the calendars Google and Outlook let OneCamp only read", async ({ page }, testInfo) => {
        test.setTimeout(180_000)
        await open(page, testInfo, view.phone)
        const { calendar } = await newEvent(page)
        await press(calendar)
        for (const name of ["OneCamp · Personal", "Work", "Launch"]) await expect(choices(page).filter({ hasText: name })).toHaveCount(1)
        for (const name of ["Family", "Contoso team"]) await expect(choices(page).filter({ hasText: name })).toHaveCount(0)
        await reviewShot(page, "g-ro-b-choice", theme)
      })

      test("(c) a calendar its provider refuses is said at the form's Calendar row until another is picked", async ({ page }, testInfo) => {
        test.setTimeout(180_000)
        const posts = await open(page, testInfo, view.phone)
        const { form, calendar } = await newEvent(page)
        await form.getByRole("textbox", { name: "Title" }).fill("Offsite plan")
        await calendar.scrollIntoViewIfNeeded()
        await press(calendar)
        await press(choices(page).filter({ hasText: "Work" }))
        await expect(calendar).toContainText("Work")
        await press(form.getByRole("button", { name: "Create event" }))
        await expect.poll(() => posts.length, { message: "the create was sent" }).toBe(1)
        expect(posts[0]).toMatchObject({ title: "Offsite plan", calendar_id: "cal-work" })
        // The form stays, and its Calendar row says why, in the server's words.
        await expect(calendar).toHaveAttribute("aria-invalid", "true")
        await expect(calendar).toHaveAccessibleDescription(REFUSED)
        const said = form.getByRole("alert").filter({ hasText: REFUSED })
        await expect(said).toBeVisible()
        // DESIGN-BUILD-123 F3: the words come into view whole (at 1280 their second line was cut under the
        // footer), and the picker has the focus, with nothing scrolled here by the test.
        await expect.poll(() => wholeInView(said), { message: "the refusal is in the form's scroll area, uncovered" }).toBe(true)
        await expect(calendar).toBeFocused()
        // F2: said there alone; no toast says it again (at 390 one covered the Title).
        await page.waitForTimeout(1_000)
        await expect(page.locator(".toast-root")).toHaveCount(0)
        await reviewShot(page, "g-ro-c-refused", theme)
        // Another calendar puts it right.
        await press(calendar)
        await press(choices(page).filter({ hasText: "Launch" }))
        await expect(calendar).toContainText("Launch")
        await expect(calendar).not.toHaveAttribute("aria-invalid", "true")
        await expect(form.getByText(REFUSED)).toHaveCount(0)
        // Any other refusal is said once, in a toast, in the server's words; the row says nothing of it.
        await press(form.getByRole("button", { name: "Create event" }))
        await expect.poll(() => posts.length, { message: "the second create was sent" }).toBe(2)
        await expect(page.locator(".toast-root").filter({ hasText: DOWN })).toBeVisible()
        await page.waitForTimeout(1_000)
        await expect(page.locator(".toast-root")).toHaveCount(1)
        await expect(form.getByRole("alert")).toHaveCount(0)
      })

      test("(d) a private event says so on its card and in its view", async ({ page }, testInfo) => {
        test.setTimeout(180_000)
        await open(page, testInfo, view.phone)
        await press(page.locator(`[data-event-uuid="${HIRING}"]`).first())
        const card = page.locator("[data-event-card]")
        await expect(card).toContainText("Hiring panel", { timeout: 20_000 })
        const onCard = card.locator("[data-card-visibility] [data-visibility-line='private']")
        await expect(onCard).toHaveText("Private")
        await expect(onCard.locator("svg")).toBeVisible()
        await reviewShot(page, "g-ro-d-card", theme)
        await press(card.getByRole("button", { name: "Open details" }))
        await expect(card).toHaveCount(0, { timeout: 20_000 })
        // A computer's panel beside the calendar; a phone's own page.
        if (view.phone) await page.waitForURL(new RegExp(`/app/calendar/event/${HIRING}`), { timeout: 30_000 })
        await expect(page.getByRole("heading", { name: "Hiring panel" })).toBeVisible({ timeout: 30_000 })
        const inView = page.locator("[data-event-visibility]")
        await expect(inView).toContainText("Visibility")
        await expect(inView.locator("[data-visibility-line='private']")).toHaveText("Private")
        await expect(inView.locator("svg")).toBeVisible()
        await inView.scrollIntoViewIfNeeded()
        await reviewShot(page, "g-ro-d-view", theme)
      })
    })
  }
}
