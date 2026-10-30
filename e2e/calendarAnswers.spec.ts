import { expect, test, type Page, type Request, type TestInfo } from "@playwright/test"

import { SAM, stubBackend } from "./stubbedApp"

// Calendar A2 (STEP4_PLAN §4 #5): the event card answers "Going?". The
// organiser's card counts who said what; a guest's asks Yes, Maybe or No at
// its foot; above four guests the faces fold; an ended event asks nothing.
// On a phone the card is the half sheet. The panel lists every answer and
// note, and someone invited by email answers on their own page. Calendar A5:
// the card and the panel say the reader's reminder, which a menu changes at
// once. Calendar head 4: a guest proposes another time, from the panel or
// their own page, and takes it back; the organiser uses it or dismisses it.
// With
// SHOTS_DIR set, each state is also saved for review, at the viewport and
// theme it ran in.

// Wednesday 21 October 2026, 10:00 on the browser's clock.
const NOW = new Date(2026, 9, 21, 10, 0)
const at = (day: number, h: number, m = 0) => new Date(2026, 9, day, h, m).toISOString()
// As the API names people: user_name is the name they go by.
const person = (uuid: string, name: string) => ({ user_uuid: uuid, user_name: name, user_full_name: name, user_email_id: `${name.split(" ")[0].toLowerCase()}@example.com` })
const ME = { ...SAM, user_name: "Sam Rivera" }
const MAYA = person("5e1f0000-0000-4000-8000-0000000000a2", "Maya Chen")
const JONAS = person("5e1f0000-0000-4000-8000-0000000000b3", "Jonas Weber")
const LEE = person("5e1f0000-0000-4000-8000-0000000000c4", "Lee Park")
const ANA = person("5e1f0000-0000-4000-8000-0000000000d5", "Ana Silva")
const RAJ = person("5e1f0000-0000-4000-8000-0000000000e6", "Raj Mehta")

const LAUNCH = "0b8a3c1e-1d2f-4a5b-8c7d-9e0f1a2b3c01"
const CRIT = "0b8a3c1e-1d2f-4a5b-8c7d-9e0f1a2b3c02"
const HANDS = "0b8a3c1e-1d2f-4a5b-8c7d-9e0f1a2b3c03"
const SYNC = "0b8a3c1e-1d2f-4a5b-8c7d-9e0f1a2b3c04"

type Proposal = { start: string; end: string }
type Guest = { user_uuid?: string; email?: string; name?: string; role: string; response: string; note?: string; invite?: string; proposal?: Proposal }
/** Maya's proposal for Sam's launch review: Wednesday 4 PM instead of 2. */
const MAYAS = { start: at(21, 16), end: at(21, 17) }

/**
 * The calendar as Sam reads it: mine is his answer to Maya's crit, and
 * chosen his own reminder for the launch review (null: the default's). The
 * default reminds him of what he organises or said yes or maybe to (D-CAL-4).
 * proposed: the times standing, his for the crit and Maya's for his review.
 */
