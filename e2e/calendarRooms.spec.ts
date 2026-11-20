import { expect, test, type Page, type Request, type TestInfo } from "@playwright/test"

import { reviewShotInThemes, SAM, stubBackend, withStatus, type Answers } from "./stubbedApp"

// Rooms (gcal-6): an admin keeps the Resource Directory (add, change, retire
// softly through the shared confirm, a room's busy blocks); a member books
// the rooms free for the event's slot from the form, Find a time never offers
// a time a chosen room is booked, a refusal is said at the Rooms row with the
// other event's title only when the server sent it, and the event shows its
// rooms. The rooms routes are stubbed here (backend rooms head 1 isn't LIVE).

const NOW = new Date(2026, 9, 21, 10, 0)
const at = (day: number, h: number, m = 0) => new Date(2026, 9, day, h, m).toISOString()
const ME = { ...SAM, user_name: "Sam Rivera" }
const ADMIN = { ...ME, user_is_admin: true }
const LAUNCH = "0b8a3c1e-1d2f-4a5b-8c7d-9e0f1a2b3c01"
/** One event of the launch review as a weekly series (an instance id, D-CAL-6). */
const LAUNCH_DAY = `${LAUNCH}_20261021T130000Z`
const ATLAS = { id: "r-atlas", name: "Atlas", building: "North wing", floor: "2", capacity: 8, features: ["Screen", "Whiteboard"], retired: false }
const BOOTH = { id: "r-booth", name: "Booth", building: "North wing", floor: "1", capacity: 2, features: ["Phone"], retired: false }

const views = [
  { name: "1280", viewport: { width: 1280, height: 900 }, phone: false },
  { name: "390", viewport: { width: 390, height: 844 }, phone: true },
] as const

const listed = () => ({
  event_uuid: LAUNCH,
  event_title: "Launch review",
  event_start_time: at(21, 14),
  event_end_time: at(21, 15),
  event_description: "",
  event_created_by: ME,
  event_participants: [],
  event_reminders: [10],
  event_reminders_default: true,
})

const apiEvent = () => ({
  id: LAUNCH,
  kind: "event",
  title: "Launch review",
  notes: "",
  location: "",
  start: { at: at(21, 14), zone: "Europe/London" },
  end: { at: at(21, 15) },
  all_day: false,
  sequence: 3,
  organiser: { user_uuid: ME.user_uuid },
  attendees: [],
  rooms: [ATLAS],
  transparency: "opaque",
  visibility: "default",
  guests_can_modify: false,
  guests_can_invite: true,
  guests_can_see_guests: true,
})

type Write = { method: string; url: string; body: unknown }

/** The rooms routes as head 1 answers them: the live list, the free ones, a room's busy blocks, and the admin's writes. */
function roomsServer(writes: Write[], start = [ATLAS, BOOTH]) {
  let rooms = start
  return (url: URL, request: Request) => {
    const method = request.method()
    const path = url.pathname
    if (method !== "GET") writes.push({ method, url: `${path}${url.search}`, body: request.postDataJSON() })
    else writes.push({ method, url: `${path}${url.search}`, body: null })
    if (path.endsWith("/retire")) {
      rooms = rooms.filter((r) => !path.includes(`/${r.id}/`))
      return { msg: "ok", data: { ...ATLAS, retired: true } }
    }
    if (path.includes("/admin/calendar/rooms") && method === "POST") {
      const made = { ...BOOTH, ...(request.postDataJSON() as object), id: "r-new" }
      rooms = [...rooms, made]
      return { msg: "ok", data: made }
    }
    if (path.endsWith("/bookings")) {
      return { msg: "ok", data: { room: ATLAS, bookings: [{ start: at(21, 14), end: at(21, 15), busy: true }, { start: at(22, 9), end: at(22, 10), busy: true, event_id: "e2", title: "Design crit" }] } }
    }
    return { msg: "ok", data: rooms }
  }
}

