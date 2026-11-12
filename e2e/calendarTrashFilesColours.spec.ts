import { expect, test, type Locator, type Page, type Request, type TestInfo } from "@playwright/test"
import { reviewShot, SAM, stubBackend, withStatus, type Answers } from "./stubbedApp"
import { animationsSettled } from "./settled"
import { showsFocusRing } from "./focusRing"
import { footIsGutter } from "./sheetLayout"

// Calendar head B (gcal-1a): Trash, files, place and colours. The reader's own events deleted in the last 30 days
// come back from a Trash (a dialog at 1280, a sheet at 390), on the open grid at once; a place opens a map in a
// new tab; an event carries OneCamp docs and boards, each named by the reader's own read, "No access" for one they
// can't open, added and taken off in the Event Form; and More colours gives an event a colour of its own, kept in
// Your colours, drawn in both themes with its words readable. The backend is stubbed (its HTTP tests are the
// backend's). With SHOTS_DIR set, each state is saved for DESIGN-BUILD-115, and the states and keyboard focus
// DESIGN-BUILD-116 asked for: the Trash reading, empty, failed, older ones failed, a refused restore and its toast;
// the files picker, its empty and failed states, and an upload as it runs; and the focus ring, by the keyboard, on
// Restore, the place, the colour row's +, the pad and a Your colours swatch.
// Head F (V-603, V-642): the Trash's next page starts after its last row, by its deletion and its id, so events deleted
// at once all show; and the Event Form reads an event's times on its own zones' clocks, the reader's beneath.

const NOW = new Date(2026, 9, 21, 10, 0)
const at = (day: number, h: number, m = 0) => new Date(2026, 9, day, h, m).toISOString()
const ME = { ...SAM, user_name: "Sam Rivera" }
const LAUNCH = "0b8a3c1e-1d2f-4a5b-8c7d-9e0f1a2b3c01"
const OLD = "0b8a3c1e-1d2f-4a5b-8c7d-9e0f1a2b3c0a"
const PRICING = "0b8a3c1e-1d2f-4a5b-8c7d-9e0f1a2b3c0b"
const DOC = "9d1c0000-0000-4000-8000-000000000001"
const BOARD = "9d1c0000-0000-4000-8000-000000000003"
const MAPS = "https://www.google.com/maps/search/?api=1&query="
const OWN = "#7a1f5c"
const UPLOADED = "9d1c0000-0000-4000-8000-000000000004"
// The backend's refusal for an instance whose series is still in the trash (business/Calendar Restore).
const REFUSED = "Bring back the repeating event it belongs to first."
const BROKE = withStatus(500, { msg: "Something went wrong" })

const listed = (id: string, title: string, day: number, h: number, more: Record<string, unknown> = {}) => ({
  event_uuid: id,
  event_title: title,
  event_start_time: at(day, h),
  event_end_time: at(day, h + 1),
  event_created_by: ME,
  event_participants: [],
  event_reminders: [10],
  event_reminders_default: true,
  ...more,
})
const launch = () => listed(LAUNCH, "Launch review", 21, 14, { event_hue: "moss", event_location: "Studio, second floor" })

// The server carries to each reader only what they may open (EVLINK head A), so there is no locked chip to draw.
const apiEvent = (files = [{ kind: "doc", uuid: DOC }]) => ({
  id: LAUNCH,
  kind: "event",
  title: "Launch review",
  notes: "",
  location: "Studio, second floor",
  start: { at: at(21, 14), zone: "Europe/London" },
  end: { at: at(21, 15) },
  all_day: false,
  sequence: 3,
  organiser: { user_uuid: ME.user_uuid },
  attendees: [],
  hue: "moss",
  files,
  transparency: "opaque",
  visibility: "default",
})

const trashed = [
  { id: OLD, title: "Old offsite", start: { at: at(23, 9) }, end: { at: at(23, 12) }, all_day: false, hue: "lake", deleted_at: new Date(2026, 9, 19, 16).toISOString(), deleted_by: ME },
  { id: "0b8a3c1e-1d2f-4a5b-8c7d-9e0f1a2b3c0c", title: "Pricing sync", start: { at: at(12, 11) }, end: { at: at(12, 12) }, all_day: false, hue: OWN, deleted_at: new Date(2026, 9, 2, 9).toISOString(), deleted_by: ME },
]
// A full first page (lib/calendar/trash TRASH_PAGE, 50), so the Trash offers older ones.
const fullPage = [
  ...trashed,
  ...Array.from({ length: 48 }, (_, i) => ({
    id: `0b8a3c1e-1d2f-4a5b-8c7d-${String(i).padStart(12, "0")}`,
    title: ["Weekly sync", "Design critique", "1:1 with Priya", "Sprint planning", "Customer call"][i % 5],
    start: { at: at(1 + (i % 9), 9 + (i % 7)) },
    end: { at: at(1 + (i % 9), 10 + (i % 7)) },
    all_day: false,
    hue: ["sky", "lake", "moss", "sun", "berry", "dusk"][i % 6],
    deleted_at: new Date(2026, 9, 1, 12, -30 * i).toISOString(),
    deleted_by: ME,
  })),
]

interface Seen {
  writes: { method: string; url: string; body: unknown }[]
  reads: string[]
}

/**
 * The week of 21 Oct, the trash, the files' reads, the search and the preferences; `own` lists an event in OWN, and
 * `more` answers a call its own way (a trash read that waits or fails, a refused restore).
 */
