import { expect, test, type Page, type Request, type TestInfo } from "@playwright/test"
import { reviewShot, SAM, stubBackend, withStatus } from "./stubbedApp"
import { animationsSettled } from "./settled"
import { footIsGutter } from "./sheetLayout"

// Calendar head A (gcal-5): reminders a team can run its week on. An event's
// reminder comes as a pop-up or an email, at a custom time up to four weeks
// before; each calendar has default reminders of the reader's own, set from
// the Calendars panel on a computer and the calendar options on a phone (a
// sheet there); and an event changed elsewhere shows on an open grid without a
// reload. The live message itself (MQTT 48) is the backend's and
// useMqttMessageHandler's: here it arrives as the window event that handler raises.
// With SHOTS_DIR set, each step is saved for the design look.

const NOW = new Date(2026, 9, 21, 10, 0)
const at = (day: number, h: number, m = 0) => new Date(2026, 9, day, h, m).toISOString()
const ME = { ...SAM, user_name: "Sam Rivera" }
const LAUNCH = "0b8a3c1e-1d2f-4a5b-8c7d-9e0f1a2b3c01"
const MOVED = "0b8a3c1e-1d2f-4a5b-8c7d-9e0f1a2b3c02"
const TEAM = { timed: { minutes: [60], email: [60] }, all_day: { minutes: [], email: [] } }
const CALENDARS = [
  { id: "cal-me", name: "Personal", kind: "personal", access: "manage", mine: true },
  { id: "cal-team", name: "Launch", kind: "project", container_kind: "project", container_id: "p-launch", access: "edit" },
]

const listed = (id = LAUNCH, title = "Launch review", day = 21) => ({
  event_uuid: id,
  event_title: title,
  event_start_time: at(day, 14),
  event_end_time: at(day, 15),
  event_created_by: ME,
  event_participants: [],
  event_reminders: [10],
  event_reminders_default: true,
  event_hue: "moss",
})

interface Seen {
  writes: { method: string; url: string; body: unknown }[]
  /** Each read of the events, by its URL's query (its range). */
  reads: string[]
}

/** The week of 21 Oct with one event; `more()` is what a second read of the events adds. */
/**
 * How the preferences answer: `refuse` fails their write; `failRead` fails
 * their read while it says so, and `readHeld` holds a read until it lets go.
 */
interface Prefs {
  refuse?: boolean
  failRead?: () => boolean
  readHeld?: () => Promise<void> | undefined
  /** The reader's own defaults ("mine"), beside the team calendar's. */
  mine?: unknown
}

async function open(page: Page, testInfo: TestInfo, more: () => unknown[] = () => [], prefs: Prefs = {}): Promise<Seen> {
  const seen: Seen = { writes: [], reads: [] }
  await page.clock.setFixedTime(NOW)
  await page.addInitScript(() => {
    try {
      localStorage.setItem("oc_keys_tip_seen", "1")
    } catch {
      /* storage blocked */
    }
  })
  await stubBackend(page, testInfo, {
    "/event/getEvents": (url: URL) => {
      seen.reads.push(url.search)
      return { msg: "ok", data: [listed(), ...more()] }
    },
    "/calendar/events": (url: URL, request: Request) => {
      if (request.method() !== "GET") seen.writes.push({ method: request.method(), url: url.pathname, body: request.postDataJSON() })
      if (request.method() === "POST" && url.pathname.endsWith("/calendar/events")) return { msg: "ok", data: { id: "new-1", kind: "event", title: "Pricing walkthrough" } }
      return { msg: "ok", data: { minutes: [10], default: true } }
    },
    "/user/preferences": async (url: URL, request: Request) => {
      if (request.method() === "PUT") {
        seen.writes.push({ method: "PUT", url: url.pathname, body: request.postDataJSON() })
        return prefs.refuse ? withStatus(500, { msg: "internal error" }) : { msg: "ok" }
      }
      await prefs.readHeld?.()
      if (prefs.failRead?.()) return withStatus(500, { msg: "internal error" })
      return { msg: "ok", data: { "calendar.default_reminders": { "cal-team": TEAM, ...(prefs.mine ? { mine: prefs.mine } : {}) } } }
    },
    "/calendar/calendars/events": { msg: "ok", data: [], truncated: false },
    "/calendar/calendars": { msg: "ok", data: CALENDARS },
    "/integration/google-calendar/status": { msg: "ok", data: { isConnected: false } },
    "/user/assignedTaskList": { msg: "ok", data: { user_tasks: [] } },
    "/config/client": { msg: "ok", data: { features: { calendar_repeats: true } } },
    "/event/bookingPages": { msg: "ok", data: [] },
    "/event/suggestTimes": { msg: "ok", data: { suggestions: [] } },
  })
  await page.goto("/app/calendar?date=2026-10-21&view=week", { waitUntil: "domcontentloaded", timeout: 120_000 })
  await expect(page.locator(`[data-event-uuid="${LAUNCH}"]`).first()).toBeVisible({ timeout: 60_000 })
  return seen
}

