import { expect, test, type Page, type Request, type TestInfo } from "@playwright/test"

import { SAM, stubBackend, type Answers } from "./stubbedApp"

// The one Event Form (calendar FORM): the full dialog, the event's panel and
// a phone's page edit with the same form. A new event takes a guest marked
// optional, what guests can do, a second reminder and a colour, and is
// created through the calendar's own API with each; the panel and the phone
// open the same rows with the event as it is. The week in colour (STEP5_PLAN
// §3 C): each event in its own camp hue, on the week and on a phone's agenda.
// With SHOTS_DIR set, each state is also saved for review, at the viewport
// and theme it ran in.

// Wednesday 21 October 2026, 10:00 on the browser's clock.
const NOW = new Date(2026, 9, 21, 10, 0)
const at = (day: number, h: number, m = 0) => new Date(2026, 9, day, h, m).toISOString()
const ME = { ...SAM, user_name: "Sam Rivera" }
const MAYA = { user_uuid: "5e1f0000-0000-4000-8000-0000000000a2", user_name: "Maya Chen", user_full_name: "Maya Chen", user_email_id: "maya@example.com" }
const LAUNCH = "0b8a3c1e-1d2f-4a5b-8c7d-9e0f1a2b3c01"

const listed = () => ({
  event_uuid: LAUNCH,
  event_title: "Launch review",
  event_start_time: at(21, 14),
  event_end_time: at(21, 15),
  event_description: "<p>Walk the checklist, then decide go or no-go.</p>",
  event_created_by: ME,
  event_participants: [MAYA],
  event_guests: [{ user_uuid: MAYA.user_uuid, role: "required", response: "accepted" }],
  event_reminders: [10],
  event_reminders_default: true,
  event_hue: "moss",
  event_location: "Studio, second floor",
})

const apiEvent = () => ({
  id: LAUNCH,
  kind: "event",
  title: "Launch review",
  notes: "<p>Walk the checklist, then decide go or no-go.</p>",
  location: "Studio, second floor",
  start: { at: at(21, 14), zone: "Europe/London" },
  end: { at: at(21, 15) },
  all_day: false,
  sequence: 3,
  organiser: { user_uuid: ME.user_uuid },
  attendees: [{ user_uuid: MAYA.user_uuid, user_name: "Maya Chen", role: "required", response: "accepted" }],
  hue: "moss",
  transparency: "opaque",
  visibility: "default",
  guests_can_modify: false,
  guests_can_invite: true,
  guests_can_see_guests: true,
})

/** A week of meetings, one in each camp hue and one in the calendar's own colour. */
const colourful = () => {
  const day = (d: number, h: number, title: string, hue: string, minutes = 60) => ({
    event_uuid: `0b8a3c1e-1d2f-4a5b-8c7d-9e0f1a2b${String(d).padStart(2, "0")}${String(h).padStart(2, "0")}`,
    event_title: title,
    event_start_time: at(d, h),
    event_end_time: new Date(new Date(at(d, h)).getTime() + minutes * 60_000).toISOString(),
    event_created_by: ME,
    event_participants: [MAYA],
    event_reminders: [10],
    event_reminders_default: true,
    ...(hue ? { event_hue: hue } : {}),
  })
  return [
    listed(),
    day(19, 9, "Standup", "moss", 15),
    day(20, 9, "Standup", "moss", 15),
    day(22, 9, "Standup", "moss", 15),
    day(19, 11, "Launch sync", "lake"),
    day(20, 14, "Design critique", "dusk"),
    day(22, 11, "Customer call", "berry"),
    day(23, 10, "One-to-one with Maya", "sun", 30),
    day(23, 14, "Roadmap review", "sky"),
    day(22, 15, "Hiring debrief", ""),
  ]
}