async function open(page: Page, testInfo: TestInfo, path = "/app/calendar?date=2026-10-21&view=week", own = false, more: Answers = {}): Promise<Seen> {
  const seen: Seen = { writes: [], reads: [] }
  let restored = false
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
      return {
        msg: "ok",
        data: [launch(), ...(restored ? [listed(OLD, "Old offsite", 23, 9, { event_hue: "lake" })] : []), ...(own ? [listed(PRICING, "Pricing sync", 22, 11, { event_hue: OWN })] : [])],
      }
    },
    "/event/getEvent/": { msg: "ok", data: launch() },
    "/calendar/events": (url: URL, request: Request) => {
      const method = request.method()
      if (method !== "GET") seen.writes.push({ method, url: url.pathname, body: request.postDataJSON() })
      if (url.pathname.endsWith("/calendar/events/trash")) return { msg: "ok", data: restored ? trashed.slice(1) : trashed }
      if (url.pathname.endsWith(`/${OLD}/restore`)) {
        restored = true
        return { msg: "ok", data: {} }
      }
      if (method === "POST" && url.pathname.endsWith("/calendar/events")) return { msg: "ok", data: { ...apiEvent([]), id: PRICING, title: "Pricing sync", hue: OWN } }
      if (url.pathname.endsWith("/reminders")) return { msg: "ok", data: { minutes: [10], default: true } }
      return { msg: "ok", data: apiEvent() }
    },
    "/entities": (_url: URL, request: Request) => {
      const refs = (request.postDataJSON() as { refs: Array<{ kind: string; id: string }> }).refs
      return {
        msg: "ok",
        data: refs.map((r) =>
          r.id === DOC
            ? { kind: "doc", id: r.id, access: "ok", data: { title: "Launch brief" } }
            : r.id === BOARD
              ? { kind: "board", id: r.id, access: "ok", data: { title: "Launch plan" } }
              : r.id === UPLOADED
                ? { kind: "doc", id: r.id, access: "ok", data: { title: "Venue floor plan.pdf" } }
                : { kind: r.kind, id: r.id, access: "none" },
        ),
      }
    },
    "/search/unifiedSearch": { msg: "ok", data: { page: [{ type: "board", board: { board_uuid: BOARD, board_title: "Launch plan" } }], has_more: false } },
    "/user/preferences": (url: URL, request: Request) => {
      if (request.method() === "PUT") {
        seen.writes.push({ method: "PUT", url: url.pathname, body: request.postDataJSON() })
        return { msg: "ok" }
      }
      return { msg: "ok", data: { "calendar.recent_colours": ["#e0a030"] } }
    },
    "/calendar/calendars/events": { msg: "ok", data: [], truncated: false },
    "/calendar/calendars": { msg: "ok", data: [{ id: "cal-me", name: "Personal", kind: "personal", access: "manage", mine: true }] },
    "/integration/google-calendar/status": { msg: "ok", data: { isConnected: false } },
    "/user/assignedTaskList": { msg: "ok", data: { user_tasks: [] } },
    "/config/client": { msg: "ok", data: { features: { calendar_repeats: true } } },
    "/event/bookingPages": { msg: "ok", data: [] },
    "/event/suggestTimes": { msg: "ok", data: { suggestions: [] } },
    ...more,
  })
  await page.goto(path, { waitUntil: "domcontentloaded", timeout: 120_000 })
  return seen
}

const wrote = (seen: Seen, method: string, end: string) => seen.writes.find((w) => w.method === method && w.url.endsWith(end))

/** An answer the test lets go of when it has seen what waits for it. */
function held() {
  let go!: (answer: unknown) => void
  const answer = new Promise<unknown>((resolve) => (go = resolve))
  return { answer, go }
}

// Head F (V-642): Launch review planned in New York at 12:30Z, landing in London: 8:30 AM in New York on 21 Oct
// (summer time), 2:30 PM in London, 6:00 PM to 7:00 PM in Kolkata.
const NY_START = "2026-10-21T12:30:00.000Z"
const NY_END = "2026-10-21T13:30:00.000Z"

/** Launch review kept in New York and London, listed and read so; each change it is sent lands in `patches`. */
function inNewYork(patches: unknown[]): Answers {
  const event = { ...apiEvent(), start: { at: NY_START, zone: "America/New_York" }, end: { at: NY_END, zone: "Europe/London" } }
  return {
    "/event/getEvents": { msg: "ok", data: [listed(LAUNCH, "Launch review", 21, 14, { event_start_time: NY_START, event_end_time: NY_END, event_zone: "America/New_York", event_end_zone: "Europe/London" })] },
    [`/calendar/events/${LAUNCH}`]: (url: URL, request: Request) => {
      if (url.pathname.endsWith("/reminders")) return { msg: "ok", data: { minutes: [10], default: true } }
      if (request.method() === "PATCH") patches.push(request.postDataJSON())
      return { msg: "ok", data: event }
    },
  }
}

// Head F (V-603): 53 events in the trash, the last eight of the first page and the three after them deleted at once.
const AT_ONCE = new Date(2026, 8, 30, 12).toISOString()
const firstPage = fullPage.map((e, i) => (i >= 42 ? { ...e, deleted_at: AT_ONCE } : e))
const atOnce = ["Offsite day 1", "Offsite day 2", "Offsite day 3"].map((title, i) => ({
  ...fullPage[2],
  id: `0b8a3c1e-1d2f-4a5b-8c7d-9e0f1a2c00${i}0`,
  title,
  deleted_at: AT_ONCE,
}))

/** The trash answering its first page and, asked after its last row, the three deleted with it; each next read lands in `asked`. */
const pagedTrash = (asked: URLSearchParams[]): Answers => ({
  "/calendar/events/trash": (url: URL) => {
    if (!url.searchParams.has("before")) return { msg: "ok", data: firstPage }
    asked.push(url.searchParams)
    return { msg: "ok", data: atOnce }
  },
})