/** The defaults the reader saved, as the preference write carried them. */
function savedDefaults(seen: Seen) {
  const put = seen.writes.find((w) => w.method === "PUT" && w.url.endsWith("/user/preferences/calendar.default_reminders"))
  expect(put, "the defaults were saved").toBeTruthy()
  return (put!.body as { value: Record<string, { timed: { minutes: number[]; email: number[] } }> }).value
}

for (const theme of ["light", "dark"] as const) {
  test.describe(`reminders at 1280, ${theme}`, () => {
    test.use({ viewport: { width: 1280, height: 900 }, colorScheme: theme })

    test("a reminder comes by email, and another two weeks before", async ({ page }, testInfo) => {
      test.setTimeout(180_000)
      const seen = await open(page, testInfo)
      await page.getByRole("button", { name: "New event" }).click()
      const dialog = page.locator("[data-event-dialog]")
      await dialog.getByRole("textbox", { name: "Title" }).fill("Pricing walkthrough")
      const rows = dialog.locator("[data-form-reminders]")
      await rows.scrollIntoViewIfNeeded()
      await rows.getByRole("button", { name: "Add a reminder" }).click()
      await rows.getByRole("combobox", { name: "Reminder 2 comes as" }).click()
      await page.getByRole("option", { name: "Email" }).click()
      await expect(rows.getByRole("combobox", { name: "Reminder 2 comes as" })).toHaveText("Email")

      await rows.getByRole("combobox", { name: "Reminder 1", exact: true }).click()
      await page.getByRole("option", { name: "Custom…" }).click()
      const custom = rows.locator("[data-custom-reminder]")
      await custom.getByRole("spinbutton", { name: "How many" }).fill("5")
      await custom.getByRole("combobox", { name: "Unit" }).click()
      await page.getByRole("option", { name: "weeks before" }).click()
      // Past four weeks is refused, in words, and Set waits.
      await expect(custom.getByRole("alert")).toHaveText("Up to 4 weeks before, in whole numbers.")
      await expect(custom.getByRole("button", { name: "Set" })).toBeDisabled()
      await custom.getByRole("spinbutton", { name: "How many" }).fill("2")
      await reviewShot(page, "a-custom-reminder", theme)
      await custom.getByRole("button", { name: "Set" }).click()
      await expect(rows.getByRole("combobox", { name: "Reminder 1", exact: true })).toHaveText("2 weeks before")
      await reviewShot(page, "a-reminders-set", theme)

      await dialog.getByRole("button", { name: "Create event" }).click()
      await expect(dialog).toHaveCount(0, { timeout: 20_000 })
      const reminders = seen.writes.find((w) => w.url.endsWith("/new-1/reminders"))
      const body = reminders?.body as { minutes: number[]; email: number[] }
      expect(body.minutes[0]).toBe(14 * 24 * 60)
      expect(body.minutes).toHaveLength(2)
      expect(body.email).toEqual([body.minutes[1]])
    })

    test("default reminders for your own calendar, kept beside another calendar's", async ({ page }, testInfo) => {
      test.setTimeout(180_000)
      const seen = await open(page, testInfo)
      await page.getByRole("button", { name: /^Calendars/ }).click()
      const personal = page.locator("[data-calendars-panel] [data-calendar-row='onecamp']")
      await personal.hover()
      await personal.getByRole("button", { name: "Personal options" }).click()
      await page.getByRole("menuitem", { name: "Default reminders" }).click()
      const dialog = page.getByRole("dialog", { name: "Default reminders" })
      await expect(dialog.getByText("For events in My calendar and your invitations", { exact: false })).toBeVisible({ timeout: 20_000 })
      const events = dialog.locator("[data-default-reminders='timed']")
      await events.getByRole("combobox", { name: "Reminder 1 comes as" }).click()
      await page.getByRole("option", { name: "Email" }).click()
      await reviewShot(page, "a-defaults", theme)
      await dialog.getByRole("button", { name: "Save" }).click()
      await expect(dialog).toHaveCount(0, { timeout: 20_000 })
      const value = savedDefaults(seen)
      expect(value["cal-team"]).toEqual(TEAM)
      expect(value.mine.timed.email).toEqual([value.mine.timed.minutes[0]])
    })

    test("a refused save says why and keeps what was set; no reminder says so; the keyboard reaches each", async ({ page }, testInfo) => {
      test.setTimeout(180_000)
      await open(page, testInfo, () => [], { refuse: true })
      await page.getByRole("button", { name: /^Calendars/ }).click()
      const personal = page.locator("[data-calendars-panel] [data-calendar-row='onecamp']")
      await personal.hover()
      await personal.getByRole("button", { name: "Personal options" }).click()
      await page.getByRole("menuitem", { name: "Default reminders" }).click()
      const dialog = page.getByRole("dialog", { name: "Default reminders" })
      const events = dialog.locator("[data-default-reminders='timed']")
      await expect(events.getByRole("combobox", { name: "Reminder 1", exact: true })).toBeVisible({ timeout: 20_000 })
      // Empty: every reminder removed says so, and one can be added again.
      while ((await events.getByRole("button", { name: "Remove reminder" }).count()) > 0) await events.getByRole("button", { name: "Remove reminder" }).first().click()
      await expect(events.getByText("No reminder")).toBeVisible()
      await expect(events.getByRole("button", { name: "Add a reminder" })).toBeVisible()
      await reviewShot(page, "a-defaults-empty", theme)
      // Focus: the keyboard reaches a reminder's controls, with a visible ring.
      await events.getByRole("button", { name: "Add a reminder" }).click()
      await events.getByRole("combobox", { name: "Reminder 1", exact: true }).focus()
      await page.keyboard.press("Tab")
      const comesAs = events.getByRole("combobox", { name: "Reminder 1 comes as" })
      await expect(comesAs).toBeFocused()
      // Its focus mark is the field's halo (DESIGN-BUILD-114 F1: the inline choice's shadow-none hid it).
      // shadow-none computes to transparent zero shadows, not "none": a halo is a shadow with a colour.
      const shadow = await comesAs.evaluate((el) => getComputedStyle(el).boxShadow)
      const coloured = shadow.split(/,(?![^(]*\))/).some((one) => one.trim() !== "none" && !/rgba\([^)]*,\s*0\)|transparent/.test(one))
      expect(coloured, `a visible focus halo (${shadow})`).toBe(true)
      await reviewShot(page, "a-defaults-focus", theme)
      // Error: the server's fault is said in the dialog, which stays open with what was set.
      await dialog.getByRole("button", { name: "Save" }).click()
      await expect(dialog.getByRole("alert")).toHaveText("Couldn't save those reminders. Try again.")
      await expect(events.getByRole("combobox", { name: "Reminder 1", exact: true })).toBeVisible()
      await reviewShot(page, "a-defaults-error", theme)
    })

    test("the defaults open at once, and a failed read of your preferences says so and tries again", async ({ page }, testInfo) => {
      test.setTimeout(180_000)
      let failing = true
      let reads = 0
      let holding = false
      let letGo = () => {}
      const held = new Promise<void>((resolve) => (letGo = resolve))
      const mine = { timed: { minutes: [30], email: [30] }, all_day: { minutes: [], email: [] } }
      await open(page, testInfo, () => [], {
        failRead: () => failing,
        readHeld: () => {
          reads++
          return holding ? held : undefined
        },
        mine,
      })
      await page.getByRole("button", { name: /^Calendars/ }).click()
      const personal = page.locator("[data-calendars-panel] [data-calendar-row='onecamp']")
      await personal.hover()
      await personal.getByRole("button", { name: "Personal options" }).click()
      await page.getByRole("menuitem", { name: "Default reminders" }).click()
      const dialog = page.getByRole("dialog", { name: "Default reminders" })
      await expect(dialog).toBeVisible({ timeout: 20_000 })
      await expect(dialog.getByRole("button", { name: "Save" })).toBeDisabled()
      await expect(dialog.getByRole("alert")).toHaveText("Your reminders couldn't be read.", { timeout: 20_000 })
      await reviewShot(page, "a-defaults-read-failed", theme)
      // SWR tries a failed read again on its own (V-590): one that landed
      // between failing = false and the click took Try again away under it.
      // From here every read waits, the dialog still saying it failed, so the
      // button stays put for the click; then they all answer the defaults.
      holding = true
      const retry = dialog.getByRole("button", { name: "Try again" })
      await expect(retry).toBeEnabled()
      failing = false
      const before = reads
      await retry.click()
      await expect.poll(() => reads, { message: "Try again reads the preferences again", timeout: 5_000 }).toBeGreaterThan(before)
      letGo()
      // The defaults list is the one read: 30 minutes before, by email.
      const timed = dialog.locator("[data-default-reminders='timed']")
      await expect(timed.getByRole("combobox", { name: "Reminder 1", exact: true })).toContainText("30 minutes before", { timeout: 20_000 })
      await expect(timed.getByRole("combobox", { name: "Reminder 1 comes as" })).toHaveText("Email")
      await expect(dialog.getByRole("alert")).toHaveCount(0)
      await expect(dialog.getByRole("button", { name: "Save" })).toBeEnabled()
    })
  })

  test.describe(`reminders on a phone, ${theme}`, () => {
    test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: theme })

    test("the calendar options set your default reminders in a sheet", async ({ page }, testInfo) => {
      test.setTimeout(180_000)
      const seen = await open(page, testInfo)
      await page.getByRole("button", { name: "Calendar options" }).tap({ timeout: 60_000 })
      await page.getByRole("button", { name: "Default reminders" }).tap()
      const sheet = page.getByRole("dialog", { name: "Default reminders" })
      await expect(sheet.getByText("For events in My calendar and your invitations", { exact: false })).toBeVisible({ timeout: 20_000 })
      // A phone's overlay is a sheet: the screen's width, on its bottom edge, its foot a gutter.
      await animationsSettled(sheet)
      const box = (await sheet.boundingBox())!
      expect(box.width, "the screen's width").toBeGreaterThanOrEqual(389)
      expect(Math.abs(box.y + box.height - 844), "on the bottom edge").toBeLessThanOrEqual(1)
      await footIsGutter(sheet, "the default reminders' sheet")
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)

      const events = sheet.locator("[data-default-reminders='timed']")
      await events.getByRole("combobox", { name: "Reminder 1 comes as" }).tap()
      await page.locator("[data-sheet-panel]").getByRole("option", { name: "Email" }).tap()
      await expect(events.getByRole("combobox", { name: "Reminder 1 comes as" })).toHaveText("Email")
      await reviewShot(page, "a-defaults-sheet", theme)
      await sheet.getByRole("button", { name: "Save" }).tap()
      await expect(sheet).toHaveCount(0, { timeout: 20_000 })
      const value = savedDefaults(seen)
      expect(value["cal-team"]).toEqual(TEAM)
      expect(value.mine.timed.email).toEqual([value.mine.timed.minutes[0]])
    })

    test("the event form's custom reminder fits a phone's sheet", async ({ page }, testInfo) => {
      test.setTimeout(180_000)
      await open(page, testInfo)
      await page.getByRole("button", { name: "New event" }).tap({ timeout: 60_000 })
      const rows = page.locator("[data-event-dialog] [data-form-reminders]")
      await rows.scrollIntoViewIfNeeded()
      // The default's note is never cut (DESIGN-BUILD-114 F5): with no room on the row it drops out whole, and the open menu says it.
      const first = rows.getByRole("combobox", { name: "Reminder 1", exact: true })
      await expect(first).toContainText("10 minutes before")
      const cut = await first.evaluate((el) => {
        const value = el.querySelector<HTMLElement>(":scope > span")!
        const line = value.getBoundingClientRect()
        return [value, ...value.querySelectorAll<HTMLElement>("span")]
          .filter((p) => {
            const r = p.getBoundingClientRect()
            // On the value's one line (a piece wrapped under it is hidden), and clipped or past its end.
            return r.top < line.bottom - 0.5 && (p.scrollWidth > p.clientWidth + 0.5 || r.right > line.right + 0.5)
          })
          .map((p) => p.textContent)
      })
      expect(cut, "no piece of the first reminder shows cut").toEqual([])
      await reviewShot(page, "a-reminder-note", theme)
      await first.tap()
      const menu = page.locator("[data-sheet-panel]")
      await expect(menu.getByText("Your default: 10 minutes before", { exact: true })).toBeVisible()
      await menu.getByRole("option", { name: "Custom…" }).tap()
      const custom = rows.locator("[data-custom-reminder]")
      await expect(custom.getByRole("button", { name: "Set" })).toBeVisible()
      await expect(custom.getByRole("button", { name: "Cancel" })).toBeVisible()
      await custom.scrollIntoViewIfNeeded()
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
      await reviewShot(page, "a-custom-reminder-sheet", theme)
    })
  })
}