async function open(page: Page, testInfo: TestInfo, path: string, more: Answers = {}, profile: object = ME) {
  const writes: Write[] = []
  await page.clock.setFixedTime(NOW)
  await page.addInitScript(() => {
    try {
      localStorage.setItem("oc_keys_tip_seen", "1")
    } catch {
      /* storage blocked */
    }
  })
  await stubBackend(page, testInfo, {
    "/user/profile": { msg: "ok", data: profile },
    "/event/getEvents": { msg: "ok", data: [listed()] },
    "/event/getEvent/": { msg: "ok", data: listed() },
    "/calendar/rooms": roomsServer(writes),
    "/calendar/events": (url: URL, request: Request) => {
      if (request.method() !== "GET") writes.push({ method: request.method(), url: url.pathname, body: request.postDataJSON() })
      if (request.method() === "POST" && url.pathname.endsWith("/calendar/events")) return { msg: "ok", data: { ...apiEvent(), id: "new-1" } }
      if (url.pathname.endsWith("/reminders")) return { msg: "ok", data: { minutes: [10], default: true } }
      return { msg: "ok", data: apiEvent() }
    },
    "/event/suggestTimes": (_url: URL, request: Request) => {
      writes.push({ method: "POST", url: "/event/suggestTimes", body: request.postDataJSON() })
      return { msg: "ok", data: { suggestions: [] } }
    },
    "/integration/google-calendar/status": { msg: "ok", data: { isConnected: false } },
    "/user/assignedTaskList": { msg: "ok", data: { user_tasks: [] } },
    "/config/client": { msg: "ok", data: { features: { calendar_repeats: true } } },
    "/event/bookingPages": { msg: "ok", data: [] },
    ...more,
  })
  await page.goto(path, { waitUntil: "domcontentloaded", timeout: 120_000 })
  return writes
}

const shot = (page: Page, name: string) => reviewShotInThemes(page, name)