/** Show older, then the read it sent and every row it brought. */
async function showsTheNextPage(list: Locator, asked: URLSearchParams[], tap: boolean) {
  const rows = list.locator("[data-trash-event]")
  await expect(rows).toHaveCount(50, { timeout: 20_000 })
  const older = list.getByRole("button", { name: "Show older" })
  await older.scrollIntoViewIfNeeded()
  await (tap ? older.tap() : older.click())
  await expect(rows).toHaveCount(53, { timeout: 20_000 })
  expect(asked.map((q) => [q.get("before"), q.get("before_id")])).toEqual([[AT_ONCE, firstPage[49].id]])
  await expect(list.getByRole("button", { name: "Show older" })).toHaveCount(0)
  const last = list.locator(`[data-trash-event="${atOnce[2].id}"]`)
  await last.scrollIntoViewIfNeeded()
  await expect(last).toContainText("Offsite day 3")
}

/** The form's times: Starts on New York's clock, Ends on London's, each naming its zone, and the reader's own beneath. */
async function readsItsOwnZones(form: Locator) {
  const start = form.getByRole("button", { name: /^Start,/ })
  const end = form.getByRole("button", { name: /^End,/ })
  await expect(start).toHaveText(/^Wed 21 Oct · 8:30\sAM EDT$/, { timeout: 20_000 })
  await expect(end).toHaveText(/^Wed 21 Oct · 2:30\sPM GMT\+1$/)
  await expect(form.locator("[data-your-time]")).toHaveText(/^6:00\s*–\s*7:00\sPM your time$/)
  // V-642 F2: a screen reader hears each time with its zone, and the end's with the reader's own time.
  await expect(start).toHaveAccessibleName(/^Start, Wed 21 Oct, 8:30\sAM Eastern Daylight Time$/)
  await expect(end).toHaveAccessibleName(/^End, Wed 21 Oct, 2:30\sPM British Summer Time$/)
  await expect(end).toHaveAccessibleDescription(/^6:00\s*–\s*7:00\sPM your time$/)
  // V-642 F1: with two zones, each zone picker says which end it sets.
  await expect(form.getByText("Starts in", { exact: true })).toBeVisible()
  await expect(form.getByText("Ends in", { exact: true })).toBeVisible()
}

/** 9:00 AM picked for its start is 9:00 AM in New York, the end an hour on in London, as the save sends them. */
async function picksInItsZone(page: Page, form: Locator, save: Locator, patches: unknown[], tap: boolean) {
  const press = (l: Locator) => (tap ? l.tap() : l.click())
  await press(form.getByRole("button", { name: /^Start,/ }))
  const nine = page.getByRole("listbox", { name: "Time" }).getByRole("option", { name: /^9:00\sAM/ })
  await nine.scrollIntoViewIfNeeded()
  await press(nine)
  await expect(form.getByRole("button", { name: /^Start,/ })).toHaveText(/^Wed 21 Oct · 9:00\sAM EDT$/)
  await expect(form.getByRole("button", { name: /^End,/ })).toHaveText(/^Wed 21 Oct · 3:00\sPM GMT\+1$/)
  await expect(form.locator("[data-your-time]")).toHaveText(/^6:30\s*–\s*7:30\sPM your time$/)
  await press(save)
  await expect
    .poll(() => patches.at(-1), { timeout: 20_000 })
    .toMatchObject({ start: { at: "2026-10-21T13:00:00.000Z", zone: "America/New_York" }, end: { at: "2026-10-21T14:00:00.000Z", zone: "Europe/London" } })
}

/** The Trash at 1280: the Calendars panel, its Personal row's options, then Trash. */
async function openTrash(page: Page) {
  await page.getByRole("button", { name: /^Calendars/ }).click()
  const personal = page.locator("[data-calendars-panel] [data-calendar-row='onecamp']")
  await personal.hover()
  await personal.getByRole("button", { name: "Personal options" }).click()
  await page.getByRole("menuitem", { name: "Trash" }).click()
  return page.getByRole("dialog", { name: "Trash" })
}

/** Records the colours the first own-coloured block on the page has as it is first drawn, before any paint. */
async function watchFirstPaint(page: Page) {
  await page.addInitScript(() => {
    new MutationObserver((_, watch) => {
      const el = document.querySelector("[data-hue-block][data-own-hue]")
      if (!el) return
      const cs = getComputedStyle(el)
      ;(window as unknown as { firstOwn: unknown }).firstOwn = { background: cs.backgroundColor, color: cs.color }
      watch.disconnect()
    }).observe(document, { childList: true, subtree: true })
  })
}

/**
 * An own-coloured block paints in its own colour from its first frame (no calendar hue first, no swap), and its
 * words keep AA on its fill as this browser draws them: dark words in the light theme, light ones in the dark.
 */
async function paintsItsOwnColour(page: Page, theme: "light" | "dark") {
  const chip = page.locator(`[data-hue-block][data-own-hue="${OWN}"]`).first()
  await expect(chip).toBeVisible({ timeout: 60_000 })
  const seen = await chip.evaluate((el) => {
    const rgb = (css: string) => {
      const c = document.createElement("canvas")
      c.width = c.height = 1
      const x = c.getContext("2d")!
      x.fillStyle = css
      x.fillRect(0, 0, 1, 1)
      return Array.from(x.getImageData(0, 0, 1, 1).data.slice(0, 3))
    }
    const lum = (v: number[]) => {
      const f = (n: number) => (n / 255 <= 0.03928 ? n / 255 / 12.92 : ((n / 255 + 0.055) / 1.055) ** 2.4)
      return 0.2126 * f(v[0]) + 0.7152 * f(v[1]) + 0.0722 * f(v[2])
    }
    const cs = getComputedStyle(el)
    const ink = lum(rgb(cs.color))
    const fill = lum(rgb(cs.backgroundColor))
    return { ratio: (Math.max(ink, fill) + 0.05) / (Math.min(ink, fill) + 0.05), ink, now: { background: cs.backgroundColor, color: cs.color }, first: (window as unknown as { firstOwn?: unknown }).firstOwn }
  })
  expect(seen.first, "its colours as it was first drawn").toEqual(seen.now)
  expect(seen.ratio, `its words on its fill (${JSON.stringify(seen.now)})`).toBeGreaterThanOrEqual(4.5)
  if (theme === "light") expect(seen.ink).toBeLessThan(0.2)
  else expect(seen.ink).toBeGreaterThan(0.4)
}