async function openApp(page: Page, testInfo: TestInfo, path = "/app/calendar?date=2026-10-21&view=week", events: unknown[] = [listed()], more: Answers = {}) {
  const writes: { method: string; url: string; body: unknown }[] = []
  await page.clock.setFixedTime(NOW)
  await page.addInitScript(() => {
    try {
      localStorage.setItem("oc_keys_tip_seen", "1")
    } catch {
      /* storage blocked */
    }
  })
  await stubBackend(page, testInfo, {
    "/event/getEvents": { msg: "ok", data: events },
    "/event/getEvent/": { msg: "ok", data: listed() },
    "/calendar/events": (url: URL, request: Request) => {
      if (request.method() !== "GET") writes.push({ method: request.method(), url: url.pathname, body: request.postDataJSON() })
      if (request.method() === "POST" && url.pathname.endsWith("/calendar/events")) return { msg: "ok", data: { ...apiEvent(), id: "new-1" } }
      if (url.pathname.endsWith("/reminders")) return { msg: "ok", data: { minutes: [10, 30], default: false } }
      return { msg: "ok", data: apiEvent() }
    },
    "/user/searchUserAndChannelList": { msg: "ok", data: [{ user_uuid: MAYA.user_uuid, user_name: "Maya Chen", user_full_name: "Maya Chen" }] },
    "/integration/google-calendar/status": { msg: "ok", data: { isConnected: false } },
    "/user/assignedTaskList": { msg: "ok", data: { user_tasks: [] } },
    "/config/client": { msg: "ok", data: { features: { calendar_repeats: true } } },
    "/event/bookingPages": { msg: "ok", data: [] },
    "/event/suggestTimes": { msg: "ok", data: { suggestions: [] } },
    ...more,
  })
  await page.goto(path, { waitUntil: "domcontentloaded", timeout: 120_000 })
  return writes
}

/** Saved for review when SHOTS_DIR is set: name-<width>-<theme>.png, of the screen alone. */
async function shot(page: Page, name: string, theme: string) {
  const dir = process.env.SHOTS_DIR
  if (!dir) return
  await expect(page.getByText("Not in this test")).toHaveCount(0)
  await page.waitForTimeout(450)
  await page.screenshot({ path: `${dir}/${name}-${page.viewportSize()?.width}-${theme}.png` })
}