for (const view of views) {
  test.describe(`rooms at ${view.name}`, () => {
    test.use({ viewport: view.viewport, ...(view.phone ? { isMobile: true, hasTouch: true } : {}) })

    test("an admin keeps the rooms: listed, added, a room's bookings, and retired softly", async ({ page }, testInfo) => {
      test.setTimeout(180_000)
      const writes = await open(page, testInfo, "/app/admin?tab=rooms", {}, ADMIN)
      const atlas = page.getByRole("listitem", { name: "Atlas" })
      await expect(atlas).toBeVisible({ timeout: 60_000 })
      await expect(atlas).toContainText("North wing · Floor 2 · Seats 8")
      await shot(page, `rooms-directory-${view.name}`)

      await page.getByRole("button", { name: "Add a room" }).first().click()
      const add = page.getByRole("dialog", { name: "Add a room" })
      await add.getByLabel("Name").fill("Studio")
      await add.getByLabel("Seats").fill("12")
      await add.getByLabel("Features").fill("Screen, Camera")
      if (view.phone) await expect(add).toHaveAttribute("data-v3-sheet", "")
      await expect(add.getByRole("button", { name: "Add room" })).toBeInViewport()
      await shot(page, `rooms-add-${view.name}`)
      await add.getByRole("button", { name: "Add room" }).click()
      await expect(page.getByRole("listitem", { name: "Studio" })).toBeVisible()
      expect(writes.find((w) => w.method === "POST" && w.url === "/admin/calendar/rooms")?.body).toEqual({
        name: "Studio",
        building: "",
        floor: "",
        capacity: 12,
        features: ["Screen", "Camera"],
      })

      await atlas.getByRole("button", { name: "Bookings for Atlas" }).click()
      const bookings = page.getByRole("dialog", { name: "Atlas bookings" })
      await expect(bookings.getByRole("listitem")).toHaveCount(2)
      await expect(bookings.getByRole("listitem").first()).toContainText("Busy")
      await expect(bookings.getByRole("listitem").last()).toContainText("Design crit")
      // Dated the house way, as the form says a day (N7).
      await expect(bookings.getByRole("listitem").first()).toContainText("Wed 21 Oct")
      await shot(page, `rooms-bookings-${view.name}`)
      await page.keyboard.press("Escape")
      await expect(bookings).toHaveCount(0)

      await atlas.getByRole("button", { name: "Retire Atlas" }).click()
      const confirm = page.getByRole("alertdialog")
      await expect(confirm).toContainText("Retire the room Atlas?")
      await confirm.getByRole("button", { name: "Retire room" }).click()
      await expect(page.getByRole("listitem", { name: "Atlas" })).toHaveCount(0)
      expect(writes.some((w) => w.method === "POST" && w.url === "/admin/calendar/rooms/r-atlas/retire")).toBe(true)
    })

    test("the event shows its rooms, and its edit books another free one", async ({ page }, testInfo) => {
      test.setTimeout(180_000)
      let refuse = true
      const writes = await open(page, testInfo, `/app/calendar/event/${LAUNCH}`, {
        "/calendar/events": (url: URL, request: Request) => {
          if (request.method() !== "GET") writes.push({ method: request.method(), url: url.pathname, body: request.postDataJSON() })
          if (url.pathname.endsWith("/reminders")) return { msg: "ok", data: { minutes: [10], default: true } }
          if (request.method() === "PATCH" && refuse) {
            refuse = false
            // The server's own words for a writer who may not read the other event (B314 RoomTakenError).
            return withStatus(409, { code: "room_taken", msg: "Booth is booked on 2026-10-21.", data: { room_id: "r-booth", room: "Booth", date: "2026-10-21" } })
          }
          return { msg: "ok", data: apiEvent() }
        },
      })
      await expect(page.getByRole("heading", { name: "Launch review" })).toBeVisible({ timeout: 60_000 })
      await expect(page.locator("[data-event-rooms]")).toContainText("Atlas")
      const edit = page.getByRole("button", { name: "Edit event" })
      if (view.phone) await edit.tap()
      else await edit.click()
      const form = page.locator("[data-event-edit]")
      const rooms = form.locator("[data-form-rooms]")
      await rooms.scrollIntoViewIfNeeded()
      await expect(rooms.getByRole("button", { name: /Atlas/ })).toHaveAttribute("aria-pressed", "true", { timeout: 20_000 })
      const free = writes.find((w) => w.url.startsWith("/calendar/rooms/free"))
      expect(free?.url).toContain("from=")
      // Rooms are free, so the directory is never read (gcal-6 S2).
      expect(writes.filter((w) => w.url === "/calendar/rooms")).toHaveLength(0)
      await rooms.getByRole("button", { name: /Atlas/ }).click()
      await rooms.getByRole("button", { name: /Booth/ }).click()
      await shot(page, `rooms-edit-${view.name}`)
      // Save sits with the panel's actions, outside the form, as the other event specs press it.
      const save = page.getByRole("button", { name: "Save", exact: true })
      if (view.phone) await save.tap()
      else await save.click()
      // Taken: said once in the server's words, with the way forward, at the row.
      const alert = rooms.getByRole("alert")
      await expect(alert).toContainText("Booth is booked on 2026-10-21.", { timeout: 20_000 })
      await expect(alert).toContainText("Pick another room or time.")
      await expect(alert).not.toContainText("Booked for")
      await shot(page, `rooms-taken-edit-${view.name}`)
      if (view.phone) await save.tap()
      else await save.click()
      await expect.poll(() => writes.filter((w) => w.method === "PATCH").length, { timeout: 20_000 }).toBe(2)
      expect(writes.filter((w) => w.method === "PATCH").at(-1)?.body).toMatchObject({ rooms: ["r-booth"] })
    })

    for (const who of [{ name: "an admin", profile: ADMIN }, { name: "a member", profile: ME }]) {
      test(`a workspace with no rooms yet says so at the Rooms row, to ${who.name}`, async ({ page }, testInfo) => {
        test.setTimeout(180_000)
        const reads: Write[] = []
        const roomless = { ...apiEvent(), rooms: [] }
        await open(
          page,
          testInfo,
          `/app/calendar/event/${LAUNCH}`,
          {
            "/calendar/rooms": roomsServer(reads, []),
            "/calendar/events": (url: URL) => ({ msg: "ok", data: url.pathname.endsWith("/reminders") ? { minutes: [10], default: true } : roomless }),
          },
          who.profile,
        )
        await expect(page.getByRole("heading", { name: "Launch review" })).toBeVisible({ timeout: 60_000 })
        const edit = page.getByRole("button", { name: "Edit event" })
        if (view.phone) await edit.tap()
        else await edit.click()
        const rooms = page.locator("[data-event-edit] [data-form-rooms]")
        await rooms.scrollIntoViewIfNeeded()
        await expect(rooms).toContainText("No rooms yet.", { timeout: 20_000 })
        await expect(rooms).not.toContainText("No room is free then.")
        const add = rooms.getByRole("link", { name: "Add rooms" })
        if (who.profile === ADMIN) {
          await expect(add).toHaveAttribute("href", "/app/admin?tab=rooms")
          // Inside the form's sheet, and a finger's 44px on a phone.
          const [link, row] = [await add.boundingBox(), await rooms.boundingBox()]
          expect(link!.x + link!.width).toBeLessThanOrEqual(row!.x + row!.width + 0.5)
          if (view.phone) expect(link!.height).toBeGreaterThanOrEqual(44)
        } else {
          await expect(rooms).toContainText("No rooms yet. An admin adds them in Settings, Rooms.")
          await expect(add).toHaveCount(0)
          const [note, row] = [await rooms.locator("p").first().boundingBox(), await rooms.boundingBox()]
          expect(note!.x + note!.width).toBeLessThanOrEqual(row!.x + row!.width + 0.5)
        }
        // One read of the directory, beside the free rooms' read; none per render.
        expect(reads.filter((r) => r.url === "/calendar/rooms")).toHaveLength(1)
        if (who.profile === ADMIN || view.phone) await shot(page, `rooms-none-yet-${who.profile === ADMIN ? "admin" : "member"}-${view.name}`)
      })
    }

    test("rooms changed on one event of a series are asked for this and following or all, never this event alone", async ({ page }, testInfo) => {
      test.setTimeout(180_000)
      const series = { ...apiEvent(), id: LAUNCH_DAY, recurrence: { rule: "FREQ=WEEKLY;BYDAY=WE" } }
      const writes = await open(page, testInfo, `/app/calendar/event/${LAUNCH_DAY}`, {
        "/calendar/events": (url: URL, request: Request) => {
          if (request.method() !== "GET") writes.push({ method: request.method(), url: url.pathname, body: request.postDataJSON() })
          if (url.pathname.endsWith("/reminders")) return { msg: "ok", data: { minutes: [10], default: true } }
          return { msg: "ok", data: series }
        },
      })
      await expect(page.getByRole("heading", { name: "Launch review" })).toBeVisible({ timeout: 60_000 })
      const edit = page.getByRole("button", { name: "Edit event" })
      if (view.phone) await edit.tap()
      else await edit.click()
      const rooms = page.locator("[data-event-edit]").locator("[data-form-rooms]")
      await rooms.scrollIntoViewIfNeeded()
      await expect(rooms.getByRole("button", { name: /Atlas/ })).toHaveAttribute("aria-pressed", "true", { timeout: 20_000 })
      await rooms.getByRole("button", { name: /Booth/ }).click()
      const save = page.getByRole("button", { name: "Save", exact: true })
      if (view.phone) await save.tap()
      else await save.click()
      // A series books its rooms for every event (head 1 refuses rooms at "this"), so "This event" isn't offered.
      const ask = page.getByRole("dialog", { name: "Change a repeating event" })
      await expect(ask).toContainText("A series books its rooms for every event.", { timeout: 20_000 })
      await expect(ask.getByRole("radio")).toHaveCount(2)
      await expect(ask.getByRole("radio", { name: "This event" })).toHaveCount(0)
      await expect(ask.getByRole("radio", { name: "This and following events" })).toHaveAttribute("aria-checked", "true")
      await shot(page, `rooms-instance-scope-${view.name}`)
      const go = ask.getByRole("button", { name: "Save" })
      if (view.phone) await go.tap()
      else await go.click()
      await expect.poll(() => writes.find((w) => w.method === "PATCH")?.body, { timeout: 20_000 }).toMatchObject({ scope: "following", rooms: ["r-atlas", "r-booth"] })
    })
  })
}