for (const theme of ["light", "dark"] as const) {
  test.describe(`trash, files, place and colours at 1280, ${theme}`, () => {
    test.use({ viewport: { width: 1280, height: 900 }, colorScheme: theme })

    test("the Trash restores your event back onto the grid, and Show jumps to its day", async ({ page }, testInfo) => {
      test.setTimeout(180_000)
      const seen = await open(page, testInfo)
      await expect(page.locator(`[data-event-uuid="${LAUNCH}"]`).first()).toBeVisible({ timeout: 60_000 })
      const dialog = await openTrash(page)
      const rows = dialog.locator("[data-trash-event]")
      await expect(rows).toHaveCount(2, { timeout: 20_000 })
      await expect(rows.first()).toContainText("Old offsite")
      await expect(rows.first()).toContainText(/Deleted .* by Sam Rivera/)
      await expect(rows.nth(1).locator(`[data-own-hue="${OWN}"]`)).toHaveCount(1)
      await reviewShot(page, "b-trash", theme)
      await showsFocusRing(page, dialog.getByRole("button", { name: "Restore Old offsite" }), "Restore")
      await reviewShot(page, "b-focus-restore", theme)
      const reads = seen.reads.length
      await dialog.getByRole("button", { name: "Restore Old offsite" }).click()
      await expect(dialog.locator(`[data-trash-event="${OLD}"]`)).toHaveCount(0, { timeout: 20_000 })
      expect(wrote(seen, "POST", `/calendar/events/${OLD}/restore`)).toBeTruthy()
      // Back on the open grid at once: the week reads again and draws it.
      await expect(page.locator(`[data-event-uuid="${OLD}"]`).first()).toBeVisible({ timeout: 20_000 })
      expect(seen.reads.length).toBeGreaterThan(reads)
      // The shared toast says it twice, its title and its live region's words: find the toast, then its Show.
      const toast = page.locator(".toast-root").filter({ hasText: "Restored “Old offsite”" })
      await expect(toast).toBeVisible()
      await toast.getByRole("button", { name: "Show" }).click()
      await expect(dialog).toHaveCount(0)
      await expect(page).toHaveURL(/date=2026-10-23/)
    })

    test("the Trash says it's reading, then a read that failed with Try again, and then that it's empty", async ({ page }, testInfo) => {
      test.setTimeout(180_000)
      const first = held()
      let reads = 0
      await open(page, testInfo, undefined, false, { "/calendar/events/trash": () => (++reads === 1 ? first.answer : { msg: "ok", data: [] }) })
      await expect(page.locator(`[data-event-uuid="${LAUNCH}"]`).first()).toBeVisible({ timeout: 60_000 })
      const dialog = await openTrash(page)
      await expect(dialog.locator("[data-trash-loading]")).toBeVisible({ timeout: 20_000 })
      await reviewShot(page, "b-trash-loading", theme)
      first.go(BROKE)
      const tryAgain = dialog.getByRole("button", { name: "Try again" })
      await expect(tryAgain).toBeVisible({ timeout: 20_000 })
      await expect(dialog.locator("[data-trash-loading]")).toHaveCount(0)
      await reviewShot(page, "b-trash-failed", theme)
      await tryAgain.click()
      await expect(dialog.getByText("Nothing in the trash")).toBeVisible({ timeout: 20_000 })
      expect(reads).toBe(2)
      await reviewShot(page, "b-trash-empty", theme)
    })

    test("older ones that couldn't load say so under the list, a refused restore says why on its row, and a restore says so", async ({ page }, testInfo) => {
      test.setTimeout(180_000)
      await open(page, testInfo, undefined, false, {
        "/calendar/events/trash": (url: URL) => (url.searchParams.has("before") ? BROKE : { msg: "ok", data: fullPage }),
        [`/calendar/events/${OLD}/restore`]: withStatus(400, { msg: REFUSED }),
      })
      await expect(page.locator(`[data-event-uuid="${LAUNCH}"]`).first()).toBeVisible({ timeout: 60_000 })
      const dialog = await openTrash(page)
      const rows = dialog.locator("[data-trash-event]")
      await expect(rows).toHaveCount(50, { timeout: 20_000 })
      const older = dialog.getByRole("button", { name: "Show older" })
      await older.scrollIntoViewIfNeeded()
      await older.click()
      const failedOlder = dialog.locator("[data-load-failed-row]")
      await expect(failedOlder).toContainText("Couldn't load older events", { timeout: 20_000 })
      await expect(failedOlder.getByRole("button", { name: "Try again" })).toBeVisible()
      await expect(older).toHaveCount(0)
      await failedOlder.scrollIntoViewIfNeeded()
      await reviewShot(page, "b-trash-older-failed", theme)
      const old = dialog.locator(`[data-trash-event="${OLD}"]`)
      await old.scrollIntoViewIfNeeded()
      await old.getByRole("button", { name: "Restore Old offsite" }).click()
      await expect(old.getByRole("alert")).toHaveText(REFUSED, { timeout: 20_000 })
      await expect(rows).toHaveCount(50)
      await reviewShot(page, "b-trash-refused", theme)
      await dialog.getByRole("button", { name: "Restore Pricing sync" }).click()
      const toast = page.locator(".toast-root").filter({ hasText: "Restored “Pricing sync”" })
      await expect(toast.getByRole("button", { name: "Show" })).toBeVisible({ timeout: 20_000 })
      await expect(rows).toHaveCount(49)
      await reviewShot(page, "b-trash-restored", theme)
    })

    test("a place opens a map; files read as the reader may, and an edit adds one and takes one off", async ({ page }, testInfo) => {
      test.setTimeout(180_000)
      const seen = await open(page, testInfo)
      await page.locator(`[data-event-uuid="${LAUNCH}"]`).first().click()
      const card = page.locator("[data-event-card]")
      const place = card.locator("[data-card-place] a")
      await expect(place).toHaveAttribute("href", `${MAPS}Studio%2C%20second%20floor`, { timeout: 20_000 })
      await expect(place).toHaveAttribute("target", "_blank")
      await expect(place).toHaveAttribute("rel", "noopener noreferrer")
      await reviewShot(page, "b-place-card", theme)
      await showsFocusRing(page, place, "The place", card.getByRole("button", { name: "Close" }))
      await reviewShot(page, "b-focus-place", theme)
      await card.getByRole("button", { name: "Open details" }).click()
      const view = page.locator("[data-event-view]")
      await expect(view.locator("[data-event-place] a")).toHaveAttribute("href", `${MAPS}Studio%2C%20second%20floor`, { timeout: 20_000 })
      const files = view.locator("[data-event-files]")
      await expect(files.getByRole("link", { name: "Page: Launch brief" })).toBeVisible({ timeout: 20_000 })
      await expect(files.locator("[data-entity-chip]")).toHaveCount(1)
      await reviewShot(page, "b-files-read", theme)

      await page.getByRole("button", { name: "Edit event" }).click()
      const row = page.locator("[data-event-edit] [data-form-files]")
      await expect(row.getByRole("link", { name: "Page: Launch brief" })).toBeVisible({ timeout: 20_000 })
      await row.getByRole("button", { name: "Add from OneCamp" }).click()
      await page.getByPlaceholder("Search docs, boards and tasks…").fill("plan")
      await expect(page.getByRole("button", { name: /Launch plan/ })).toBeVisible({ timeout: 20_000 })
      await reviewShot(page, "b-files-picker", theme)
      await page.getByRole("button", { name: /Launch plan/ }).click()
      await expect(row.getByRole("link", { name: "Board: Launch plan" })).toBeVisible({ timeout: 20_000 })
      await row.getByRole("button", { name: "Remove Launch brief" }).click()
      await expect(row.locator(`[data-file="${DOC}"]`)).toHaveCount(0)
      await reviewShot(page, "b-files-edit", theme)
      await page.locator("[data-panel-actions]").getByRole("button", { name: "Save" }).click()
      await expect.poll(() => wrote(seen, "POST", `/calendar/events/${LAUNCH}/files`)?.body, { timeout: 20_000 }).toEqual({ kind: "board", uuid: BOARD })
      expect(wrote(seen, "DELETE", `/calendar/events/${LAUNCH}/files/doc/${DOC}`)).toBeTruthy()
    })

    test("Add from OneCamp says when nothing matches and when the search failed, and Upload says it runs", async ({ page }, testInfo) => {
      test.setTimeout(180_000)
      const upload = held()
      await open(page, testInfo, undefined, false, {
        "/search/unifiedSearch": (_url: URL, request: Request) =>
          (request.postDataJSON() as { global_search_text: string }).global_search_text === "offsite" ? BROKE : { msg: "ok", data: { page: [], has_more: false } },
        "/doc/files": () => upload.answer,
      })
      await page.locator(`[data-event-uuid="${LAUNCH}"]`).first().click()
      await page.locator("[data-event-card]").getByRole("button", { name: "Open details" }).click()
      await expect(page.locator("[data-event-view] [data-event-files]").getByRole("link", { name: "Page: Launch brief" })).toBeVisible({ timeout: 20_000 })
      await page.getByRole("button", { name: "Edit event" }).click()
      const row = page.locator("[data-event-edit] [data-form-files]")
      await expect(row.getByRole("link", { name: "Page: Launch brief" })).toBeVisible({ timeout: 20_000 })
      await row.getByRole("button", { name: "Add from OneCamp" }).click()
      const picker = page.getByRole("dialog", { name: "Add from OneCamp" })
      const search = picker.getByPlaceholder("Search docs, boards and tasks…")
      await search.fill("roadmap")
      await expect(picker.getByText("No docs, boards or tasks found")).toBeVisible({ timeout: 20_000 })
      await reviewShot(page, "b-files-picker-empty", theme)
      await search.fill("offsite")
      await expect(picker.getByRole("button", { name: "Try again" })).toBeVisible({ timeout: 20_000 })
      await expect(picker.getByText("No docs, boards or tasks found")).toHaveCount(0)
      await reviewShot(page, "b-files-picker-failed", theme)
      // Upload from the device: the button says what it carries while it runs, and the file joins the event after.
      const chooser = page.waitForEvent("filechooser")
      await row.getByRole("button", { name: "Upload" }).click()
      await (await chooser).setFiles({ name: "Venue floor plan.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n") })
      await expect(row.getByRole("button", { name: /Uploading Venue floor plan\.pdf/ })).toBeVisible({ timeout: 20_000 })
      await reviewShot(page, "b-files-uploading", theme)
      upload.go({ msg: "ok", data: { uuid: UPLOADED, title: "Venue floor plan.pdf", kind: "file" } })
      await expect(row.getByRole("button", { name: "Upload" })).toBeVisible({ timeout: 20_000 })
      await expect(row.locator(`[data-file="${UPLOADED}"]`)).toHaveCount(1)
    })

    test("by the keyboard, the colour row's +, the pad and a Your colours swatch each draw a focus ring", async ({ page }, testInfo) => {
      test.setTimeout(180_000)
      await open(page, testInfo)
      await expect(page.locator(`[data-event-uuid="${LAUNCH}"]`).first()).toBeVisible({ timeout: 60_000 })
      await page.getByRole("button", { name: "New event" }).click()
      const dialog = page.locator("[data-event-dialog]")
      await dialog.getByRole("textbox", { name: "Title" }).fill("Pricing sync")
      const more = dialog.getByRole("button", { name: "More colours" })
      await more.scrollIntoViewIfNeeded()
      await showsFocusRing(page, more, "The colour row's +", dialog.locator("[data-form-hue] [role='radio'][aria-checked='true']"))
      await reviewShot(page, "b-focus-more-colours", theme)
      await page.keyboard.press("Enter")
      const pop = page.locator("[data-colour-popover]")
      const pad = pop.getByRole("slider", { name: "Colour" })
      await expect(pad).toBeVisible({ timeout: 20_000 })
      await showsFocusRing(page, pad, "The pad")
      await reviewShot(page, "b-focus-pad", theme)
      const swatch = pop.getByRole("group", { name: "Your colours" }).getByRole("button", { name: "#e0a030" })
      await expect(swatch).toBeVisible({ timeout: 20_000 })
      await showsFocusRing(page, swatch, "A Your colours swatch")
      await reviewShot(page, "b-focus-your-colour", theme)
    })

    test("More colours: pick by the pad or the hex, see it clamped, save it, and it draws in both themes", async ({ page }, testInfo) => {
      test.setTimeout(180_000)
      const seen = await open(page, testInfo)
      await expect(page.locator(`[data-event-uuid="${LAUNCH}"]`).first()).toBeVisible({ timeout: 60_000 })
      await page.getByRole("button", { name: "New event" }).click()
      const dialog = page.locator("[data-event-dialog]")
      await dialog.getByRole("textbox", { name: "Title" }).fill("Pricing sync")
      const more = dialog.getByRole("button", { name: "More colours" })
      await more.scrollIntoViewIfNeeded()
      await more.click()
      const pop = page.locator("[data-colour-popover]")
      const hex = pop.getByRole("textbox", { name: "Hex" })
      await expect(hex).toBeVisible({ timeout: 20_000 })
      await expect(pop.getByRole("group", { name: "Your colours" }).getByRole("button", { name: "#e0a030" })).toBeVisible()
      // The pad moves by the arrow keys, and the hex field follows.
      const before = await hex.inputValue()
      await pop.getByRole("slider", { name: "Colour" }).focus()
      await page.keyboard.press("ArrowRight")
      await expect(hex).not.toHaveValue(before)
      await hex.fill("#fafafa")
      await expect(pop.locator("[data-clamped]")).toContainText("light screen")
      await reviewShot(page, "b-clamped-near-white", theme)
      await hex.fill("#0a0a0a")
      await expect(pop.locator("[data-clamped]")).toContainText("dark screen")
      await reviewShot(page, "b-clamped-near-black", theme)
      await hex.fill("#7a1f")
      await expect(pop.getByRole("alert")).toHaveText("Write it as # and six digits or letters a to f, like #3b7ddd.")
      await expect(pop.getByRole("button", { name: "Save" })).toBeDisabled()
      await hex.fill(OWN.toUpperCase())
      await expect(pop.locator("[data-preview='dark']")).toContainText("Pricing sync")
      await reviewShot(page, "b-more-colours", theme)
      await pop.getByRole("button", { name: "Save" }).click()
      await expect(dialog.getByRole("radio", { name: `Your colour ${OWN}` })).toHaveAttribute("aria-checked", "true")
      await expect.poll(() => (wrote(seen, "PUT", "/user/preferences/calendar.recent_colours")?.body as { value?: unknown })?.value, { timeout: 20_000 }).toEqual([OWN, "#e0a030"])
      await reviewShot(page, "b-colour-row", theme)
      await dialog.getByRole("button", { name: "Create event" }).click()
      await expect(dialog).toHaveCount(0, { timeout: 20_000 })
      expect((wrote(seen, "POST", "/calendar/events")?.body as { hue?: string }).hue).toBe(OWN)
    })

    test("an event in its own colour paints in it from its first frame, in this theme's cut, after a reload too", async ({ page }, testInfo) => {
      test.setTimeout(180_000)
      await watchFirstPaint(page)
      await open(page, testInfo, "/app/calendar?date=2026-10-21&view=week", true)
      await paintsItsOwnColour(page, theme)
      await page.reload({ waitUntil: "domcontentloaded" })
      await paintsItsOwnColour(page, theme)
      await reviewShot(page, "b-week-chips", theme)
    })
  })

  test.describe(`trash, files, place and colours on a phone, ${theme}`, () => {
    test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: theme })

    test("the calendar options open the Trash in a sheet, Done at its foot", async ({ page }, testInfo) => {
      test.setTimeout(180_000)
      const seen = await open(page, testInfo)
      await page.getByRole("button", { name: "Calendar options" }).tap({ timeout: 60_000 })
      await page.getByRole("button", { name: "Trash" }).tap()
      const sheet = page.getByRole("dialog", { name: "Trash" })
      await expect(sheet.locator("[data-trash-event]")).toHaveCount(2, { timeout: 20_000 })
      await animationsSettled(sheet)
      const box = (await sheet.boundingBox())!
      expect(box.width, "the screen's width").toBeGreaterThanOrEqual(389)
      expect(Math.abs(box.y + box.height - 844), "on the bottom edge").toBeLessThanOrEqual(1)
      await footIsGutter(sheet, "the trash's sheet")
      await expect(sheet.getByRole("button", { name: "Done" })).toBeInViewport()
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
      await reviewShot(page, "b-trash", theme)
      await sheet.getByRole("button", { name: "Restore Old offsite" }).tap()
      await expect(sheet.locator(`[data-trash-event="${OLD}"]`)).toHaveCount(0, { timeout: 20_000 })
      expect(wrote(seen, "POST", `/calendar/events/${OLD}/restore`)).toBeTruthy()
    })

    test("the Trash's sheet says a read that failed, and a refused restore on its row", async ({ page }, testInfo) => {
      test.setTimeout(180_000)
      let reads = 0
      await open(page, testInfo, undefined, false, {
        "/calendar/events/trash": () => (++reads === 1 ? BROKE : { msg: "ok", data: trashed }),
        [`/calendar/events/${OLD}/restore`]: withStatus(400, { msg: REFUSED }),
      })
      await page.getByRole("button", { name: "Calendar options" }).tap({ timeout: 60_000 })
      await page.getByRole("button", { name: "Trash" }).tap()
      const sheet = page.getByRole("dialog", { name: "Trash" })
      const tryAgain = sheet.getByRole("button", { name: "Try again" })
      await expect(tryAgain).toBeVisible({ timeout: 20_000 })
      await animationsSettled(sheet)
      await reviewShot(page, "b-trash-failed", theme)
      await tryAgain.tap()
      await expect(sheet.locator("[data-trash-event]")).toHaveCount(2, { timeout: 20_000 })
      const old = sheet.locator(`[data-trash-event="${OLD}"]`)
      await old.getByRole("button", { name: "Restore Old offsite" }).tap()
      await expect(old.getByRole("alert")).toHaveText(REFUSED, { timeout: 20_000 })
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
      await reviewShot(page, "b-trash-refused", theme)
    })

    test("the event's page reads its place and files, and its edit adds a file from a sheet", async ({ page }, testInfo) => {
      test.setTimeout(180_000)
      const seen = await open(page, testInfo, `/app/calendar/event/${LAUNCH}`)
      await expect(page.getByRole("heading", { name: "Launch review" })).toBeVisible({ timeout: 60_000 })
      await expect(page.locator("[data-event-place] a")).toHaveAttribute("href", `${MAPS}Studio%2C%20second%20floor`, { timeout: 20_000 })
      const files = page.locator("[data-event-files]")
      await expect(files.getByRole("link", { name: "Page: Launch brief" })).toBeVisible({ timeout: 20_000 })
      await files.scrollIntoViewIfNeeded()
      await reviewShot(page, "b-files-read", theme)
      await page.getByRole("button", { name: "Edit event" }).tap()
      const row = page.locator("[data-event-edit] [data-form-files]")
      await row.getByRole("button", { name: "Add from OneCamp" }).tap({ timeout: 20_000 })
      const sheet = page.locator("[data-files-sheet]")
      await expect(sheet).toBeVisible()
      await sheet.getByPlaceholder("Search docs, boards and tasks…").fill("plan")
      await expect(sheet.getByRole("button", { name: /Launch plan/ })).toBeVisible({ timeout: 20_000 })
      await reviewShot(page, "b-files-picker", theme)
      await sheet.getByRole("button", { name: /Launch plan/ }).tap()
      await expect(row.getByRole("link", { name: "Board: Launch plan" })).toBeVisible({ timeout: 20_000 })
      await row.scrollIntoViewIfNeeded()
      await reviewShot(page, "b-files-edit", theme)
      await page.getByRole("button", { name: "Save" }).tap()
      await expect.poll(() => wrote(seen, "POST", `/calendar/events/${LAUNCH}/files`)?.body, { timeout: 20_000 }).toEqual({ kind: "board", uuid: BOARD })
    })

    test("an event in its own colour paints in it from its first frame on a phone", async ({ page }, testInfo) => {
      test.setTimeout(180_000)
      await watchFirstPaint(page)
      await open(page, testInfo, "/app/calendar?date=2026-10-22&view=day", true)
      await paintsItsOwnColour(page, theme)
      await reviewShot(page, "b-day-chip", theme)
    })

    test("More colours is a sheet with Save pinned at its foot", async ({ page }, testInfo) => {
      test.setTimeout(180_000)
      await open(page, testInfo, `/app/calendar/event/${LAUNCH}`)
      await expect(page.getByRole("heading", { name: "Launch review" })).toBeVisible({ timeout: 60_000 })
      await page.getByRole("button", { name: "Edit event" }).tap()
      const more = page.locator("[data-event-edit]").getByRole("button", { name: "More colours" })
      await more.scrollIntoViewIfNeeded()
      await more.tap({ timeout: 20_000 })
      const sheet = page.getByRole("dialog", { name: "More colours" })
      await expect(sheet.getByRole("textbox", { name: "Hex" })).toBeVisible({ timeout: 20_000 })
      await animationsSettled(sheet)
      const box = (await sheet.boundingBox())!
      expect(box.width, "the screen's width").toBeGreaterThanOrEqual(389)
      await footIsGutter(sheet, "More colours' sheet")
      await expect(sheet.getByRole("button", { name: "Save" })).toBeInViewport()
      await sheet.getByRole("textbox", { name: "Hex" }).fill(OWN)
      await reviewShot(page, "b-more-colours", theme)
      await sheet.getByRole("button", { name: "Save" }).tap()
      await expect(sheet).toHaveCount(0)
      await expect(page.locator("[data-event-edit]").getByRole("radio", { name: `Your colour ${OWN}` })).toHaveAttribute("aria-checked", "true")
    })
  })
}