test.describe("a new event from anywhere in the app", () => {
  test.use({ viewport: { width: 1280, height: 900 } })

  test("the app's Create event shows your own default reminders, as the calendar's New event does", async ({ page }, testInfo) => {
    test.setTimeout(180_000)
    await open(page, testInfo, () => [], { mine: { timed: { minutes: [30], email: [30] }, all_day: { minutes: [900], email: [] } } })
    // The palette's Create calendar event opens the app's one new-event dialog (UnifiedUIManager), not the calendar's.
    await page.keyboard.press("ControlOrMeta+k")
    const palette = page.getByRole("dialog", { name: "Search, jump, or ask" })
    await expect(palette).toBeVisible({ timeout: 30_000 })
    await palette.locator("[cmdk-input]").fill("Create calendar event")
    await palette.getByRole("option", { name: /^Create calendar event/ }).first().click()
    const dialog = page.locator("[data-event-dialog]")
    await expect(dialog.getByRole("combobox", { name: "Reminder 1", exact: true })).toHaveText("30 minutes before · your default", { timeout: 30_000 })
    await expect(dialog.getByRole("combobox", { name: "Reminder 1 comes as" })).toHaveText("Email")
    // With room, the note shows on the value's line (DESIGN-BUILD-115): toHaveText reads a hidden note too.
    const onLine = await dialog.locator("[data-reminder-note]").evaluate((n) => n.getBoundingClientRect().top < n.parentElement!.getBoundingClientRect().bottom - 0.5)
    expect(onLine, "the note on the value's line at 1280").toBe(true)
  })
})