for (const theme of ["light", "dark"] as const) {
  test.describe(`the Event Form at 1280, ${theme}`, () => {
    test.use({ viewport: { width: 1280, height: 900 }, colorScheme: theme })

    test("a new event takes an optional guest, what guests can do, a second reminder and a colour", async ({ page }, testInfo) => {
      test.setTimeout(180_000)
      const writes = await openApp(page, testInfo)
      await expect(page.locator(`[data-event-uuid="${LAUNCH}"]`).first()).toBeVisible({ timeout: 60_000 })
      await page.getByRole("button", { name: "New event" }).click()
      const dialog = page.locator("[data-event-dialog]")
      await dialog.getByRole("textbox", { name: "Title" }).fill("Pricing walkthrough")
      await shot(page, "dialog-new", theme)
      // "All day" is the shared SwitchRow (A6), a switch named by its label.
      const allDay = dialog.getByRole("switch", { name: "All day" })
      await allDay.scrollIntoViewIfNeeded()
      await expect(allDay).toHaveAttribute("aria-checked", "false")
      await shot(page, "form-all-day", theme)
      await dialog.getByRole("combobox", { name: "Guests" }).fill("Maya")
      await page.getByRole("option", { name: "Maya Chen" }).click()
      await dialog.getByRole("button", { name: "Mark Maya Chen optional" }).click()
      // The state is a chip by the name; the action says what it does now.
      await expect(dialog.locator("[data-optional-chip]")).toHaveText("Optional")
      await expect(dialog.getByRole("button", { name: "Make Maya Chen required" })).toHaveText("Make required")
      await dialog.getByRole("checkbox", { name: "Change the event" }).click()
      await dialog.locator("[data-form-guests]").scrollIntoViewIfNeeded()
      await shot(page, "dialog-guests", theme)
      await dialog.getByRole("button", { name: "Add a reminder" }).click()
      await dialog.getByRole("radio", { name: "Sun", exact: true }).click()
      await shot(page, "dialog-filled", theme)
      await dialog.getByRole("button", { name: "Create event" }).click()
      await expect(dialog).toHaveCount(0, { timeout: 20_000 })
      const created = writes.find((w) => w.method === "POST" && w.url.endsWith("/calendar/events"))
      expect(created?.body).toMatchObject({
        title: "Pricing walkthrough",
        hue: "sun",
        guests_can_modify: true,
        guests_can_invite: true,
        attendees: [{ user_uuid: MAYA.user_uuid, role: "optional" }],
      })
      const reminders = writes.find((w) => w.url.endsWith("/new-1/reminders"))
      expect((reminders?.body as { minutes: number[] }).minutes).toHaveLength(2)
    })

    // Head 5b (gcal-9b): out of office declines invitations for you, with a message.
    test("out of office declines new invitations with a message", async ({ page }, testInfo) => {
      test.setTimeout(180_000)
      const writes = await openApp(page, testInfo)
      await expect(page.locator(`[data-event-uuid="${LAUNCH}"]`).first()).toBeVisible({ timeout: 60_000 })
      await page.getByRole("button", { name: "New event" }).click()
      const dialog = page.locator("[data-event-dialog]")
      await dialog.getByRole("switch", { name: /^Away/ }).click()
      // Its rows sit right under the Away switch, as its children (DB-25).
      const under = await dialog.locator("[data-away-rows]").evaluate((el) => el.previousElementSibling?.textContent ?? "")
      expect(under).toMatch(/^Away/)
      const decline = dialog.getByRole("combobox", { name: "While you're away" })
      await decline.scrollIntoViewIfNeeded()
      await expect(decline).toHaveText("Don't decline")
      await expect(dialog.getByRole("textbox", { name: "Message with each decline" })).toHaveCount(0)
      await decline.click()
      await page.getByRole("option", { name: "Decline new invitations" }).click()
      await dialog.getByRole("textbox", { name: "Message with each decline" }).fill("Back Monday, ask Maya.")
      await shot(page, "form-out-of-office", theme)
      await dialog.getByRole("button", { name: "Create event" }).click()
      await expect(dialog).toHaveCount(0, { timeout: 20_000 })
      const created = writes.find((w) => w.method === "POST" && w.url.endsWith("/calendar/events"))
      expect(created?.body).toMatchObject({ kind: "out_of_office", out_of_office: { decline: "new", message: "Back Monday, ask Maya." } })
    })

    test("Find a time says it counts only your times when the workspace keeps busy times private", async ({ page }, testInfo) => {
      test.setTimeout(180_000)
      await openApp(page, testInfo, undefined, undefined, {
        "/event/suggestTimes": { msg: "ok", data: { suggestions: [{ start: at(22, 9), end: at(22, 9, 30), free: [ME.user_uuid], reason: "You're free" }], private: [MAYA.user_uuid] } },
      })
      await expect(page.locator(`[data-event-uuid="${LAUNCH}"]`).first()).toBeVisible({ timeout: 60_000 })
      await page.getByRole("button", { name: "New event" }).click()
      const dialog = page.locator("[data-event-dialog]")
      await dialog.getByRole("combobox", { name: "Guests" }).fill("Maya")
      await page.getByRole("option", { name: "Maya Chen" }).click()
      await expect(dialog.getByText("Your workspace keeps when people are busy private, so these times count only yours.")).toBeVisible()
      await expect(dialog.getByText("When you're free this week, in your working hours.")).toBeVisible()
      await shot(page, "find-time-private", theme)
    })

    test("the week is in colour: each event in its own hue, the rest in the calendar's", async ({ page }, testInfo) => {
      test.setTimeout(180_000)
      await openApp(page, testInfo, undefined, colourful())
      await expect(page.locator(`[data-event-uuid="${LAUNCH}"]`).first()).toBeVisible({ timeout: 60_000 })
      for (const [title, hue] of [["Launch sync", "lake"], ["Design critique", "dusk"], ["Customer call", "berry"], ["One-to-one with Maya", "sun"], ["Roadmap review", "sky"]]) {
        await expect(page.locator(`[data-hue-block][data-event-uuid]`, { hasText: title }).first()).toHaveAttribute("data-hue", hue)
      }
      await shot(page, "week-colour", theme)
    })

    test("the form's Colour row picks by key, the chosen swatch ringed", async ({ page }, testInfo) => {
      test.setTimeout(180_000)
      await openApp(page, testInfo)
      await expect(page.locator(`[data-event-uuid="${LAUNCH}"]`).first()).toBeVisible({ timeout: 60_000 })
      await page.getByRole("button", { name: "New event" }).click()
      const colours = page.locator("[data-event-dialog]").getByRole("radiogroup", { name: "Colour" })
      // The calendar's own colour is hollow, a ring in its hue, and says which.
      const calendar = colours.getByRole("radio", { name: "Calendar colour (Sun)" })
      await expect(calendar).toHaveAttribute("aria-checked", "true")
      await expect(calendar).toHaveAttribute("data-hollow", "true")
      await calendar.focus()
      await colours.scrollIntoViewIfNeeded()
      await shot(page, "colour-row-calendar", theme)
      await page.keyboard.press("ArrowRight")
      await expect(colours.getByRole("radio", { name: "Moss" })).toHaveAttribute("aria-checked", "true")
      await expect(colours.getByRole("radio", { name: "Moss" })).toBeFocused()
      await colours.scrollIntoViewIfNeeded()
      await shot(page, "colour-row", theme)
    })

    test("the panel edits the event in the same rows, with its colour, place and guests", async ({ page }, testInfo) => {
      test.setTimeout(180_000)
      const writes = await openApp(page, testInfo)
      await page.locator(`[data-event-uuid="${LAUNCH}"]`).first().click()
      await page.locator("[data-event-card]").getByRole("button", { name: "Open details" }).click()
      await page.getByRole("button", { name: "Edit event" }).click()
      const form = page.locator("[data-event-edit]")
      await expect(form.getByRole("textbox", { name: "Title" })).toHaveValue("Launch review", { timeout: 20_000 })
      await expect(form.getByRole("radio", { name: "Moss" })).toHaveAttribute("aria-checked", "true")
      await expect(form.getByRole("textbox", { name: "Place" })).toHaveValue("Studio, second floor")
      const maya = form.getByRole("list", { name: "Guests" }).getByRole("listitem").first()
      await expect(maya).toContainText("Maya Chen")
      await expect(maya).toContainText("· going")
      // Notes kept as rich text read as text; the default reminder says so after its value.
      const notes = form.getByRole("textbox", { name: "Notes" })
      await expect(notes).toHaveValue("Walk the checklist, then decide go or no-go.")
      await expect(form.getByRole("combobox", { name: "Reminder 1" })).toHaveText("10 minutes before · your default")
      await expect(form.getByRole("combobox", { name: "Show as" })).toHaveText("Busy")
      await shot(page, "panel-edit", theme)
      // A change goes back as rich text, as the notes were kept.
      await notes.fill("Walk the checklist, then decide go or no-go.\nBring the numbers.")
      await page.locator("[data-panel-actions]").getByRole("button", { name: "Save" }).click()
      await page.getByRole("button", { name: "Don't send" }).click()
      await expect.poll(() => writes.find((w) => w.method === "PATCH")?.body, { timeout: 20_000 }).toMatchObject({
        notes: "<p>Walk the checklist, then decide go or no-go.</p><p>Bring the numbers.</p>",
      })
    })

    // V-34: the card's pencil is named Edit event and does what it says, as
    // Google Calendar's does: one press and the event is open, editing. Open
    // details is for reading.
    test("the card's Edit event opens the event already editing, in one press", async ({ page }, testInfo) => {
      test.setTimeout(180_000)
      await openApp(page, testInfo)
      await page.locator(`[data-event-uuid="${LAUNCH}"]`).first().click({ timeout: 60_000 })
      await page.locator("[data-event-card]").getByRole("button", { name: "Edit event" }).click()
      await expect(page.locator("[data-event-edit]").getByRole("textbox", { name: "Title" })).toHaveValue("Launch review", { timeout: 20_000 })
      await shot(page, "card-pencil-edit", theme)
    })
  })

  test.describe(`the Event Form on a phone, ${theme}`, () => {
    test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: theme })

    test("the agenda is in colour too", async ({ page }, testInfo) => {
      test.setTimeout(180_000)
      await openApp(page, testInfo, "/app/calendar?date=2026-10-21&view=agenda", colourful())
      // The agenda runs from today: Thursday's customer call, Friday's one-to-one.
      await expect(page.getByText("Customer call").first()).toBeVisible({ timeout: 60_000 })
      await shot(page, "agenda-colour", theme)
    })

    test("the form's Colour row is a finger's size", async ({ page }, testInfo) => {
      test.setTimeout(180_000)
      await openApp(page, testInfo, `/app/calendar/event/${LAUNCH}`)
      await expect(page.getByRole("heading", { name: "Launch review" })).toBeVisible({ timeout: 60_000 })
      await page.getByRole("button", { name: "Edit event" }).tap()
      const moss = page.locator("[data-event-edit]").getByRole("radio", { name: "Moss" })
      await expect(moss).toHaveAttribute("aria-checked", "true", { timeout: 20_000 })
      const box = await moss.boundingBox()
      expect(box && box.width >= 27.5, `a swatch is ${box?.width} px under a finger`).toBe(true)
      await moss.scrollIntoViewIfNeeded()
      await shot(page, "colour-row", theme)
    })

    test("the event's own page edits it with the same form", async ({ page }, testInfo) => {
      test.setTimeout(180_000)
      await openApp(page, testInfo, `/app/calendar/event/${LAUNCH}`)
      await expect(page.getByRole("heading", { name: "Launch review" })).toBeVisible({ timeout: 60_000 })
      await page.getByRole("button", { name: "Edit event" }).tap()
      await expect(page.locator("[data-event-edit]").getByRole("textbox", { name: "Title" })).toHaveValue("Launch review", { timeout: 20_000 })
      await shot(page, "phone-edit", theme)
    })

    // V-34 on a phone: the sheet's pencil opens the event's own page editing,
    // in one tap, where it used to open the page to read.
    test("the sheet's Edit event opens the event's page already editing, in one tap", async ({ page }, testInfo) => {
      test.setTimeout(180_000)
      // From the agenda, a phone's list of the day (a tap on the day grid is a finding of its own).
      await openApp(page, testInfo, "/app/calendar?date=2026-10-21&view=agenda")
      await page.locator(`[data-event-uuid="${LAUNCH}"]`).first().tap({ timeout: 60_000 })
      const pencil = page.locator("[data-event-sheet]").getByRole("button", { name: "Edit event" })
      await expect(pencil).toBeVisible({ timeout: 20_000 })
      await pencil.tap()
      await expect(page.locator("[data-event-edit]").getByRole("textbox", { name: "Title" })).toHaveValue("Launch review", { timeout: 20_000 })
      await expect(page).toHaveURL(new RegExp(`/app/calendar/event/${LAUNCH}`))
      await shot(page, "sheet-pencil-edit", theme)
    })

    // Head 5b (gcal-9b) on a phone: Away on, its rows right under the switch in the sheet.
    test("out of office declines new invitations from the phone's sheet", async ({ page }, testInfo) => {
      test.setTimeout(180_000)
      const writes = await openApp(page, testInfo)
      await page.getByRole("button", { name: "New event" }).tap({ timeout: 60_000 })
      const sheet = page.locator("[data-event-dialog]")
      const away = sheet.getByRole("switch", { name: /^Away/ })
      await away.scrollIntoViewIfNeeded()
      await away.tap()
      const decline = sheet.getByRole("combobox", { name: "While you're away" })
      await decline.scrollIntoViewIfNeeded()
      await decline.tap()
      await page.locator("[data-sheet-panel]").getByRole("option", { name: "Decline new invitations" }).tap()
      await expect(decline).toHaveText(/Decline new invitations/)
      const message = sheet.getByRole("textbox", { name: "Message with each decline" })
      await message.fill("Back Monday, ask Maya.")
      await message.blur()
      await sheet.locator("[data-away-rows]").scrollIntoViewIfNeeded()
      await shot(page, "phone-out-of-office", theme)
      await sheet.getByRole("button", { name: "Create event" }).tap()
      await expect(sheet).toHaveCount(0, { timeout: 20_000 })
      const created = writes.find((w) => w.method === "POST" && w.url.endsWith("/calendar/events"))
      expect(created?.body).toMatchObject({ kind: "out_of_office", out_of_office: { decline: "new", message: "Back Monday, ask Maya." } })
    })

    test("Find a time says it counts only your times when the workspace keeps busy times private", async ({ page }, testInfo) => {
      test.setTimeout(180_000)
      await openApp(page, testInfo, undefined, undefined, {
        "/event/suggestTimes": { msg: "ok", data: { suggestions: [{ start: at(22, 9), end: at(22, 9, 30), free: [ME.user_uuid], reason: "You're free" }], private: [MAYA.user_uuid] } },
      })
      await page.getByRole("button", { name: "New event" }).tap({ timeout: 60_000 })
      const sheet = page.locator("[data-event-dialog]")
      const guests = sheet.getByRole("combobox", { name: "Guests" })
      await guests.scrollIntoViewIfNeeded()
      await guests.fill("Maya")
      await page.getByRole("option", { name: "Maya Chen" }).tap()
      const note = sheet.getByText("Your workspace keeps when people are busy private, so these times count only yours.")
      await note.scrollIntoViewIfNeeded()
      await expect(note).toBeVisible()
      await expect(sheet.getByText("When you're free this week, in your working hours.")).toBeVisible()
      await shot(page, "find-time-private", theme)
    })
  })
}