// Head F (V-603, V-642), pinned to a reader in Kolkata, and one whose zone is the event's.
for (const theme of ["light", "dark"] as const) {
  test.describe(`the Trash's pages and the form's zones at 1280, ${theme}`, () => {
    test.use({ viewport: { width: 1280, height: 900 }, colorScheme: theme, timezoneId: "Asia/Kolkata" })

    test("the Trash's next page starts after its last row, so events deleted at once all show", async ({ page }, testInfo) => {
      test.setTimeout(180_000)
      const asked: URLSearchParams[] = []
      await open(page, testInfo, undefined, false, pagedTrash(asked))
      await expect(page.locator(`[data-event-uuid="${LAUNCH}"]`).first()).toBeVisible({ timeout: 60_000 })
      await showsTheNextPage(await openTrash(page), asked, false)
      await reviewShot(page, "f-trash-second-page", theme)
    })

    test("the form reads a New York event's times in New York and London, yours beneath, and picks on New York's clock", async ({ page }, testInfo) => {
      test.setTimeout(180_000)
      const patches: unknown[] = []
      await open(page, testInfo, undefined, false, inNewYork(patches))
      await page.locator(`[data-event-uuid="${LAUNCH}"]`).first().click({ timeout: 60_000 })
      await page.locator("[data-event-card]").getByRole("button", { name: "Open details" }).click()
      await page.getByRole("button", { name: "Edit event" }).click()
      const form = page.locator("[data-event-edit]")
      await readsItsOwnZones(form)
      await reviewShot(page, "f-form-zones", theme)
      await picksInItsZone(page, form, page.locator("[data-panel-actions]").getByRole("button", { name: "Save" }), patches, false)
    })
  })

  test.describe(`the form's zones at 1280 for a reader in the event's zone, ${theme}`, () => {
    test.use({ viewport: { width: 1280, height: 900 }, colorScheme: theme, timezoneId: "Europe/London" })

    test("an event kept in the reader's own zone says no time of theirs", async ({ page }, testInfo) => {
      test.setTimeout(180_000)
      await open(page, testInfo)
      await page.locator(`[data-event-uuid="${LAUNCH}"]`).first().click({ timeout: 60_000 })
      await page.locator("[data-event-card]").getByRole("button", { name: "Open details" }).click()
      await page.getByRole("button", { name: "Edit event" }).click()
      const form = page.locator("[data-event-edit]")
      await expect(form.getByRole("button", { name: /^Start,/ })).toHaveText(/^Wed 21 Oct · \d{1,2}:\d\d\s[AP]M$/, { timeout: 20_000 })
      await expect(form.locator("[data-your-time]")).toHaveCount(0)
      await expect(form.getByText("Starts in", { exact: true })).toHaveCount(0)
      await reviewShot(page, "f-form-same-zone", theme)
    })
  })

  test.describe(`the Trash's pages and the form's zones on a phone, ${theme}`, () => {
    test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: theme, timezoneId: "Asia/Kolkata" })

    test("the Trash's sheet shows the next page after its last row", async ({ page }, testInfo) => {
      test.setTimeout(180_000)
      const asked: URLSearchParams[] = []
      await open(page, testInfo, undefined, false, pagedTrash(asked))
      await page.getByRole("button", { name: "Calendar options" }).tap({ timeout: 60_000 })
      await page.getByRole("button", { name: "Trash" }).tap()
      const sheet = page.getByRole("dialog", { name: "Trash" })
      await showsTheNextPage(sheet, asked, true)
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
      await reviewShot(page, "f-trash-second-page", theme)
    })

    test("the event's page edits its times on New York's and London's clocks, yours beneath, from a sheet", async ({ page }, testInfo) => {
      test.setTimeout(180_000)
      const patches: unknown[] = []
      await open(page, testInfo, `/app/calendar/event/${LAUNCH}`, false, inNewYork(patches))
      await expect(page.getByRole("heading", { name: "Launch review" })).toBeVisible({ timeout: 60_000 })
      await page.getByRole("button", { name: "Edit event" }).tap()
      const form = page.locator("[data-event-edit]")
      await readsItsOwnZones(form)
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
      await reviewShot(page, "f-form-zones", theme)
      await form.getByRole("button", { name: /^Start,/ }).tap()
      const times = page.getByRole("listbox", { name: "Time" })
      await expect(times).toBeVisible()
      const picker = page.locator("[data-overlay='float']").filter({ has: times })
      // V-642 F1: the sheet names the clock its times are on.
      await expect(picker.locator("[data-picker-clock]")).toHaveText("Times in Eastern Daylight Time")
      await animationsSettled(picker)
      const box = (await picker.boundingBox())!
      expect(Math.abs(box.y + box.height - 844), "a sheet on the bottom edge").toBeLessThanOrEqual(1)
      await reviewShot(page, "f-form-zones-picker", theme)
      await page.keyboard.press("Escape")
      await expect(times).toHaveCount(0)
      await picksInItsZone(page, form, page.getByRole("button", { name: "Save" }), patches, true)
    })
  })

  test.describe(`the form's zones on a phone for a reader in the event's zone, ${theme}`, () => {
    test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: theme, timezoneId: "Europe/London" })

    test("an event kept in the reader's own zone says no time of theirs", async ({ page }, testInfo) => {
      test.setTimeout(180_000)
      await open(page, testInfo, `/app/calendar/event/${LAUNCH}`)
      await expect(page.getByRole("heading", { name: "Launch review" })).toBeVisible({ timeout: 60_000 })
      await page.getByRole("button", { name: "Edit event" }).tap()
      const form = page.locator("[data-event-edit]")
      await expect(form.getByRole("button", { name: /^Start,/ })).toHaveText(/^Wed 21 Oct · \d{1,2}:\d\d\s[AP]M$/, { timeout: 20_000 })
      await expect(form.locator("[data-your-time]")).toHaveCount(0)
      await expect(form.getByText("Starts in", { exact: true })).toHaveCount(0)
      await reviewShot(page, "f-form-same-zone", theme)
    })
  })
}