test.describe("rooms in a new event at 1280", () => {
  test.use({ viewport: { width: 1280, height: 900 } })

  test("a new event books a free room, Find a time passes it, and a taken room is said at the row", async ({ page }, testInfo) => {
    test.setTimeout(180_000)
    let refuse = true
    const writes = await open(page, testInfo, "/app/calendar?date=2026-10-21&view=week", {
      "/calendar/events": (url: URL, request: Request) => {
        if (request.method() === "POST" && url.pathname.endsWith("/calendar/events")) {
          writes.push({ method: "POST", url: url.pathname, body: request.postDataJSON() })
          if (refuse) {
            refuse = false
            return withStatus(409, { code: "room_taken", msg: "Atlas is booked on 2026-10-21 (Design crit).", data: { room_id: "r-atlas", room: "Atlas", date: "2026-10-21", event_id: "e2", title: "Design crit" } })
          }
          return { msg: "ok", data: { ...apiEvent(), id: "new-1" } }
        }
        return { msg: "ok", data: apiEvent() }
      },
    })
    await expect(page.locator(`[data-event-uuid="${LAUNCH}"]`).first()).toBeVisible({ timeout: 60_000 })
    await page.getByRole("button", { name: "New event" }).click()
    const dialog = page.locator("[data-event-dialog]")
    await dialog.getByRole("textbox", { name: "Title" }).fill("Design crit prep")
    const rooms = dialog.locator("[data-form-rooms]")
    await rooms.scrollIntoViewIfNeeded()
    await rooms.getByRole("button", { name: /Atlas/ }).click()
    await expect(rooms.getByRole("button", { name: /Atlas/ })).toHaveAttribute("aria-pressed", "true")
    await expect.poll(() => writes.filter((w) => w.url === "/event/suggestTimes").at(-1)?.body).toMatchObject({ rooms: ["r-atlas"] })
    await shot(page, "rooms-new-event-1280")
    await dialog.getByRole("button", { name: "Create event" }).click()
    const alert = rooms.getByRole("alert")
    // The server's msg names the other event to someone who may read it: said once, with the way forward.
    await expect(alert).toContainText("Atlas is booked on 2026-10-21 (Design crit).")
    await expect(alert).toContainText("Pick another room or time.")
    await expect(alert).not.toContainText("Booked for")
    await shot(page, "rooms-taken-1280")
    expect(writes.find((w) => w.method === "POST" && w.url.endsWith("/calendar/events"))?.body).toMatchObject({ rooms: ["r-atlas"] })
    await rooms.getByRole("button", { name: /Atlas/ }).click()
    await rooms.getByRole("button", { name: /Booth/ }).click()
    await dialog.getByRole("button", { name: "Create event" }).click()
    await expect(dialog).toHaveCount(0, { timeout: 20_000 })
    expect(writes.filter((w) => w.method === "POST" && w.url.endsWith("/calendar/events")).at(-1)?.body).toMatchObject({ rooms: ["r-booth"] })
  })
})