// A select in a sheet is a panel of that sheet, with Back and its name: a
// phone never stacks a second sheet over the one it is in (components/ui/select,
// through the combobox's sheet panels).
test.describe("a select in the new event's sheet, on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })

  test("opens as a panel of the sheet, and a tap picks what the event is created with", async ({ page }, testInfo) => {
    test.setTimeout(180_000)
    const writes = await openApp(page, testInfo)
    await page.getByRole("button", { name: "New event" }).tap({ timeout: 60_000 })
    const sheet = page.locator("[data-event-dialog]")
    await sheet.getByRole("textbox", { name: "Title" }).fill("Pricing walkthrough")
    const showAs = sheet.getByRole("combobox", { name: "Show as" })
    await showAs.scrollIntoViewIfNeeded()
    await showAs.tap()

    const panel = page.locator("[data-sheet-panel]")
    await expect(panel).toBeVisible()
    await expect(page.locator('[data-vaul-drawer][data-state="open"]'), "one sheet, not a sheet over a sheet").toHaveCount(1)
    await expect(page.getByRole("button", { name: "Back" })).toBeVisible()
    await expect(page.getByRole("heading", { name: "Show as" })).toBeVisible()
    await panel.getByRole("option", { name: "Free" }).tap()
    await expect(panel).toHaveCount(0)
    await expect(showAs).toHaveText(/Free/)

    await sheet.getByRole("button", { name: "Create event" }).tap()
    await expect(sheet).toHaveCount(0, { timeout: 20_000 })
    const created = writes.find((w) => w.method === "POST" && w.url.endsWith("/calendar/events"))
    expect(created?.body).toMatchObject({ title: "Pricing walkthrough", transparency: "transparent" })
  })
})