test.describe("an open grid, live", () => {
  test.use({ viewport: { width: 1280, height: 900 } })

  test("an event changed elsewhere shows without a reload, read once for a burst", async ({ page }, testInfo) => {
    test.setTimeout(180_000)
    let changed = false
    const seen = await open(page, testInfo, () => (changed ? [listed(MOVED, "Pricing walkthrough", 22)] : []))
    await expect(page.locator(`[data-event-uuid="${MOVED}"]`)).toHaveCount(0)
    const before = seen.reads.length
    changed = true
    // Three messages in a burst (one event saved three times): one read.
    await page.evaluate(
      ({ id, from, to }) => {
        for (let i = 0; i < 3; i++) window.dispatchEvent(new CustomEvent("onecamp:calendar-live", { detail: { event_id: id, from, to } }))
      },
      { id: MOVED, from: at(22, 14), to: at(22, 15) },
    )
    await expect(page.locator(`[data-event-uuid="${MOVED}"]`).first()).toBeVisible({ timeout: 20_000 })
    await page.waitForTimeout(800)
    const after = seen.reads.slice(before)
    expect(after.length, "the open week read again").toBeGreaterThan(0)
    expect(new Set(after).size, "each open range read once for the burst").toBe(after.length)
    // A change outside the ranges on screen reads nothing.
    const now = seen.reads.length
    await page.evaluate(() => window.dispatchEvent(new CustomEvent("onecamp:calendar-live", { detail: { event_id: "far", from: "2027-03-01T10:00:00Z", to: "2027-03-01T11:00:00Z" } })))
    await page.waitForTimeout(800)
    expect(seen.reads.length).toBe(now)
  })
})