function events(mine: string, chosen: number[] | null = null, proposed: { mine?: Proposal | null; maya?: Proposal | null } = {}) {
  const guest = (p: { user_uuid: string }, response: string, note?: string): Guest => ({ user_uuid: p.user_uuid, role: "required", response, ...(note ? { note } : {}) })
  const byDefault = (on: boolean) => ({ event_reminders: on ? [10] : [], event_reminders_default: true })
  return [
    {
      // Sam's own: he sees the counts, and Alex's invitation wasn't emailed.
      event_uuid: LAUNCH, event_title: "Launch review", event_start_time: at(21, 14), event_end_time: at(21, 15),
      event_description: "<p>Join https://meet.example.com/launch</p><p>Walk the checklist, then decide go or no-go.</p>",
      event_created_by: ME, event_participants: [MAYA, JONAS, LEE],
      event_guests: [{ ...guest(MAYA, "accepted", "Ten minutes late"), ...(proposed.maya ? { proposal: proposed.maya } : {}) }, guest(JONAS, "tentative"), guest(LEE, "needs_action"),
        { email: "alex@example.com", name: "Alex Kim", role: "required", response: "declined", invite: "not_sent" }],
      ...(chosen ? { event_reminders: chosen, event_reminders_default: false } : byDefault(true)),
    },
    {
      // Maya's: Sam is a guest who hasn't answered.
      event_uuid: CRIT, event_title: "Design crit", event_start_time: at(22, 11), event_end_time: at(22, 11, 45),
      event_description: "<p>Studio, second floor. Bring the pricing page.</p>",
      event_created_by: MAYA, event_participants: [ME, JONAS],
      event_guests: [{ ...guest(SAM, mine), ...(proposed.mine ? { proposal: proposed.mine } : {}) }, guest(JONAS, "accepted")],
      ...byDefault(mine === "accepted" || mine === "tentative"),
    },
    {
      // Jonas's, with six guests: the faces fold.
      event_uuid: HANDS, event_title: "All hands", event_start_time: at(23, 9, 30), event_end_time: at(23, 10, 30),
      event_created_by: JONAS, event_participants: [ME, MAYA, LEE, ANA, RAJ],
      event_guests: [guest(SAM, "accepted"), guest(MAYA, "accepted"), guest(LEE, "tentative"), guest(ANA, "declined"), guest(RAJ, "needs_action"),
        { email: "kim@client.example", name: "Kim Ortiz", role: "required", response: "needs_action" }],
      ...byDefault(true),
    },
    {
      // Earlier today, over: no Join and no Going?.
      event_uuid: SYNC, event_title: "Copy sync", event_start_time: at(21, 8), event_end_time: at(21, 8, 30),
      event_description: "<p>https://meet.example.com/copy</p>",
      event_created_by: MAYA, event_participants: [ME],
      event_guests: [guest(SAM, "accepted")],
      ...byDefault(true),
    },
  ]
}

async function openCalendar(page: Page, testInfo: TestInfo, place = "date=2026-10-21&view=week", first = LAUNCH) {
  let mine = "needs_action"
  let chosen: number[] | null = null
  const proposed: { mine: Proposal | null; maya: Proposal | null } = { mine: null, maya: MAYAS }
  const list = () => ({ msg: "ok", data: events(mine, chosen, proposed) })
  const one = (id: string) => ({ msg: "ok", data: events(mine, chosen, proposed).find((e) => e.event_uuid === id) })
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
    "/event/getEvents": list,
    "/event/getEvent/": (url: URL) => one(url.pathname.split("/").pop() ?? ""),
    "/calendar/events/": (url: URL, request: Request) => {
      // The answer is kept, so the calendar read after it shows it, and so is
      // a proposal ({} takes it back); a dismissed one is gone.
      if (url.pathname.endsWith("/answer")) {
        const body = request.postDataJSON() as { answer?: string; proposal?: Partial<Proposal> }
        mine = body.answer ?? "accepted"
        if (body.proposal) proposed.mine = body.proposal.start && body.proposal.end ? { start: body.proposal.start, end: body.proposal.end } : null
      }
      if (url.pathname.endsWith("/proposal/dismiss")) {
        proposed.maya = null
        return { msg: "ok", data: null }
      }
      // And so is a reminder (only the launch review's changes here).
      if (url.pathname.endsWith("/reminders")) {
        const minutes = (request.postDataJSON() as { minutes: number[] | null }).minutes
        chosen = minutes
        return { msg: "ok", data: { minutes: minutes ?? [10], default: minutes === null } }
      }
      if (url.pathname.endsWith("/nudge")) return { msg: "Asked 1 guest again.", data: { asked: 1 } }
      if (url.pathname.endsWith("/guest-link")) return { msg: "ok", data: { url: "https://camp.example.com/rsvp/link" } }
      const id = url.pathname.split("/").pop() ?? ""
      const e = events(mine).find((x) => x.event_uuid === id)
      return { msg: "ok", data: e ? { id, title: e.event_title, notes: "", start: { at: e.event_start_time, zone: "Europe/London" }, end: { at: e.event_end_time }, all_day: false, sequence: 1, kind: "event", attendees: [], organiser: { user_uuid: e.event_created_by.user_uuid }, email_on_answers: false } : null }
    },
    "/integration/google-calendar/status": { msg: "ok", data: { isConnected: false } },
    "/user/assignedTaskList": { msg: "ok", data: { user_tasks: [] } },
    "/config/client": { msg: "ok", data: { features: { calendar_repeats: true } } },
    "/event/bookingPages": { msg: "ok", data: [] },
  })
  await page.goto(`/app/calendar?${place}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
  await expect(page.locator(`[data-event-uuid="${first}"]`).first()).toBeVisible({ timeout: 60_000 })
}

/** Saved for review when SHOTS_DIR is set: name-<width>-<theme>.png, of the screen alone. */
async function shot(page: Page, name: string, theme: string) {
  const dir = process.env.SHOTS_DIR
  if (!dir) return
  await expect(page.getByText("Not in this test")).toHaveCount(0)
  await page.waitForTimeout(450)
  await page.screenshot({ path: `${dir}/${name}-${page.viewportSize()?.width}-${theme}.png` })
}

const card = (page: Page) => page.locator("[data-event-card]")

for (const theme of ["light", "dark"] as const) {
  test.describe(`the event card at 1280, ${theme}`, () => {
    test.use({ viewport: { width: 1280, height: 860 }, colorScheme: theme })

    test("the organiser's card counts who said what, and asks nothing", async ({ page }, testInfo) => {
      test.setTimeout(180_000)
      await openCalendar(page, testInfo)
      await page.locator(`[data-event-uuid="${LAUNCH}"]`).first().click()
      await expect(card(page).getByText("2 going · 1 maybe · 1 not going · 1 no answer")).toBeVisible({ timeout: 20_000 })
      await expect(card(page).getByRole("radiogroup")).toHaveCount(0)
      await expect(card(page).getByRole("img", { name: "Maya Chen, going" })).toBeVisible()
      await shot(page, "card-organiser", theme)
    })

    test("a guest's card asks Going?, and shows the answer at once", async ({ page }, testInfo) => {
      test.setTimeout(180_000)
      await openCalendar(page, testInfo)
      await page.locator(`[data-event-uuid="${CRIT}"]`).first().click()
      const going = card(page).getByRole("radiogroup", { name: "Going?" })
      await expect(going).toBeVisible({ timeout: 20_000 })
      await shot(page, "card-guest-unanswered", theme)
      await going.getByRole("radio", { name: "Yes" }).click()
      await expect(going.getByRole("radio", { name: /Yes/ })).toHaveAttribute("aria-checked", "true")
      await shot(page, "card-guest-answered", theme)
    })

    test("above four guests the faces fold, and open to the list", async ({ page }, testInfo) => {
      test.setTimeout(180_000)
      await openCalendar(page, testInfo)
      await page.locator(`[data-event-uuid="${HANDS}"]`).first().click()
      const fold = card(page).getByRole("button", { name: "3 going · 1 maybe · 1 not going · 2 no answer" })
      await expect(fold).toBeVisible({ timeout: 20_000 })
      await shot(page, "card-many-guests", theme)
      await fold.click()
      await expect(card(page).getByRole("list", { name: "Guests and their answers" })).toBeVisible()
      await shot(page, "card-many-guests-open", theme)
    })

    test("the reader's reminder opens to its choices, and a choice is kept at once, with no toast", async ({ page }, testInfo) => {
      test.setTimeout(180_000)
      await openCalendar(page, testInfo)
      await page.locator(`[data-event-uuid="${LAUNCH}"]`).first().click()
      const row = card(page).getByRole("button", { name: "Reminders: 10 minutes before" })
      await expect(row).toBeVisible({ timeout: 20_000 })
      await row.click()
      const menu = page.locator("[data-reminder-menu]")
      await expect(menu.getByRole("menuitemradio", { name: "10 minutes before" })).toHaveAttribute("aria-checked", "true")
      await expect(menu.getByRole("menuitemradio")).toHaveText(["No reminder", "At the start", "5 minutes before", "10 minutes before", "30 minutes before", "1 hour before", "1 day before"])
      // Beside the row, never over the card's title. (An open menu hides the
      // rest of the page from the accessibility tree, so the title by its tag.)
      const [menuBox, titleBox] = [await menu.boundingBox(), await card(page).locator("h2").first().boundingBox()]
      expect(menuBox && titleBox && (menuBox.y >= titleBox.y + titleBox.height || menuBox.x + menuBox.width <= titleBox.x || menuBox.x >= titleBox.x + titleBox.width), "the menu covers the title").toBe(true)
      await shot(page, "card-reminders-open", theme)
      const saved = page.waitForRequest((r) => r.method() === "PUT" && r.url().endsWith(`/calendar/events/${LAUNCH}/reminders`))
      await menu.getByRole("menuitemradio", { name: "30 minutes before" }).click()
      expect((await saved).postDataJSON()).toEqual({ minutes: [30] })
      await expect(card(page).getByRole("button", { name: "Reminders: 30 minutes before" })).toBeVisible()
      // Saved at once, without a toast; the card stays open. (The calendar's
      // own live regions are statuses too: a toast is a .toast-root.)
      await expect(page.locator(".toast-root")).toHaveCount(0)
      await shot(page, "card-reminders-chosen", theme)
    })

    test("an ended event offers no Join and asks nothing; its call link is under More", async ({ page }, testInfo) => {
      test.setTimeout(180_000)
      await openCalendar(page, testInfo)
      await page.locator(`[data-event-uuid="${SYNC}"]`).first().click()
      await expect(card(page).getByText("ended")).toBeVisible({ timeout: 20_000 })
      await expect(card(page).getByRole("link", { name: /Join call/ })).toHaveCount(0)
      await expect(card(page).getByRole("radiogroup")).toHaveCount(0)
      // Nothing left to be reminded of.
      await expect(card(page).getByRole("button", { name: /Reminders/ })).toHaveCount(0)
      await card(page).getByRole("button", { name: "More" }).click()
      await expect(page.getByRole("menuitem", { name: "Copy call link" })).toBeVisible()
      await shot(page, "card-ended", theme)
    })

    test("the organiser's panel lists each answer and note, asks again and copies a guest's link", async ({ page }, testInfo) => {
      test.setTimeout(180_000)
      await openCalendar(page, testInfo)
      await page.locator(`[data-event-uuid="${LAUNCH}"]`).first().click()
      await card(page).getByRole("button", { name: "Open details" }).click()
      const guests = page.locator("[data-event-guests]")
      await expect(guests.getByText("“Ten minutes late”")).toBeVisible({ timeout: 20_000 })
      await expect(guests.getByText("Not emailed. Copy their link and send it yourself.")).toBeVisible()
      await expect(guests.getByRole("button", { name: "Ask again" })).toBeVisible()
      await expect(page.locator("[data-event-reminders]").getByRole("button", { name: "Reminders: 10 minutes before" })).toBeVisible()
      await shot(page, "panel-organiser", theme)
    })

    test("a guest answers in the panel, with a note for the organiser", async ({ page }, testInfo) => {
      test.setTimeout(180_000)
      await openCalendar(page, testInfo)
      await page.locator(`[data-event-uuid="${CRIT}"]`).first().click()
      await card(page).getByRole("button", { name: "More" }).click()
      await page.getByRole("menuitem", { name: "Open" }).click()
      const answer = page.locator("[data-event-answer]")
      await answer.getByRole("radio", { name: "Yes" }).click()
      await expect(answer.getByRole("textbox", { name: "Your note with your answer" })).toBeVisible({ timeout: 20_000 })
      await shot(page, "panel-guest", theme)
    })

    test("a guest proposes another time with their answer, sees it, and takes it back", async ({ page }, testInfo) => {
      test.setTimeout(180_000)
      await openCalendar(page, testInfo)
      await page.locator(`[data-event-uuid="${CRIT}"]`).first().click()
      await card(page).getByRole("button", { name: "More" }).click()
      await page.getByRole("menuitem", { name: "Open" }).click()
      const answer = page.locator("[data-event-answer]")
      await answer.getByRole("radio", { name: "Maybe" }).click()
      await answer.getByRole("button", { name: "Propose a new time" }).click({ timeout: 20_000 })
      const form = answer.getByRole("group", { name: "Propose a new time" })
      await expect(form).toBeVisible({ timeout: 20_000 })
      // The crit's own day, an hour earlier: its 45 minutes move with From.
      await form.getByRole("button", { name: /^From/ }).click()
      await page.getByRole("listbox", { name: "Time" }).getByRole("option", { name: /^10:00\sAM/ }).click()
      await shot(page, "panel-guest-proposing", theme)
      const sent = page.waitForRequest((r) => r.method() === "POST" && r.url().endsWith(`/calendar/events/${CRIT}/answer`) && !!r.postDataJSON()?.proposal)
      await form.getByRole("button", { name: "Propose" }).click()
      expect((await sent).postDataJSON()).toEqual({ answer: "tentative", scope: "all", proposal: { start: at(22, 10), end: at(22, 10, 45) } })
      const mine = answer.locator("[data-your-proposal]")
      await expect(mine).toContainText(/You proposed Thu 22 Oct, 10:00\sAM – 10:45\sAM/, { timeout: 20_000 })
      await shot(page, "panel-guest-proposed", theme)
      const back = page.waitForRequest((r) => r.method() === "POST" && r.url().endsWith(`/calendar/events/${CRIT}/answer`) && !!r.postDataJSON()?.proposal)
      await mine.getByRole("button", { name: "Take it back" }).click()
      expect((await back).postDataJSON().proposal).toEqual({})
      await expect(answer.getByRole("button", { name: "Propose a new time" })).toBeVisible({ timeout: 20_000 })
    })

    test("the organiser sees a guest's proposed time on their row, and uses it or dismisses it", async ({ page }, testInfo) => {
      test.setTimeout(180_000)
      await openCalendar(page, testInfo)
      await page.locator(`[data-event-uuid="${LAUNCH}"]`).first().click()
      await card(page).getByRole("button", { name: "Open details" }).click()
      const row = page.locator("[data-event-guests] [data-guest-proposal]")
      await expect(row).toContainText(/Proposes Wed 21 Oct, 4:00\sPM – 5:00\sPM/, { timeout: 20_000 })
      await shot(page, "panel-organiser-proposal", theme)
      // Used as any change is: the event moves to it.
      const moved = page.waitForRequest((r) => r.method() === "PATCH" && new URL(r.url()).pathname.endsWith(`/calendar/events/${LAUNCH}`))
      await row.getByRole("button", { name: "Use this time" }).click()
      const patch = (await moved).postDataJSON() as { start: { at: string }; end: { at: string } }
      expect([patch.start.at, patch.end.at]).toEqual([MAYAS.start, MAYAS.end])
      const dismissed = page.waitForRequest((r) => r.method() === "POST" && r.url().endsWith(`/calendar/events/${LAUNCH}/proposal/dismiss`))
      await row.getByRole("button", { name: "Dismiss Maya Chen's proposal" }).click()
      expect((await dismissed).postDataJSON()).toEqual({ user_uuid: MAYA.user_uuid })
      await expect(row).toHaveCount(0, { timeout: 20_000 })
    })
  })

  test.describe(`the event card on a phone, ${theme}`, () => {
    test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: theme })

    test("is the half sheet, with Going? at its foot at 44 px", async ({ page }, testInfo) => {
      test.setTimeout(180_000)
      // A phone's week is its day: Thursday, the crit's.
      await openCalendar(page, testInfo, "date=2026-10-22&view=day", CRIT)
      await page.locator(`[data-event-uuid="${CRIT}"]`).first().tap()
      const sheet = page.locator("[data-event-sheet]")
      await expect(sheet.getByRole("radiogroup", { name: "Going?" })).toBeVisible({ timeout: 20_000 })
      const yes = await sheet.getByRole("radio", { name: "Yes" }).boundingBox()
      expect(yes && yes.height >= 43.5, `Yes is ${yes?.height} px tall`).toBe(true)
      await shot(page, "sheet-guest", theme)
    })

    test("says the reader's reminder, which opens a sheet of its choices, and a choice closes it", async ({ page }, testInfo) => {
      test.setTimeout(180_000)
      // Friday, the all hands Sam said yes to: reminded by default.
      await openCalendar(page, testInfo, "date=2026-10-23&view=day", HANDS)
      await page.locator(`[data-event-uuid="${HANDS}"]`).first().tap()
      const sheet = page.locator("[data-event-sheet]")
      const row = sheet.getByRole("button", { name: "Reminders: 10 minutes before" })
      await expect(row).toBeVisible({ timeout: 20_000 })
      // 44 px under a finger, so its reach is its own box and takes none of
      // the Guests row's taps above it.
      const box = await row.boundingBox()
      expect(box && box.height >= 43.5, `the row is ${box?.height} px tall`).toBe(true)
      await row.tap()
      // A sheet over the event's: "Remind me", the event under it, seven 44 px rows.
      const choices = page.locator("[data-reminder-sheet]")
      await expect(choices.getByRole("heading", { name: "Remind me" })).toBeVisible()
      await expect(choices.getByRole("button", { name: "10 minutes before" })).toHaveAttribute("aria-current", "true")
      const rows = choices.getByRole("group", { name: "Remind me" }).getByRole("button")
      await expect(rows).toHaveCount(7)
      for (const box of await Promise.all((await rows.all()).map((r) => r.boundingBox()))) expect(box && box.height >= 43.5, `a row is ${box?.height} px tall`).toBe(true)
      await shot(page, "sheet-reminders-open", theme)
      const saved = page.waitForRequest((r) => r.method() === "PUT" && r.url().endsWith(`/calendar/events/${HANDS}/reminders`))
      await choices.getByRole("button", { name: "30 minutes before" }).tap()
      expect((await saved).postDataJSON()).toEqual({ minutes: [30] })
      await expect(choices).toHaveCount(0)
      await expect(sheet.getByRole("button", { name: "Reminders: 30 minutes before" })).toBeVisible()
    })

    test("proposes another time from the event's own page, in its pinned foot", async ({ page }, testInfo) => {
      test.setTimeout(180_000)
      await openCalendar(page, testInfo, "date=2026-10-22&view=day", CRIT)
      await page.goto(`/app/calendar/event/${CRIT}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
      const foot = page.locator("[data-event-panel-foot]")
      await foot.getByRole("radio", { name: "Maybe" }).tap({ timeout: 30_000 })
      await foot.getByRole("button", { name: "Propose a new time" }).tap({ timeout: 20_000 })
      // The whole form, its caption with it, above the phone's bottom edge.
      const form = foot.getByRole("group", { name: "Propose a new time" })
      await expect(form).toBeInViewport({ ratio: 1, timeout: 20_000 })
      await expect(form.getByText("Propose a new time")).toBeVisible()
      await form.getByRole("button", { name: /^From/ }).tap()
      await page.getByRole("listbox", { name: "Time" }).getByRole("option", { name: /^10:00\sAM/ }).tap()
      await shot(page, "page-guest-proposing", theme)
      const sent = page.waitForRequest((r) => r.method() === "POST" && r.url().endsWith(`/calendar/events/${CRIT}/answer`) && !!r.postDataJSON()?.proposal)
      await form.getByRole("button", { name: "Propose" }).tap()
      expect((await sent).postDataJSON().proposal).toEqual({ start: at(22, 10), end: at(22, 10, 45) })
      await expect(foot.locator("[data-your-proposal]")).toContainText(/You proposed Thu 22 Oct, 10:00\sAM – 10:45\sAM/, { timeout: 20_000 })
      await shot(page, "page-guest-proposed", theme)
    })

    test("shows the organiser a guest's proposed time on its row, on the event's own page", async ({ page }, testInfo) => {
      test.setTimeout(180_000)
      await openCalendar(page, testInfo, "date=2026-10-21&view=day", LAUNCH)
      await page.goto(`/app/calendar/event/${LAUNCH}`, { waitUntil: "domcontentloaded", timeout: 120_000 })
      const row = page.locator("[data-event-guests] [data-guest-proposal]")
      await expect(row).toContainText(/Proposes Wed 21 Oct, 4:00\sPM – 5:00\sPM/, { timeout: 30_000 })
      await row.scrollIntoViewIfNeeded()
      await expect(row.getByRole("button", { name: "Use this time" })).toBeInViewport()
      await shot(page, "page-organiser-proposal", theme)
    })
  })

  for (const width of [1280, 390]) {
    test.describe(`an invitation's own page at ${width}, ${theme}`, () => {
      test.use({ viewport: { width, height: width > 600 ? 860 : 844 }, isMobile: width < 600, hasTouch: width < 600, colorScheme: theme })

      test("says who invited them to what and when, takes their answer, and another time they propose", async ({ page }, testInfo) => {
        test.setTimeout(180_000)
        let response = "needs_action"
        let proposal: Proposal | undefined
        await page.clock.setFixedTime(NOW)
        await stubBackend(page, testInfo, {
          "/public/rsvp/": (url: URL, request: Request) => {
            void url
            // The page's answer is kept, and so is a proposal ({} takes it back).
            if (request.method() === "POST") {
              const body = request.postDataJSON() as { answer?: string; proposal?: Partial<Proposal> }
              if (body.answer) response = body.answer
              if (body.proposal) proposal = body.proposal.start && body.proposal.end ? { start: body.proposal.start, end: body.proposal.end } : undefined
            }
            return {
              msg: "ok",
              data: {
                title: "Pricing page walkthrough", start: { at: at(23, 15), zone: "Europe/London" }, end: { at: at(23, 15, 45) }, all_day: false,
                organiser: "Sam Rivera", ended: false, proposable: true, notes: "We'll walk the new tiers and the FAQ.",
                you: { name: "Alex Kim", email: "alex@example.com", response, ...(proposal ? { proposal } : {}) },
                guests: [{ name: "Maya Chen", response: "accepted" }, { name: "Jonas Weber", response: "tentative" }],
              },
            }
          },
        })
        await page.goto("/rsvp/invitation-token", { waitUntil: "domcontentloaded", timeout: 120_000 })
        await expect(page.getByRole("heading", { name: "Pricing page walkthrough" })).toBeVisible({ timeout: 60_000 })
        await shot(page, "rsvp-unanswered", theme)
        await page.getByRole("radio", { name: "Yes" }).click()
        await expect(page.getByRole("textbox", { name: "Your note with your answer" })).toBeVisible({ timeout: 20_000 })
        await shot(page, "rsvp-answered", theme)
        // An hour earlier, from the same page: its fields open by them, or in a sheet of their own on a phone.
        await page.getByRole("button", { name: "Propose a new time" }).click()
        const form = page.getByRole("group", { name: "Propose a new time" })
        await expect(form).toBeVisible({ timeout: 20_000 })
        await form.getByRole("button", { name: /^From/ }).click()
        await page.getByRole("listbox", { name: "Time" }).getByRole("option", { name: /^2:00\sPM/ }).click()
        await shot(page, "rsvp-proposing", theme)
        const sent = page.waitForRequest((r) => r.method() === "POST" && r.url().includes("/public/rsvp/") && !!r.postDataJSON()?.proposal)
        await form.getByRole("button", { name: "Propose" }).click()
        expect((await sent).postDataJSON()).toEqual({ answer: "accepted", proposal: { start: at(23, 14), end: at(23, 14, 45) } })
        await expect(page.locator("[data-your-proposal]")).toContainText(/You proposed Fri 23 Oct, 2:00\sPM – 2:45\sPM/, { timeout: 20_000 })
        await shot(page, "rsvp-proposed", theme)
      })
    })
  }
}
